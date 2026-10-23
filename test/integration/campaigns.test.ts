import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { campaignDetail, createCampaign, joinCampaign, portalCampaigns, publishCampaign, settleCampaign, updateCampaign, type CampaignInput } from "@/lib/campaigns/campaigns";
import type { PortalContext } from "@/lib/portal/context";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}
const base: CampaignInput = { name: "Desafio Semana Rosa", briefing: "Divulgue o kit rosa.", startDay: "2026-10-19", endDay: "2026-10-25", categories: [], tagIds: [], rankingPrizes: ["300", "200", ""], goal: "500", goalPrize: "50", allianceOsUrl: "" };
const T = (s: string) => new Date(s);

describe("campanhas (M4.5, D-CAMPAIGN, banco real)", () => {
  it("cria, publica, inscrição, placar, confirma 7 dias depois: prêmios no extrato, já disponíveis, uma vez só", async () => {
    const { brand, creator, account, coupon } = await seedBrand(prisma);
    const gestao = await staff("GESTAO", brand.id);
    await expect(createCampaign(prisma, await staff("PAGAMENTO", brand.id), brand.id, base)).rejects.toThrow(/permissão/);
    await expect(createCampaign(prisma, gestao, brand.id, { ...base, rankingPrizes: [], goal: "" , goalPrize: "" })).rejects.toThrow(/prêmios do ranking, a meta/);
    await expect(createCampaign(prisma, gestao, brand.id, { ...base, goalPrize: "" })).rejects.toThrow(/valor e o prêmio/);
    const { id } = await createCampaign(prisma, gestao, brand.id, base);

    // Segunda creator, que fica em 1º.
    const acc2 = await prisma.creatorAccount.create({ data: { name: "Bia Lima", email: `${randomUUID()}@x.com` } });
    const c2 = await prisma.creator.create({ data: { brandId: brand.id, accountId: acc2.id, categories: ["INFLUENCER"] } });
    const ctx = (creatorId: string) => ({ creatorId, brand: { id: brand.id }, viewAs: null }) as unknown as PortalContext;
    await expect(joinCampaign(prisma, ctx(creator.id), id, T("2026-10-18T12:00:00Z"))).rejects.toThrow(/não encontrada/); // rascunho
    await publishCampaign(prisma, gestao, id, T("2026-10-18T12:00:00Z"));
    await expect(updateCampaign(prisma, gestao, id, { ...base, rankingPrizes: ["999"], name: "Novo nome" })).resolves.toBeUndefined();
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id } })).rankingPrizes).toEqual([30_000, 20_000]); // publicada: prêmios não mudam
    await expect(joinCampaign(prisma, { ...ctx(creator.id), viewAs: { userId: "x" } } as PortalContext, id)).rejects.toThrow(/Visualização/);
    await joinCampaign(prisma, ctx(creator.id), id, T("2026-10-20T12:00:00Z"));
    await joinCampaign(prisma, ctx(c2.id), id, T("2026-10-20T12:00:00Z"));
    await joinCampaign(prisma, ctx(c2.id), id, T("2026-10-20T12:00:00Z")); // de novo: nada muda

    // Vendas: pagas no período (São Paulo) contam; fora do período e cancelada não.
    const order = async (creatorId: string, cents: number, paidAt: string, extra: object = {}) => {
      const o = await prisma.order.create({ data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#x", createdAtShop: T(paidAt), paidAt: T(paidAt), financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [coupon.code], shopifyUpdatedAt: T(paidAt), ...extra } });
      await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId, couponId: coupon.id, rateBps: 1500, rule: "FIRST_CREATOR_CODE", evidenceCodes: [coupon.code] } });
    };
    await order(creator.id, 30_000, "2026-10-19T03:30:00Z"); // 00:30 de 19/10 em SP: conta
    await order(creator.id, 10_000, "2026-10-19T02:00:00Z"); // 23:00 de 18/10 em SP: não conta
    await order(c2.id, 60_000, "2026-10-25T20:00:00Z");
    await order(c2.id, 90_000, "2026-10-26T03:30:00Z"); // 00:30 de 26/10: fora
    await order(c2.id, 5_000, "2026-10-22T12:00:00Z", { cancelledAt: T("2026-10-23T00:00:00Z") });

    const d = await campaignDetail(prisma, gestao, id, T("2026-10-24T00:00:00Z"));
    expect(d.standings.map((s) => [s.name, s.salesCents, s.rankPrizeCents, s.goalPrizeCents])).toEqual([
      ["Bia Lima", 60_000, 30_000, 5_000],
      [account.name, 30_000, 20_000, 0],
    ]);
    const portal = (await portalCampaigns(prisma, { ...ctx(creator.id), brand: { id: brand.id } } as PortalContext, T("2026-10-24T00:00:00Z")))[0]!;
    expect(portal).toMatchObject({ joined: true, participants: 2, me: { position: 2, salesCents: 30_000, toAboveCents: 30_001, toGoalCents: 20_000 } });
    expect(portal.top).toEqual([{ position: 1, name: "Bia", me: false }, { position: 2, name: account.name.split(" ")[0], me: true }]);

    await expect(settleCampaign(prisma, gestao, id, T("2026-10-30T00:00:00Z"))).rejects.toThrow(/a partir de/);
    const r = await settleCampaign(prisma, gestao, id, T("2026-11-02T12:00:00Z"));
    expect(r).toEqual({ prizes: 3, totalCents: 55_000 });
    await expect(settleCampaign(prisma, gestao, id, T("2026-11-03T12:00:00Z"))).rejects.toThrow(/já foram confirmados/);
    const prizes = await prisma.ledgerEntry.findMany({ where: { type: "PRIZE", brandId: brand.id }, orderBy: { amountCents: "desc" } });
    expect(prizes.map((p) => [p.creatorId, p.amountCents, p.note])).toEqual([
      [c2.id, 30_000, "Prêmio: Novo nome (1º lugar)"],
      [creator.id, 20_000, "Prêmio: Novo nome (2º lugar)"],
      [c2.id, 5_000, "Prêmio: Novo nome (meta atingida)"],
    ]);
    expect(prizes.every((p) => p.availableAt.getTime() === T("2026-11-02T12:00:00Z").getTime())).toBe(true);
    await expectDbError(prisma.ledgerEntry.create({ data: { brandId: brand.id, creatorId: creator.id, type: "PRIZE", amountCents: 100, availableAt: new Date(), idempotencyKey: randomUUID() } }), /LedgerEntry_sign_by_type/);
    await expectDbError(prisma.campaign.create({ data: { brandId: brand.id, name: "x", briefing: "y", startDay: "2026-10-02", endDay: "2026-10-01", startsAt: T("2026-10-02T00:00:00Z"), endsAt: T("2026-10-03T00:00:00Z"), categories: [], tagIds: [], rankingPrizes: [100], createdById: "x" } }), /Campaign_valid/);
  });

  it("público por tipo: quem não é do público não vê nem se inscreve", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const gestao = await staff("GESTAO", brand.id);
    const { id } = await createCampaign(prisma, gestao, brand.id, { ...base, categories: ["PRESCRITOR"] });
    await publishCampaign(prisma, gestao, id, T("2026-10-18T12:00:00Z"));
    const ctx = { creatorId: creator.id, brand: { id: brand.id }, viewAs: null } as unknown as PortalContext;
    expect(await portalCampaigns(prisma, ctx, T("2026-10-20T00:00:00Z"))).toEqual([]);
    await expect(joinCampaign(prisma, ctx, id, T("2026-10-20T00:00:00Z"))).rejects.toThrow(/não é para o seu perfil/);
  });
});
