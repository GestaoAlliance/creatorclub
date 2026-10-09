import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { changeRate, creatorProfile, listCreators, setCreatorStatus, updateContact } from "@/lib/creators/profile";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("ficha da creator (banco real)", () => {
  it("Gestão troca o e-mail falso pelo real e só então consegue convidar", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { email: `x-${randomUUID()}@import.creatorclub` } });
    const ana = await userWith("GESTAO", brand.id);

    expect((await creatorProfile(prisma, ana, creator.id)).contact.fakeEmail).toBe(true);
    await expect(createCreatorInvite(prisma, ana, account.id)).rejects.toThrow(/Confirme o e-mail/);
    await expect(updateContact(prisma, ana, creator.id, { name: "Ana", email: "a@import.creatorclub", phone: "" })).rejects.toThrow(/e-mail real/);
    await expect(updateContact(prisma, ana, creator.id, { name: "Ana", email: "sem-arroba", phone: "" })).rejects.toThrow(/inválido/);

    const real = `Real-${randomUUID()}@Exemplo.com`;
    await updateContact(prisma, ana, creator.id, { name: " Ana Souza ", email: real, phone: "11999" });
    const p = await creatorProfile(prisma, ana, creator.id);
    expect(p.contact).toMatchObject({ name: "Ana Souza", email: real.toLowerCase(), phone: "11999", fakeEmail: false });
    await expect(createCreatorInvite(prisma, ana, account.id)).resolves.toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: "creator.contact", entityId: account.id } })).toBe(1);
  });

  it("e-mail de outra creator é recusado; quem já entrou não troca o e-mail de login", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const ana = await userWith("GESTAO", a.brand.id);
    await expect(updateContact(prisma, ana, a.creator.id, { name: "X", email: b.account.email, phone: "" })).rejects.toThrow(/outra creator/);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: a.account.email, name: "C" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
    await expect(updateContact(prisma, ana, a.creator.id, { name: "X", email: `${randomUUID()}@x.com`, phone: "" })).rejects.toThrow(/fica para depois/);
  });

  it("situação: Pausada e Desligada com data; volta a Ativa", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const ana = await userWith("GESTAO", brand.id);
    await setCreatorStatus(prisma, ana, creator.id, "DEACTIVATED");
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } })).deactivatedAt).not.toBeNull();
    await setCreatorStatus(prisma, ana, creator.id, "ACTIVE");
    const back = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } });
    expect(back).toMatchObject({ status: "ACTIVE", deactivatedAt: null });
    expect((await listCreators(prisma, ana, brand.id))[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("mudar taxa confirmada fecha a atual e abre a nova a partir de agora; a confirmar é recusada", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const ana = await userWith("GESTAO", brand.id);
    const old = await prisma.commissionPolicy.create({
      data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: new Date("2026-07-21T00:00:00Z") },
    });
    await expect(changeRate(prisma, ana, creator.id, 1000)).rejects.toThrow(/Confirme a taxa atual/);
    await prisma.commissionPolicy.update({ where: { id: old.id }, data: { confirmedAt: new Date(), confirmedById: ana.userId } });

    const now = new Date("2026-10-09T15:00:00Z");
    await changeRate(prisma, ana, creator.id, 1000, now);
    const policies = await prisma.commissionPolicy.findMany({ where: { creatorId: creator.id }, orderBy: { validFrom: "asc" } });
    expect(policies.map((p) => [p.rateBps, p.validTo?.toISOString() ?? null, p.confirmedAt !== null])).toEqual([
      [1500, now.toISOString(), true],
      [1000, null, true],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "commission.change", brandId: brand.id } })).toBe(1);
  });

  it("CPF e Pix só para quem pode ver dados fiscais; Envio não vê a ficha", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const pagamento = await userWith("PAGAMENTO", brand.id);
    const p = await creatorProfile(prisma, pagamento, creator.id);
    expect(p.fiscal).not.toBeNull();
    expect(p.canEdit).toBe(false);
    await expect(updateContact(prisma, pagamento, creator.id, { name: "X", email: "x@x.com", phone: "" })).rejects.toThrow(/Sem permissão/);
    const envio = await userWith("ENVIO", brand.id);
    await expect(creatorProfile(prisma, envio, creator.id)).rejects.toThrow(/Sem permissão/);
  });
});
