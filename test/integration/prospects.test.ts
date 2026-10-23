import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { receiveApplication } from "@/lib/onboarding/applications";
import { addProspects, listProspects, myProspectMessages, ProspectError, saveProspectMessages, updateProspect } from "@/lib/prospects/prospects";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-23T15:00:00Z");
const DAY = 86_400_000;

async function person(brandId: string, role: "GESTAO" | "HUNTER", name: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("prospecção antes do formulário (U6, D-PROSPECT, banco real)", () => {
  it("registra vários @, não duplica (avisa quem abordou), hunter vê só os dela e a Gestão vê todos", async () => {
    const { brand } = await seedBrand(prisma);
    const ana = await person(brand.id, "GESTAO", "Ana Gestão");
    const dani = await person(brand.id, "HUNTER", "Dani Hunter");
    const h = letters(6).toLowerCase();
    const r1 = await addProspects(prisma, dani, brand.id, { handles: `@${h}_um\n${h}_dois, ???`, approachedOn: "2026-10-20" }, NOW);
    expect(r1).toMatchObject({ created: [`${h}_um`, `${h}_dois`], invalid: ["???"], duplicates: [] });
    const r2 = await addProspects(prisma, ana, brand.id, { handles: `@${h.toUpperCase()}_UM\n${h}_tres`, approachedOn: "2026-10-22", status: "FORM_SENT" }, NOW);
    expect(r2.created).toEqual([`${h}_tres`]);
    expect(r2.duplicates).toEqual([{ handle: `${h}_um`, owner: "Dani Hunter", approachedOn: "2026-10-20", status: "1ª mensagem" }]);

    const mine = await listProspects(prisma, dani, brand.id, {}, NOW);
    expect(mine.seeAll).toBe(false);
    expect(mine.rows.map((r) => r.handle).sort()).toEqual([`${h}_dois`, `${h}_um`]);
    const all = await listProspects(prisma, ana, brand.id, {}, NOW);
    expect(all.seeAll).toBe(true);
    expect(all.total).toBe(3);
    expect(all.kpis).toMatchObject({ month: 3, formSent: 1, signedUp: 0 });

    // Hunter não muda o perfil de outra pessoa; a Gestão muda qualquer um.
    const tres = all.rows.find((r) => r.handle === `${h}_tres`)!;
    await expect(updateProspect(prisma, dani, tres.id, { status: "DECLINED" }, NOW)).rejects.toThrow(ProspectError);
    const um = all.rows.find((r) => r.handle === `${h}_um`)!;
    await updateProspect(prisma, ana, um.id, { status: "FOLLOW_UP", note: "em contato pelo WhatsApp" }, NOW);
    expect(await prisma.prospect.findUniqueOrThrow({ where: { id: um.id } })).toMatchObject({ status: "FOLLOW_UP", statusAt: NOW, note: "em contato pelo WhatsApp" });
    expect(await prisma.auditLog.count({ where: { entity: "Prospect", entityId: um.id } })).toBe(2);

    // Outra pessoa da equipe sem papel na marca: nada.
    const other = await seedBrand(prisma);
    const stranger = await person(other.brand.id, "GESTAO", "Fora");
    await expect(listProspects(prisma, stranger, brand.id, {}, NOW)).rejects.toThrow(ProspectError);
  });

  it("follow up depois de 3 dias; quem se inscreve com o mesmo @ vira Inscrita e fica travada", async () => {
    const { brand } = await seedBrand(prisma);
    const ana = await person(brand.id, "GESTAO", "Ana");
    const h = `p${letters(6).toLowerCase()}`;
    await addProspects(prisma, ana, brand.id, { handles: `${h}\n${h}x`, approachedOn: "2026-10-18" }, new Date(NOW.getTime() - 4 * DAY));
    let list = await listProspects(prisma, ana, brand.id, { followUp: true }, NOW);
    expect(list.rows.map((r) => r.handle).sort()).toEqual([h, `${h}x`]);

    const app = await receiveApplication(prisma, {
      brandSlug: brand.slug, source: "site_form", externalKey: randomUUID(), submittedAt: NOW, consentAt: NOW,
      answers: { "Seu nome completo:": "Bia Teste", "EMAIL:": `${h}@x.com`, "@ do seu instagram": `instagram.com/${h.toUpperCase()}/` },
    });
    list = await listProspects(prisma, ana, brand.id, {}, NOW);
    const signed = list.rows.find((r) => r.handle === h)!;
    expect(signed).toMatchObject({ status: "SIGNED_UP", followUp: false, application: { id: app.id, fullName: "Bia Teste" } });
    expect(list.kpis.signedUp).toBe(1);
    await expect(updateProspect(prisma, ana, signed.id, { status: "DECLINED" }, NOW)).rejects.toThrow(/já se inscreveu/);
    await expectDbError(prisma.prospect.update({ where: { id: signed.id }, data: { status: "FOLLOW_UP" } }), /Prospect_application_signed_up/);
  });

  it("travas do banco: @ fora do formato e observação longa", async () => {
    const { brand } = await seedBrand(prisma);
    const ana = await person(brand.id, "GESTAO", "Ana");
    const base = { brandId: brand.id, ownerId: ana.userId, approachedOn: new Date("2026-10-20T00:00:00Z"), statusAt: NOW };
    await expectDbError(prisma.prospect.create({ data: { ...base, handle: "@Maiuscula" } }), /Prospect_handle_format/);
    await expectDbError(prisma.prospect.create({ data: { ...base, handle: `ok${letters(4).toLowerCase()}`, note: "x".repeat(501) } }), /Prospect_note_length/);
    await expectDbError(prisma.brand.update({ where: { id: brand.id }, data: { prospectFirstMessage: "" } }), /Brand_prospect_messages/);
  });

  it("mensagens prontas: link da hunter, padrão por marca e edição só pela Gestão", async () => {
    const { brand } = await seedBrand(prisma);
    const ana = await person(brand.id, "GESTAO", "Ana Gestão");
    const dani = await person(brand.id, "HUNTER", "Dani");
    const code = letters(6).toLowerCase();
    await prisma.hunterLink.create({ data: { brandId: brand.id, userId: dani.userId, code } });
    expect((await myProspectMessages(prisma, dani, brand.id, "https://cc")).vars).toMatchObject({ me: "Dani", link: `https://cc/i/${code}` });
    expect((await myProspectMessages(prisma, ana, brand.id, "https://cc")).vars.link).toBe("https://cc/inscricao");
    await expect(saveProspectMessages(prisma, dani, brand.id, { first: "Oi", proposal: "" })).rejects.toThrow(ProspectError);
    await saveProspectMessages(prisma, ana, brand.id, { first: "Oi, (Nome)! Sou a {EU}.", proposal: "" });
    const m = await myProspectMessages(prisma, dani, brand.id, "https://cc");
    expect(m).toMatchObject({ first: "Oi, (Nome)! Sou a {EU}.", custom: true, canEdit: false });
    expect(m.proposal).toContain("{LINK}"); // vazio volta ao padrão
  });
});
