import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { OLIST_API, type OlistFetcher } from "@/lib/olist/client";
import { enqueueDueOlistStock, OLIST_STOCK_JOB, runStockAlerts, syncOlistStock } from "@/lib/olist/stock";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { kitProducts } from "@/lib/shipments/kits";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Olist falso (D-REALSTORE: nunca o real): saldo por SKU. */
const olist = (stock: Record<string, number>): OlistFetcher => async (url, init) => {
  const params = new URLSearchParams(init.body);
  const method = url.replace(`${OLIST_API}/`, "").replace(".php", "");
  const reply =
    method === "produtos.pesquisa"
      ? params.get("pesquisa")! in stock
        ? { status: "OK", produtos: [{ produto: { id: params.get("pesquisa"), codigo: params.get("pesquisa") } }] }
        : { status: "Erro", codigo_erro: "20", erros: [{ erro: "A consulta não retornou registros" }] }
      : { status: "OK", produto: { saldo: stock[params.get("id")!] } };
  return { ok: true, status: 200, text: async () => JSON.stringify({ retorno: reply }) };
};

describe("estoque pelo Olist (D-OLIST, banco real)", () => {
  it("lê o saldo pelo SKU; zerado fica 'sem estoque'; SKU que não existe fica anotado; alerta de estoque baixo uma vez por dia", async () => {
    const s = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: s.brand.id }, data: { whatsappInstance: "botanika" } });
    const mk = (title: string, sku: string | null) => prisma.product.create({ data: { brandId: s.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title, sku, kitOption: true } });
    const [whey, tri, hair] = [await mk("Whey", "80.1.8"), await mk("Tri[Mg]", "80.1.1"), await mk("Hair", null)];

    expect(await syncOlistStock(prisma, s.brand.id, { token: null })).toEqual({ read: 0, missing: 0 }); // sem token: nada
    expect(await syncOlistStock(prisma, s.brand.id, { token: "tok", fetcher: olist({ "80.1.8": 12, "80.1.1": 0 }) })).toEqual({ read: 2, missing: 1 });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: whey.id } })).toMatchObject({ stockQty: 12, stockError: null });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: hair.id } })).toMatchObject({ stockQty: null, stockError: "Produto sem SKU na Shopify." });
    const products = await kitProducts(prisma, s.brand.id);
    expect(products.find((p) => p.id === tri.id)?.outOfStock).toBe(true);
    expect(products.find((p) => p.id === whey.id)?.outOfStock).toBe(false);
    expect(products.find((p) => p.id === hair.id)?.outOfStock).toBe(false); // sem leitura: segue disponível

    // Alerta (20 ou menos): Envio e Gestão, uma vez por dia.
    for (const role of ["ENVIO", "GESTAO", "PAGAMENTO"] as const) {
      const id = randomUUID();
      await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, phone: `55319${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`, roleGrants: { create: { role, brandId: s.brand.id } } } });
    }
    const sent: WhatsAppMessage[] = [];
    const at = new Date("2026-11-03T13:00:00Z");
    await runStockAlerts(prisma, async (m) => void sent.push(m), "https://x.test", at);
    await runStockAlerts(prisma, async (m) => void sent.push(m), "https://x.test", new Date(at.getTime() + 3_600_000));
    const mine = sent.filter((m) => m.brand === s.brand.name);
    expect(mine).toHaveLength(2);
    expect(mine[0]!.text).toContain("• Tri[Mg]: sem estoque");
    expect(mine[0]!.text).toContain("• Whey: 12 unidades");

    // Agenda a leitura só para marca com token, uma vez a cada 30 minutos.
    const env = { OLIST_TOKENS: JSON.stringify({ [s.brand.slug]: "a".repeat(64) }) };
    expect(await enqueueDueOlistStock(prisma, at, env)).toBeGreaterThanOrEqual(1);
    await enqueueDueOlistStock(prisma, new Date(at.getTime() + 60_000), env);
    expect(await prisma.job.count({ where: { type: OLIST_STOCK_JOB, brandId: s.brand.id } })).toBe(1);
  });
});
