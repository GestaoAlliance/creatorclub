import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { EmailMessage } from "@/lib/email/sender";
import { emailPendingNotices, runDueNotices } from "@/lib/notifications/scheduled";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const T = (s: string) => new Date(s);

async function world() {
  const a = await seedBrand(prisma);
  const template = await prisma.contractTemplate.create({ data: { brandId: a.brand.id, key: `t-${letters(4)}`, name: "t", releaseMinCents: 50_000, months: 6 } });
  await prisma.creator.update({
    where: { id: a.creator.id },
    data: { contractTemplateId: template.id, withdrawalsUnlockedAt: T("2026-09-01T00:00:00Z"), withdrawalsUnlockedById: "pag", contractEnd: T("2026-11-20T00:00:00Z") },
  });
  // Saldo disponível de R$ 200 (ajuste) e R$ 400 em vendas (80% do mínimo de R$ 500).
  await prisma.ledgerEntry.create({
    data: { brandId: a.brand.id, creatorId: a.creator.id, type: "ADJUSTMENT", amountCents: 20_000, availableAt: T("2026-10-01T00:00:00Z"), idempotencyKey: randomUUID(), note: "teste", createdById: "x" },
  });
  const o = await prisma.order.create({
    data: { brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#9", createdAtShop: T("2026-10-15T12:00:00Z"), paidAt: T("2026-10-15T12:00:00Z"), financialStatus: "PAID", subtotalCents: 40_000, totalCents: 40_000, discountCodes: [a.coupon.code], shopifyUpdatedAt: T("2026-10-15T12:00:00Z") },
  });
  await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: o.id, creatorId: a.creator.id, couponId: a.coupon.id, rule: "first_creator_code", evidenceCodes: [] } });
  return a;
}

const kinds = async (creatorId: string) =>
  (await prisma.notification.findMany({ where: { creatorId }, orderBy: { dedupeKey: "asc" }, select: { dedupeKey: true } })).map((n) => n.dedupeKey);

describe("avisos por data (U5b, banco real)", () => {
  it("janela de saque, perto do mínimo e contrato vencendo; uma rodada por dia, só depois das 9h", async () => {
    const a = await world();
    const only = { brandId: a.brand.id };
    expect(await runDueNotices(prisma, T("2026-11-01T10:00:00Z"), only)).toBe(0); // 07h em São Paulo: ainda não
    expect(await prisma.noticeRun.count({ where: { brandId: a.brand.id } })).toBe(0);

    expect(await runDueNotices(prisma, T("2026-11-01T13:00:00Z"), only)).toBe(3); // 10h
    expect(await kinds(a.creator.id)).toEqual(["contract-end:2026-11-20", "near-min:2026-11", "window:2026-11:open"]);
    const near = await prisma.notification.findFirstOrThrow({ where: { creatorId: a.creator.id, kind: "NEAR_MINIMUM" } });
    expect(near.body).toContain("Faltam R$ 100,00");
    expect(await runDueNotices(prisma, T("2026-11-01T18:00:00Z"), only)).toBe(0); // mesma data: não roda de novo

    // Dia 8: lembrete dos últimos dias (o resto não repete).
    expect(await runDueNotices(prisma, T("2026-11-08T13:00:00Z"), only)).toBe(1);
    expect(await kinds(a.creator.id)).toContain("window:2026-11:last");

    // Pediu saque no mês: sem lembrete no mês seguinte? Aqui: dia 9 nada novo; e quem pediu não recebe.
    await prisma.withdrawal.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, amountCents: 20_000, idempotencyKey: randomUUID(), requestedAt: T("2026-12-02T12:00:00Z") } });
    await runDueNotices(prisma, T("2026-12-03T13:00:00Z"), only);
    expect(await kinds(a.creator.id)).not.toContain("window:2026-12:open");
  });

  it("e-mail: só com remetente e endereço, só avisos das últimas 24 h, nunca para e-mail de importação", async () => {
    const a = await world();
    const sent: EmailMessage[] = [];
    const sender = async (m: EmailMessage) => (sent.push(m), { id: "x" });
    const base = { brandId: a.brand.id, creatorId: a.creator.id, kind: "FIRST_SALE", title: "Parabéns!", body: "Primeira venda.", href: `/portal/${a.brand.slug}/vendas` };
    const fresh = await prisma.notification.create({ data: { ...base, dedupeKey: "first-sale" } });
    const old = await prisma.notification.create({ data: { ...base, dedupeKey: "velho", createdAt: new Date(Date.now() - 2 * 86_400_000) } });

    expect(await emailPendingNotices(prisma, null, "https://x.test")).toBe(0);
    expect(await emailPendingNotices(prisma, sender, null)).toBe(0);
    // Até 20 por rodada (o banco de teste é compartilhado com outros testes): roda até esvaziar.
    let n = 0;
    for (let r = await emailPendingNotices(prisma, sender, "https://x.test"); r > 0; r = await emailPendingNotices(prisma, sender, "https://x.test")) n += r;
    const mine = sent.filter((m) => m.idempotencyKey === `notice-${fresh.id}`);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.html).toContain(`https://x.test/portal/${a.brand.slug}/vendas`);
    expect(sent.some((m) => m.idempotencyKey === `notice-${old.id}`)).toBe(false); // mais de 24 h: não envia
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: fresh.id } })).emailedAt).not.toBeNull();

    // E-mail de importação (falso): não envia.
    const fake = await seedBrand(prisma);
    const acc = await prisma.creator.findUniqueOrThrow({ where: { id: fake.creator.id }, select: { accountId: true } });
    await prisma.creatorAccount.update({ where: { id: acc.accountId }, data: { email: `${randomUUID()}@import.creatorclub` } });
    const f = await prisma.notification.create({ data: { ...base, brandId: fake.brand.id, creatorId: fake.creator.id, dedupeKey: "first-sale", href: null } });
    while ((await emailPendingNotices(prisma, sender, "https://x.test")) > 0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: f.id } })).emailedAt).toBeNull();
  });
});
