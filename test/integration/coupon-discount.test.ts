import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { changeCouponDiscount, DISCOUNT_BY_CODE_QUERY, DISCOUNT_UPDATE_MUTATION } from "@/lib/coupons/discount";
import type { ShopifyClient } from "@/lib/shopify/client";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Shopify falso (D-REALSTORE): grava as chamadas e responde conforme a consulta. */
function fakeShopify(opts: { typename?: string; found?: boolean; userErrors?: { message: string }[] } = {}) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const client = {
    shop: "x",
    graphql: async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (query === DISCOUNT_BY_CODE_QUERY)
        return { codeDiscountNodeByCode: opts.found === false ? null : { id: "gid://shopify/DiscountCodeNode/77", codeDiscount: { __typename: opts.typename ?? "DiscountCodeBasic" } } };
      return { discountCodeBasicUpdate: { codeDiscountNode: opts.userErrors?.length ? null : { id: String(variables.id) }, userErrors: opts.userErrors ?? [] } };
    },
  } as unknown as ShopifyClient;
  return { clientFor: async () => client, calls };
}

async function setup(shopifyId: string | null, role: "GESTAO" | "PAGAMENTO" = "GESTAO") {
  const s = await seedBrand(prisma);
  await prisma.coupon.update({ where: { id: s.coupon.id }, data: { shopifyId, discountBps: 500 } });
  const uid = randomUUID();
  await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: role, roleGrants: { create: { role, brandId: s.brand.id } } } });
  await prisma.couponAssignment.create({ data: { brandId: s.brand.id, couponId: s.coupon.id, creatorId: s.creator.id, validFrom: new Date("2026-01-01"), createdById: uid, confirmedAt: new Date(), confirmedById: uid } });
  return { ...s, actor: (await loadActor(prisma, uid))! };
}

describe("desconto do cupom da creator (D-RATEDISCOUNT, banco real)", () => {
  it("muda na Shopify (só o valor, combinável) e depois no banco, com auditoria", async () => {
    const s = await setup("gid://shopify/DiscountCodeNode/9");
    const shop = fakeShopify();
    expect(await changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 1000 }, shop.clientFor)).toEqual({ code: s.coupon.code, changed: true });
    expect(shop.calls).toHaveLength(1);
    expect(shop.calls[0]).toMatchObject({
      query: DISCOUNT_UPDATE_MUTATION,
      variables: { id: "gid://shopify/DiscountCodeNode/9", input: { customerGets: { value: { percentage: 0.1 } }, combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true } } },
    });
    expect((shop.calls[0]!.variables.input as { customerGets: object }).customerGets).not.toHaveProperty("items");
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).discountBps).toBe(1000);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: "coupon.discount", entityId: s.coupon.id } })).toMatchObject({ before: { discountBps: 500 }, after: { discountBps: 1000 } });

    // Mesmo valor: nada vai à Shopify.
    expect((await changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 1000 }, shop.clientFor)).changed).toBe(false);
    expect(shop.calls).toHaveLength(1);
  });

  it("cupom do app antigo sem id da Shopify é achado pelo código, e o id fica gravado", async () => {
    const s = await setup(null);
    const shop = fakeShopify();
    await changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 750 }, shop.clientFor);
    expect(shop.calls.map((c) => c.query)).toEqual([DISCOUNT_BY_CODE_QUERY, DISCOUNT_UPDATE_MUTATION]);
    expect(shop.calls[0]!.variables).toEqual({ code: s.coupon.code });
    expect(await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).toMatchObject({ discountBps: 750, shopifyId: "gid://shopify/DiscountCodeNode/77" });
  });

  it("recusa sem mexer no banco: fora da faixa, sem permissão, não achado, outro tipo, Shopify recusou", async () => {
    const s = await setup(null);
    const keep = async () => expect((await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).discountBps).toBe(500);
    await expect(changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 5001 }, fakeShopify().clientFor)).rejects.toThrow(/50%/);
    await expect(changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 1000 }, fakeShopify({ found: false }).clientFor)).rejects.toThrow(/não foi encontrado/);
    await expect(changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 1000 }, fakeShopify({ typename: "DiscountCodeFreeShipping" }).clientFor)).rejects.toThrow(/não é de porcentagem/);
    await expect(changeCouponDiscount(prisma, s.actor, { creatorId: s.creator.id, discountBps: 1000 }, fakeShopify({ userErrors: [{ message: "nope" }] }).clientFor)).rejects.toThrow(/Shopify recusou: nope/);
    await keep();
    const p = await setup("gid://shopify/DiscountCodeNode/9", "PAGAMENTO");
    await expect(changeCouponDiscount(prisma, p.actor, { creatorId: p.creator.id, discountBps: 1000 }, fakeShopify().clientFor)).rejects.toThrow(/Sem permissão/);
  });
});
