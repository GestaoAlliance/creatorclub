import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { COUPON_CREATE_MUTATION, createCouponInShopify } from "@/lib/coupons/create";
import { ShopifyError, type ShopifyClient } from "@/lib/shopify/client";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Shopify falso: nunca toca a loja real (D-REALSTORE). Grava as chamadas e responde o que o teste mandar. */
function fakeShopify(reply: () => unknown) {
  const calls: { query: string; variables: unknown }[] = [];
  const client = {
    shop: "x",
    graphql: async (query: string, variables: unknown) => {
      calls.push({ query, variables });
      return reply();
    },
  } as unknown as ShopifyClient;
  return { clientFor: async () => client, calls };
}

const ok = () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: [] } });

async function permutaCreator() {
  const a = await seedBrand(prisma);
  const t = await prisma.contractTemplate.create({ data: { brandId: a.brand.id, key: `ugc-${letters(4)}`, name: "UGC permuta", releaseMinCents: null, months: 3 } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { contractTemplateId: t.id } });
  return a;
}

describe("criar cupom na Shopify pela ficha (D-COUPONCREATE, banco real, Shopify falso)", () => {
  it("cria na Shopify combinável, grava o cupom ligado à creator e taxa 0% na permuta", async () => {
    const a = await permutaCreator();
    const actor = await userWith("GESTAO", a.brand.id);
    const fake = fakeShopify(ok);
    const now = new Date("2026-10-10T15:00:00Z");
    const code = letters(6).toLowerCase();
    const r = await createCouponInShopify(prisma, actor, { creatorId: a.creator.id, code, discountBps: 1000 }, fake.clientFor, now);
    expect(r.code).toBe(code.toUpperCase());

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.query).toBe(COUPON_CREATE_MUTATION);
    expect(fake.calls[0]!.variables).toMatchObject({
      input: {
        code: code.toUpperCase(),
        startsAt: now.toISOString(),
        context: { all: "ALL" },
        customerGets: { value: { percentage: 0.1 }, items: { all: true } },
        combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      },
    });

    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { id: r.couponId }, include: { assignments: true } });
    expect(coupon).toMatchObject({ kind: "CREATOR", discountBps: 1000, shopifyId: "gid://shopify/DiscountCodeNode/1", classifiedById: actor.userId });
    expect(coupon.assignments).toHaveLength(1);
    expect(coupon.assignments[0]).toMatchObject({ creatorId: a.creator.id, confirmedById: actor.userId, validTo: null });
    const policies = await prisma.commissionPolicy.findMany({ where: { creatorId: a.creator.id } });
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({ rateBps: 0, confirmedById: actor.userId });
    expect(await prisma.auditLog.count({ where: { action: "coupon.created_in_shopify", entityId: r.couponId } })).toBe(1);

    // Segundo cupom: já tem taxa, não cria outra.
    await createCouponInShopify(prisma, actor, { creatorId: a.creator.id, code: letters(6), discountBps: 500 }, fakeShopify(ok).clientFor, now);
    expect(await prisma.commissionPolicy.count({ where: { creatorId: a.creator.id } })).toBe(1);
  });

  it("recusa antes de chamar a Shopify: sem permissão, código inválido ou já usado, desconto fora, sem taxa fora da permuta, desligada", async () => {
    const a = await seedBrand(prisma);
    const fake = fakeShopify(ok);
    const gestao = await userWith("GESTAO", a.brand.id);
    const call = (actor: typeof gestao | null, code: string, discountBps = 500) =>
      createCouponInShopify(prisma, actor, { creatorId: a.creator.id, code, discountBps }, fake.clientFor);

    await expect(call(await userWith("PAGAMENTO", a.brand.id), "ABC")).rejects.toThrow(/Sem permissão/);
    await expect(call(await userWith("GESTAO", (await seedBrand(prisma)).brand.id), "ABC")).rejects.toThrow(/Sem permissão/);
    await expect(call(gestao, "ABC")).rejects.toThrow(/Defina a taxa/);
    await prisma.commissionPolicy.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, rateBps: 1500, validFrom: new Date("2026-01-01T00:00:00Z"), confirmedAt: new Date(), confirmedById: "x" } });
    await expect(call(gestao, "ABC1")).rejects.toThrow(/só letras/);
    await expect(call(gestao, "ABCDEFGHI")).rejects.toThrow(/só letras/);
    await expect(call(gestao, "ABC", 0)).rejects.toThrow(/entre/);
    await expect(call(gestao, "ABC", 5001)).rejects.toThrow(/entre/);
    await prisma.creator.update({ where: { id: a.creator.id }, data: { status: "DEACTIVATED" } });
    await expect(call(gestao, "ABC")).rejects.toThrow(/desligada/);
    expect(fake.calls).toHaveLength(0);
  });

  it("código que já existe no banco não chega à Shopify", async () => {
    const a = await permutaCreator();
    const code = letters(5);
    await prisma.coupon.create({ data: { brandId: a.brand.id, code, kind: "PROMO", classifiedAt: new Date(), classifiedById: "seed" } });
    const fake = fakeShopify(ok);
    await expect(createCouponInShopify(prisma, await userWith("SUPER_ADMIN", null), { creatorId: a.creator.id, code, discountBps: 500 }, fake.clientFor)).rejects.toThrow(/já existe nesta marca/);
    expect(fake.calls).toHaveLength(0);
  });

  it("erro da Shopify não grava nada e vira mensagem clara", async () => {
    const a = await permutaCreator();
    const sa = await userWith("SUPER_ADMIN", null);
    const run = (reply: () => unknown) => createCouponInShopify(prisma, sa, { creatorId: a.creator.id, code: letters(6), discountBps: 500 }, fakeShopify(reply).clientFor);

    await expect(run(() => ({ discountCodeBasicCreate: { codeDiscountNode: null, userErrors: [{ field: ["code"], code: "TAKEN", message: "Code must be unique. Please try a different code." }] } }))).rejects.toThrow(/já existe na loja/);
    await expect(run(() => ({ discountCodeBasicCreate: { codeDiscountNode: null, userErrors: [{ field: ["startsAt"], code: "INVALID", message: "Starts at is invalid" }] } }))).rejects.toThrow(/A Shopify recusou: Starts at is invalid/);
    await expect(run(() => { throw new ShopifyError("Shopify recusou o acesso (403): token inválido ou sem permissão.", false); })).rejects.toThrow(/write_discounts/);
    await expect(run(() => { throw new ShopifyError("Shopify respondeu 500.", false); })).rejects.toThrow(/respondeu 500/);

    expect(await prisma.coupon.count({ where: { brandId: a.brand.id, kind: "CREATOR", shopifyId: { not: null } } })).toBe(0);
    expect(await prisma.commissionPolicy.count({ where: { creatorId: a.creator.id } })).toBe(0);
  });
});
