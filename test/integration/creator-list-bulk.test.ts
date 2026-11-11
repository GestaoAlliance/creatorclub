import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { bulkMessage, bulkTag } from "@/lib/creators/bulk";
import { creatorPeek } from "@/lib/creators/peek";
import { creatorInsights, lastMonths } from "@/lib/creators/insights";
import { listCreators } from "@/lib/creators/profile";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;

async function userWith(role: "GESTAO" | "PAGAMENTO" | "VIEWER", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

async function secondCreator(brandId: string, name: string) {
  const account = await prisma.creatorAccount.create({ data: { name, email: `${randomUUID()}@example.com`, phone: "11912345678" } });
  return prisma.creator.create({ data: { brandId, accountId: account.id, categories: ["INFLUENCER"] } });
}

async function sale(brandId: string, creatorId: string, couponId: string, paidAt: Date, cents: number) {
  const order = await prisma.order.create({
    data: { brandId, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 6)}`, createdAtShop: paidAt, paidAt, financialStatus: "PAID", subtotalCents: cents, totalCents: cents, discountCodes: [], shopifyUpdatedAt: paidAt },
  });
  await prisma.orderAttribution.create({ data: { brandId, orderId: order.id, creatorId, couponId, rateBps: 1000, rule: "first", evidenceCodes: [] } });
  return order;
}

describe("lista de creators: tendência, painel e ações em grupo (D-CREATORLIST, D-BULKMSG, banco real)", () => {
  it("vendas de 30 dias, dos 30 anteriores e das 12 semanas", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    const now = Date.now();
    await sale(brand.id, creator.id, coupon.id, new Date(now - 2 * DAY), 10_000);
    await sale(brand.id, creator.id, coupon.id, new Date(now - 40 * DAY), 4_000);
    await sale(brand.id, creator.id, coupon.id, new Date(now - 200 * DAY), 1_000);
    const [row] = await listCreators(prisma, await userWith("GESTAO", brand.id), brand.id);
    expect(row!.stats).toMatchObject({ salesCents: 15_000, orders: 3, sales30Cents: 10_000, prev30Cents: 4_000 });
    expect(row!.stats!.weeks).toHaveLength(12);
    expect(row!.stats!.weeks[11]).toBe(10_000);
    expect(row!.stats!.weeks[6]).toBe(4_000);
    expect(row!.stats!.weeks.reduce((s, v) => s + v, 0)).toBe(14_000);
  });

  it("painel: saldo e taxa só para quem vê dinheiro; contrato e último envio; outra marca não abre", async () => {
    const { brand, creator, order } = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: creator.id }, data: { contractStart: new Date("2026-03-01T03:00:00Z"), contractEnd: new Date("2027-03-01T03:00:00Z") } });
    await prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1200, validFrom: new Date("2026-01-01"), confirmedAt: new Date(), confirmedById: "seed", createdById: "seed" } });
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }) });
    const gestao = await userWith("GESTAO", brand.id);
    const peek = await creatorPeek(prisma, gestao, creator.id);
    expect(peek.contract).toMatchObject({ start: "2026-03-01", end: "2027-03-01" });
    expect(peek.money).toMatchObject({ rateBps: 1200, withdrawalsUnlocked: false });
    expect(peek.money!.availableCents + peek.money!.heldCents).toBe(3_000);
    expect(peek.shipment).toBeNull();

    const other = await seedBrand(prisma);
    await expect(creatorPeek(prisma, await userWith("GESTAO", other.brand.id), creator.id)).rejects.toThrow(/não encontrada/);
  });

  it("tag em grupo: põe (cria na marca) e tira; auditoria; só creators da marca; Pagamento não", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const b = await secondCreator(brand.id, "Bia Lima");
    const other = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const r = await bulkTag(prisma, gestao, brand.id, [creator.id, b.id, other.creator.id], { add: " Black Friday " });
    expect(r).toEqual({ tag: "Black Friday", changed: 2 });
    expect(await bulkTag(prisma, gestao, brand.id, [creator.id, b.id], { add: "black friday" })).toEqual({ tag: "Black Friday", changed: 0 });
    expect(await prisma.creatorTagLink.count({ where: { creatorId: other.creator.id } })).toBe(0);
    const tag = await prisma.creatorTag.findFirstOrThrow({ where: { brandId: brand.id } });
    expect(await bulkTag(prisma, gestao, brand.id, [b.id], { remove: tag.id })).toEqual({ tag: "Black Friday", changed: 1 });
    expect(await prisma.auditLog.count({ where: { entityId: tag.id, action: { in: ["creator.tag.bulk_add", "creator.tag.bulk_remove"] } } })).toBe(3);
    await expect(bulkTag(prisma, await userWith("PAGAMENTO", brand.id), brand.id, [creator.id], { add: "x" })).rejects.toThrow(/permissão/);
    await expect(bulkTag(prisma, gestao, brand.id, [other.creator.id], { add: "x" })).rejects.toThrow(/Nenhuma das marcadas/);
    await expect(bulkTag(prisma, gestao, brand.id, [creator.id], { remove: (await prisma.creatorTag.create({ data: { brandId: other.brand.id, name: "y", key: "y", createdById: "seed" } })).id })).rejects.toThrow(/Tag não encontrada/);
  });

  it("mensagem em grupo: um aviso por creator com {nome}/{cupom}, sem repetir; auditoria; limites", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    await prisma.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: new Date("2026-08-01"), createdById: "seed" } });
    const b = await secondCreator(brand.id, "Bia Lima");
    const gestao = await userWith("GESTAO", brand.id);
    const r = await bulkMessage(prisma, gestao, brand.id, [creator.id, b.id, creator.id], { title: "Campanha nova, {nome}", body: "Oi, {nome}! Divulgue o {cupom}." });
    expect(r).toEqual({ sent: 2, whatsapp: false });
    const notes = await prisma.notification.findMany({ where: { brandId: brand.id, kind: "TEAM_MESSAGE" }, orderBy: { title: "asc" } });
    expect(notes.map((n) => n.title)).toEqual(["Campanha nova, Bia", `Campanha nova, ${(await prisma.creatorAccount.findFirstOrThrow({ where: { creators: { some: { id: creator.id } } } })).name.split(" ")[0]}`]);
    expect(notes.find((n) => n.creatorId === b.id)!.body).toBe("Oi, Bia! Divulgue o seu cupom.");
    expect(notes.find((n) => n.creatorId === creator.id)!.body).toContain(coupon.code);
    expect(new Set(notes.map((n) => n.dedupeKey)).size).toBe(1);
    expect(await prisma.auditLog.count({ where: { brandId: brand.id, action: "creator.message.bulk" } })).toBe(1);

    await expect(bulkMessage(prisma, gestao, brand.id, [b.id], { title: " ", body: "x" })).rejects.toThrow(/título e a mensagem/);
    await expect(bulkMessage(prisma, gestao, brand.id, [b.id], { title: "x", body: "y".repeat(1001) })).rejects.toThrow(/1000/);
    await expect(bulkMessage(prisma, await userWith("VIEWER", brand.id), brand.id, [b.id], { title: "x", body: "y" })).rejects.toThrow(/permissão/);
    await expect(bulkMessage(prisma, gestao, brand.id, [], { title: "x", body: "y" })).rejects.toThrow(/pelo menos uma/);
  });

  it("travas do banco: tipo TEAM_MESSAGE aceito e tamanho do texto limitado (Notification_team_message_size)", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const base = { brandId: brand.id, creatorId: creator.id, kind: "TEAM_MESSAGE", title: "t", body: "b" };
    await prisma.notification.create({ data: { ...base, dedupeKey: "team-message:1" } });
    await expectDbError(prisma.notification.create({ data: { ...base, dedupeKey: "team-message:2", body: "x".repeat(1001) } }), /Notification_team_message_size/);
    await expectDbError(prisma.notification.create({ data: { ...base, dedupeKey: "team-message:3", title: "x".repeat(81) } }), /Notification_team_message_size/);
  });
});

describe("ficha: resumo (D-CREATORFILE, banco real)", () => {
  it("vendas por mês, produtos, comparação com as ativas, último envio e abertura; sem dinheiro para Envio", async () => {
    const { brand, creator, coupon } = await seedBrand(prisma);
    const b = await secondCreator(brand.id, "Bia Lima");
    const now = new Date();
    const o1 = await sale(brand.id, creator.id, coupon.id, new Date(now.getTime() - 2 * DAY), 30_000);
    await sale(brand.id, b.id, coupon.id, new Date(now.getTime() - 3 * DAY), 10_000);
    await prisma.orderLine.createMany({ data: [
      { brandId: brand.id, orderId: o1.id, shopifyId: "l1", title: "Sérum", quantity: 2, discountedTotalCents: 20_000 },
      { brandId: brand.id, orderId: o1.id, shopifyId: "l2", title: "Brinde", quantity: 5, discountedTotalCents: 0 },
    ] });
    await prisma.openingPaid.create({ data: { brandId: brand.id, creatorId: creator.id, paidCents: 12_345, note: "Pix", preparedById: "seed" } });
    const gestao = await userWith("GESTAO", brand.id);
    const r = await creatorInsights(prisma, gestao, creator.id, now);
    expect(r.money!.months).toHaveLength(12);
    expect(r.money!.months.at(-1)!.cents + r.money!.months.at(-2)!.cents).toBe(30_000);
    expect(r.money!.products).toEqual([{ title: "Sérum", quantity: 2, cents: 20_000 }]);
    expect(r.money!.compare).toEqual({ sales30Cents: 30_000, averageCents: 20_000, rank: 1, active: 2 });
    expect(r.money!.opening).toEqual({ approved: false, paidCents: 12_345, note: "Pix" });
    expect(r.shipment).toBeNull();
    expect(lastMonths(new Date("2026-01-15T12:00:00Z"), "America/Sao_Paulo", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);

    const envio = await prisma.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@x.com`, name: "E", roleGrants: { create: { role: "ENVIO", brandId: brand.id } } } });
    expect((await creatorInsights(prisma, (await loadActor(prisma, envio.id))!, creator.id, now)).money).toBeNull();
  });
});
