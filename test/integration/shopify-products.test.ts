import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { ShopifyClient } from "@/lib/shopify/client";
import { saveShopifyCredentials } from "@/lib/shopify/credentials";
import { enqueueDueProductSyncs, PRODUCTS_JOB, requestProductSync, syncProducts } from "@/lib/shopify/products";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Shopify falso: devolve as páginas de produtos na ordem. */
function fakeShopify(pages: Array<Array<{ id: string; title: string; status: string }>>) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    shop: "x.myshopify.com",
    graphql: async (_q: string, vars: Record<string, unknown>) => {
      const i = calls.length;
      calls.push(vars);
      return { products: { nodes: pages[i] ?? [], pageInfo: { hasNextPage: i + 1 < pages.length, endCursor: `c${i + 1}` } } };
    },
  } as unknown as ShopifyClient;
  return { client, calls };
}

const gid = (n: number) => `gid://shopify/Product/${n}${randomUUID().slice(0, 6)}`;

describe("catálogo da loja (banco real)", () => {
  it("cria, atualiza e desativa produtos; nada é apagado", async () => {
    const { brand } = await seedBrand(prisma);
    const [a, b, c] = [gid(1), gid(2), gid(3)];
    const first = fakeShopify([[{ id: a, title: "Kit Adulto", status: "ACTIVE" }], [{ id: b, title: "Kit Kids", status: "ACTIVE" }, { id: c, title: "Antigo", status: "DRAFT" }]]);
    expect(await syncProducts(prisma, brand.id, first.client)).toEqual({ seen: 3, created: 3, updated: 0, deactivated: 0 });
    expect(first.calls[1]).toEqual({ after: "c1" });
    const rows = await prisma.product.findMany({ where: { brandId: brand.id }, orderBy: { title: "asc" } });
    expect(rows.map((r) => [r.title, r.active])).toEqual([["Antigo", false], ["Kit Adulto", true], ["Kit Kids", true]]);

    // Kit Kids sumiu da loja e Kit Adulto mudou de nome: desativa e atualiza, sem apagar.
    const second = fakeShopify([[{ id: a, title: "Kit Adulto VermeFree", status: "ACTIVE" }, { id: c, title: "Antigo", status: "DRAFT" }]]);
    expect(await syncProducts(prisma, brand.id, second.client)).toEqual({ seen: 2, created: 0, updated: 1, deactivated: 1 });
    expect(await prisma.product.count({ where: { brandId: brand.id } })).toBe(3);
    expect(await prisma.product.findFirstOrThrow({ where: { brandId: brand.id, shopifyId: b } })).toMatchObject({ active: false });
    expect(await prisma.product.findFirstOrThrow({ where: { brandId: brand.id, shopifyId: a } })).toMatchObject({ title: "Kit Adulto VermeFree" });
  });

  it("agenda uma vez por dia por loja conectada; pedido manual só para quem conecta lojas", async () => {
    const { brand } = await seedBrand(prisma);
    await saveShopifyCredentials(prisma, { brandId: brand.id, shop: `${brand.slug}.myshopify.com`, clientId: "t", clientSecret: "w" }, randomBytes(32));
    const now = new Date("2026-10-11T12:00:00Z");
    await enqueueDueProductSyncs(prisma, now);
    await enqueueDueProductSyncs(prisma, new Date("2026-10-11T18:00:00Z"));
    expect(await prisma.job.count({ where: { brandId: brand.id, type: PRODUCTS_JOB } })).toBe(1);

    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    await expect(requestProductSync(prisma, await loadActor(prisma, id), brand.id, now)).rejects.toThrow(/Sem permissão/);
    const sa = randomUUID();
    await prisma.user.create({ data: { id: sa, email: `${sa}@x.com`, name: "S", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
    expect(await requestProductSync(prisma, await loadActor(prisma, sa), brand.id, now)).toBe(true);
    expect(await requestProductSync(prisma, await loadActor(prisma, sa), brand.id, now)).toBe(false);
  });
});
