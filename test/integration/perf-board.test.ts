import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { originSummary } from "@/lib/creators/origin";
import { monthSalesByCreator, ugcBoard } from "@/lib/performance/board";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

async function paidSale(brandId: string, creatorId: string, couponId: string, at: string, cents: number) {
  const o = await prisma.order.create({
    data: { brandId, shopifyId: `gid://shopify/Order/pb-${randomUUID()}`, name: `#pb${randomUUID().slice(0, 6)}`, createdAtShop: new Date(at), paidAt: new Date(at), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [], shopifyUpdatedAt: new Date(at) },
  });
  await prisma.orderAttribution.create({ data: { brandId, orderId: o.id, creatorId, couponId, rule: "first_creator_code_v1", evidenceCodes: [] } });
}

describe("Desempenho (D-PERFBOARD, banco real)", () => {
  it("vendas do mês por creator e tempo até a 1ª venda por origem (importada com venda antes do cadastro fica de fora)", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    await prisma.creator.update({ where: { id: creator.id }, data: { createdAt: new Date("2026-10-01T15:00:00Z") } });
    await paidSale(brand.id, creator.id, coupon.id, "2026-10-11T15:00:00Z", 10_000); // 10 dias depois de entrar
    await paidSale(brand.id, creator.id, coupon.id, "2026-11-05T15:00:00Z", 7_000);
    // Outra creator, importada: a venda é de antes do cadastro.
    const acc2 = await prisma.creatorAccount.create({ data: { name: "Importada", email: `${randomUUID()}@x.com` } });
    const old = await prisma.creator.create({ data: { brandId: brand.id, accountId: acc2.id, categories: ["INFLUENCER"], createdAt: new Date("2026-10-20T15:00:00Z") } });
    await paidSale(brand.id, old.id, coupon.id, "2026-08-01T15:00:00Z", 5_000);

    const sales = await monthSalesByCreator(prisma, brand.id, "America/Sao_Paulo", new Date("2026-11-12T15:00:00Z"));
    expect(sales.get(creator.id)).toBe(7_000);
    expect(sales.get(old.id)).toBeUndefined();

    const rows = await originSummary(prisma, gestao, brand.id, sales);
    expect(rows).toEqual([expect.objectContaining({ key: "UNKNOWN", active: 2, sellers: 1, firstSales: 1, daysToFirstSale: 10 })]);
  });

  it("UGC: atrasada no topo, vídeos só do ciclo, sem permissão não abre", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const mk = async (name: string, videos: string[]) => {
      const a = await prisma.creatorAccount.create({ data: { name, email: `${randomUUID()}@x.com`, phone: "+5511999990000" } });
      const c = await prisma.creator.create({ data: { brandId: brand.id, accountId: a.id, categories: ["UGC"], contractStart: new Date("2026-11-01T00:00:00Z"), contractEnd: new Date("2026-11-30T00:00:00Z"), ugcVideoGoal: 6 } });
      for (const d of videos) await prisma.ugcVideo.create({ data: { brandId: brand.id, creatorId: c.id, deliveredOn: new Date(`${d}T00:00:00Z`), url: `https://drive.example/${randomUUID()}`, createdById: gestao.userId } });
      return c;
    };
    const ok = await mk("Ana No Ritmo", ["2026-11-03", "2026-11-08", "2026-11-12"]);
    const late = await mk("Bia Atrasada", ["2026-10-20", "2026-11-02"]); // a de outubro é fora do ciclo
    const board = await ugcBoard(prisma, gestao, brand.id, new Map([[ok.id, 4_000]]), new Date("2026-11-15T15:00:00Z"));
    expect(board.map((c) => c.id)).toEqual([late.id, ok.id]);
    expect(board[0]).toMatchObject({ late: true, expected: 3, daysLeft: 15, hasPhone: true, cycle: { count: 1, goal: 6, status: "OPEN" } });
    expect(board[0]!.videos.map((v) => v.day)).toEqual(["2026-11-02"]);
    expect(board[1]).toMatchObject({ late: false, salesCents: 4_000 });
    expect(board.some((c) => c.id === creator.id)).toBe(false); // influencer não entra

    await expect(ugcBoard(prisma, await userWith("PAGAMENTO", brand.id), brand.id, new Map())).rejects.toThrow(/permissão/);
  });
});
