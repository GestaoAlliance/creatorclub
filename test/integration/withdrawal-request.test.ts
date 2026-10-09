import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { requestWithdrawal } from "@/lib/withdrawals/request";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const IN_WINDOW = T("2026-10-12T15:00:00Z");
const PDF = new TextEncoder().encode("%PDF-1.4 nota fiscal de teste");

async function creatorWith(availableCents: number, opts: { unlocked?: boolean; pixKey?: string | null } = {}) {
  const a = await seedBrand(prisma);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, pixKey: opts.pixKey === undefined ? "pix@exemplo.com" : opts.pixKey } });
  if (opts.unlocked ?? true) await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: T("2026-10-01T00:00:00Z"), withdrawalsUnlockedById: "pagamento" } });
  await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }, { amountCents: availableCents, availableAt: T("2026-09-08T12:00:00Z") }) });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  return { ...a, ctx, userId };
}

describe("pedido de saque (banco real)", () => {
  it("cria o pedido com a nota fiscal, reserva o valor e repetir o envio não duplica", async () => {
    const c = await creatorWith(80_000);
    const requestId = randomUUID();
    const input = { actorUserId: c.userId, requestId, amountCents: 60_000, pdf: PDF };
    const r = await requestWithdrawal(prisma, c.ctx, input, IN_WINDOW);
    expect(r.created).toBe(true);
    expect(await requestWithdrawal(prisma, c.ctx, input, IN_WINDOW)).toEqual({ withdrawalId: r.withdrawalId, created: false });
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.withdrawalId }, include: { nfFile: true } });
    expect(w).toMatchObject({ amountCents: 60_000, status: "REQUESTED", nfFile: { bucket: "nf", mime: "application/pdf", sizeBytes: PDF.byteLength } });
    expect(w.nfFile!.path).toBe(`${c.brand.id}/${c.creator.id}/${requestId}.pdf`);
    expect(await prisma.auditLog.count({ where: { action: "withdrawal.request", entityId: r.withdrawalId } })).toBe(1);
  });

  it("recusa: travado, visualização da equipe, fora da janela, abaixo do mínimo, acima do saldo, arquivo que não é PDF", async () => {
    const locked = await creatorWith(80_000, { unlocked: false });
    const base = (c: { userId: string }) => ({ actorUserId: c.userId, requestId: randomUUID(), amountCents: 60_000, pdf: PDF });
    await expect(requestWithdrawal(prisma, locked.ctx, base(locked), IN_WINDOW)).rejects.toThrow(/conferência/);

    const c = await creatorWith(80_000);
    await expect(requestWithdrawal(prisma, { ...c.ctx, viewAs: { userId: "sa" } }, base(c), IN_WINDOW)).rejects.toThrow(/Visualização da equipe/);
    await expect(requestWithdrawal(prisma, c.ctx, base(c), T("2026-10-20T15:00:00Z"))).rejects.toThrow(/janela/);
    await expect(requestWithdrawal(prisma, c.ctx, { ...base(c), amountCents: 40_000 }, IN_WINDOW)).rejects.toThrow(/mínimo/);
    await expect(requestWithdrawal(prisma, c.ctx, { ...base(c), amountCents: 90_000 }, IN_WINDOW)).rejects.toThrow(/maior que o seu saldo/);
    await expect(requestWithdrawal(prisma, c.ctx, { ...base(c), pdf: new TextEncoder().encode("não é pdf") }, IN_WINDOW)).rejects.toThrow(/não é um PDF/);
    expect(await prisma.withdrawal.count({ where: { creatorId: c.creator.id } })).toBe(0);
  });

  it("dois pedidos ao mesmo tempo: só um passa (saldo e um em aberto por vez)", async () => {
    const c = await creatorWith(110_000);
    const results = await Promise.allSettled(
      [1, 2].map(() => requestWithdrawal(prisma, c.ctx, { actorUserId: c.userId, requestId: randomUUID(), amountCents: 60_000, pdf: PDF }, IN_WINDOW)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/em análise|maior que o seu saldo/);
    expect(await prisma.withdrawal.count({ where: { creatorId: c.creator.id } })).toBe(1);
  });

  it("sem chave Pix cadastrada: exige e grava", async () => {
    const c = await creatorWith(80_000, { pixKey: null });
    const input = { actorUserId: c.userId, requestId: randomUUID(), amountCents: 50_000, pdf: PDF };
    await expect(requestWithdrawal(prisma, c.ctx, input, IN_WINDOW)).rejects.toThrow(/chave Pix/);
    await requestWithdrawal(prisma, c.ctx, { ...input, pixKey: "  123.456.789-00 " }, IN_WINDOW);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: c.account.id } })).pixKey).toBe("123.456.789-00");
  });
});
