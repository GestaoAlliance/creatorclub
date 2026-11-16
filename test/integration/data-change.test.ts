import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { changePixKey } from "@/lib/creators/pix";
import type { PortalContext } from "@/lib/portal/context";
import { staffUpdateAddress } from "@/lib/shipments/shipments";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "PAGAMENTO" | "ENVIO" | "VIEWER", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}
const addr = { zip: "30130-010", street: "Av. Afonso Pena", number: "100", complement: "", district: "Centro", city: "Belo Horizonte", state: "MG" };

describe("troca de dados (D-PIXCHANGE, D-ADDRSTAFF, banco real)", () => {
  it("chave Pix: creator e equipe trocam com aviso e histórico; Viewer não; trava com saque aprovado", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const ctx = { creatorId: creator.id, brand: { id: brand.id }, viewAs: null } as unknown as PortalContext;
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { pixKey: "errada@x.com" } });
    const now = new Date("2026-11-16T15:00:00Z");

    await expect(changePixKey(prisma, { kind: "creator", ctx: { ...ctx, viewAs: { userId: "x" } } as PortalContext, userId: "u" }, creator.id, "certa@x.com")).rejects.toThrow(/Visualização/);
    await expect(changePixKey(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, "x")).rejects.toThrow(/Digite a chave/);
    await changePixKey(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, " certa@x.com ", now);
    let a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(a).toMatchObject({ pixKey: "certa@x.com", pixKeyChangedAt: now });
    const note = await prisma.notification.findFirstOrThrow({ where: { creatorId: creator.id, kind: "PIX_CHANGED" } });
    expect(note.body).toMatch(/^Você trocou .*cer•••com/);
    await expect(changePixKey(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, "certa@x.com")).rejects.toThrow(/já é a chave/);

    await expect(changePixKey(prisma, { kind: "staff", actor: await staff("VIEWER", brand.id), reason: "pedido" }, creator.id, "outra@x.com")).rejects.toThrow(/Sem permissão/);
    const pag = await staff("PAGAMENTO", brand.id);
    await expect(changePixKey(prisma, { kind: "staff", actor: pag, reason: "  " }, creator.id, "outra@x.com")).rejects.toThrow(/motivo/);
    await changePixKey(prisma, { kind: "staff", actor: pag, reason: "Ela pediu pelo WhatsApp" }, creator.id, "outra@x.com", new Date("2026-11-16T16:00:00Z"));
    expect(await prisma.notification.count({ where: { creatorId: creator.id, kind: "PIX_CHANGED" } })).toBe(2);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: account.id, action: "creator.pix_change" }, orderBy: { createdAt: "desc" } });
    expect(log.after).toMatchObject({ pixKey: "outra@x.com", by: "staff", reason: "Ela pediu pelo WhatsApp" });

    // Saque aprovado esperando o Pix: não troca.
    const w = await prisma.withdrawal.create({ data: { brandId: brand.id, creatorId: creator.id, amountCents: 1000, idempotencyKey: randomUUID() } });
    await prisma.withdrawal.update({ where: { id: w.id }, data: { status: "APPROVED", approvedAt: now, approvedById: "x" } });
    expect(await prisma.withdrawal.count({ where: { creatorId: creator.id, status: "APPROVED" } })).toBe(1);
    await expect(changePixKey(prisma, { kind: "creator", ctx, userId: "u" }, creator.id, "nova@x.com")).rejects.toThrow(/aprovado esperando o Pix/);
    a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(a.pixKey).toBe("outra@x.com");
    await expectDbError(prisma.notification.create({ data: { brandId: brand.id, creatorId: creator.id, kind: "PIX_OLD", dedupeKey: "x", title: "t", body: "b" } }), /Notification_valid/);
  });

  it("endereço: Gestão e Envio corrigem (e os envios ainda não enviados); Pagamento não", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    await expect(staffUpdateAddress(prisma, await staff("PAGAMENTO", brand.id), creator.id, addr, true)).rejects.toThrow(/Sem permissão/);
    const old = { ...addr, street: "Rua Errada" };
    const preparing = await prisma.shipment.create({ data: { brandId: brand.id, creatorId: creator.id, address: old, createdById: "x" } });
    const r = await staffUpdateAddress(prisma, await staff("ENVIO", brand.id), creator.id, addr, true);
    expect(r.pendingUpdated).toBe(1);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: preparing.id } })).address).toMatchObject({ street: "Av. Afonso Pena" });
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).addrStreet).toBe("Av. Afonso Pena");
    const r2 = await staffUpdateAddress(prisma, await staff("GESTAO", brand.id), creator.id, { ...addr, number: "200" }, false);
    expect(r2.pendingUpdated).toBe(0);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: preparing.id } })).address).toMatchObject({ number: "100" });
  });
});
