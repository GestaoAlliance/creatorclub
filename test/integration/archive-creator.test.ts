import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { DISCOUNT_UPDATE_MUTATION } from "@/lib/coupons/discount";
import { archiveCreator, unarchiveCreator } from "@/lib/creators/archive";
import { listCreators, setCreatorStatus } from "@/lib/creators/profile";
import { searchCreators } from "@/lib/creators/search";
import type { ShopifyClient } from "@/lib/shopify/client";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Shopify falso (D-REALSTORE): grava as chamadas. */
function fakeShopify(userErrors: { message: string }[] = []) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const client = {
    shop: "x",
    graphql: async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      return { discountCodeBasicUpdate: { codeDiscountNode: userErrors.length ? null : { id: String(variables.id) }, userErrors } };
    },
  } as unknown as ShopifyClient;
  return { clientFor: async () => client, calls };
}

async function setup(role: "GESTAO" | "PAGAMENTO" = "GESTAO") {
  const s = await seedBrand(prisma);
  await prisma.coupon.update({ where: { id: s.coupon.id }, data: { shopifyId: "gid://shopify/DiscountCodeNode/9" } });
  const uid = randomUUID();
  await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: role, roleGrants: { create: { role, brandId: s.brand.id } } } });
  await prisma.couponAssignment.create({ data: { brandId: s.brand.id, couponId: s.coupon.id, creatorId: s.creator.id, validFrom: new Date("2026-01-01"), createdById: uid, confirmedAt: new Date(), confirmedById: uid } });
  return { ...s, actor: (await loadActor(prisma, uid))! };
}

describe("arquivar creator (D-ARCHIVECREATOR, banco real)", () => {
  it("encerra o cupom na Shopify, some da lista e da busca, fica desligada; desarquivar reabre", async () => {
    const s = await setup();
    const name = (await prisma.creatorAccount.findUniqueOrThrow({ where: { id: s.account.id } })).name;
    const refused = fakeShopify([{ message: "nope" }]);
    await expect(archiveCreator(prisma, s.actor, s.creator.id, refused.clientFor)).rejects.toThrow(/Shopify recusou/);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).archivedAt).toBeNull(); // nada mudou

    const shop = fakeShopify();
    const now = new Date("2026-10-27T15:00:00Z");
    await archiveCreator(prisma, s.actor, s.creator.id, shop.clientFor, now);
    expect(shop.calls.at(-1)).toMatchObject({
      query: DISCOUNT_UPDATE_MUTATION,
      variables: { id: "gid://shopify/DiscountCodeNode/9", input: { endsAt: now.toISOString(), combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true } } },
    });
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).toMatchObject({ status: "DEACTIVATED", archivedAt: now, archivedById: s.actor.userId });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).active).toBe(false);
    expect((await listCreators(prisma, s.actor, s.brand.id)).map((c) => c.id)).not.toContain(s.creator.id);
    expect((await listCreators(prisma, s.actor, s.brand.id, true)).map((c) => c.id)).toEqual([s.creator.id]);
    expect((await searchCreators(prisma, s.actor, name)).map((c) => c.id)).not.toContain(s.creator.id);
    await expect(setCreatorStatus(prisma, s.actor, s.creator.id, "ACTIVE")).rejects.toThrow(/desarquive/);

    await unarchiveCreator(prisma, s.actor, s.creator.id, shop.clientFor);
    expect(shop.calls.at(-1)!.variables).toMatchObject({ input: { endsAt: null } });
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).toMatchObject({ status: "INACTIVE", archivedAt: null });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).active).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: s.creator.id, action: { in: ["creator.archive", "creator.unarchive"] } } })).toBe(2);
  });

  it("só quem edita creators arquiva; trava do banco", async () => {
    const p = await setup("PAGAMENTO");
    await expect(archiveCreator(prisma, p.actor, p.creator.id, fakeShopify().clientFor)).rejects.toThrow(/Sem permissão/);
    await expectDbError(prisma.creator.update({ where: { id: p.creator.id }, data: { archivedAt: new Date(), archivedById: "x" } }), /Creator_archived/);
  });
});
