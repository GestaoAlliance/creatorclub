import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { listApplications, receiveApplication, rejectApplication } from "@/lib/onboarding/applications";
import { createHunterLink, hunterPanel, myHunterPanel, recordHunterClick, resolveHunterLink, setFormLink } from "@/lib/onboarding/hunters";
import { staffHome } from "@/lib/staff/home";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "HUNTER" | "ENVIO", brandId: string, name: string = role) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

const TEMPLATE = "https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.123=CODIGO";

describe("links dos hunters (D-HUNTERLINK, banco real)", () => {
  it("Gestão cria o link do hunter e cola o link do formulário; clique contado; candidata chega marcada", async () => {
    const { brand } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const hunter = await userWith("HUNTER", brand.id, "Ana Hunter");

    await expect(setFormLink(prisma, gestao, { brandId: brand.id, form: "hunter", url: "https://docs.google.com/forms/x" })).rejects.toThrow(/CODIGO/);
    await setFormLink(prisma, gestao, { brandId: brand.id, form: "hunter", url: TEMPLATE });
    await expect(createHunterLink(prisma, gestao, { brandId: brand.id, userId: gestao.userId, code: "gestao" })).rejects.toThrow(/não é hunter/);
    await createHunterLink(prisma, gestao, { brandId: brand.id, userId: hunter.userId, code: "Ána" });
    await expect(createHunterLink(prisma, gestao, { brandId: brand.id, userId: hunter.userId, code: "outra" })).rejects.toThrow(/já/);

    const target = await resolveHunterLink(prisma, brand.slug, "hunter", "ANA");
    expect(target).toMatchObject({ url: TEMPLATE.replace("CODIGO", "ana") });
    await recordHunterClick(prisma, target!.click!, { ip: "1.2.3.4", userAgent: "x" });
    expect(await resolveHunterLink(prisma, brand.slug, "hunter", "ninguem")).toEqual({ url: TEMPLATE.replace("CODIGO", ""), click: null });
    expect(await resolveHunterLink(prisma, brand.slug, "captacao", "ana")).toBeNull(); // formulário sem link configurado

    const r = await receiveApplication(prisma, {
      brandSlug: brand.slug,
      source: "hunter_form",
      externalKey: randomUUID(),
      submittedAt: new Date(),
      answers: { "Seu nome completo:": "Maria Exemplo", "EMAIL:": "m@x.com", "Código de quem te convidou": " ana " },
    });
    const row = (await listApplications(prisma, gestao)).rows.find((x) => x.id === r.id);
    expect(row?.hunter).toEqual({ name: "Ana Hunter", code: "ana" });

    const [panel] = (await hunterPanel(prisma, gestao)).filter((b) => b.id === brand.id);
    expect(panel!.forms).toEqual({ hunter: TEMPLATE, captacao: null });
    expect(panel!.hunters).toEqual([{ userId: hunter.userId, name: "Ana Hunter", email: expect.any(String), link: { code: "ana", clicks: 1, clicks30: 1, applications: 1, approved: 0 } }]);
    expect(await prisma.auditLog.count({ where: { brandId: brand.id, action: { in: ["hunter.link", "form.link"] } } })).toBe(2);
  });

  it("sem permissão não mexe; travas do banco", async () => {
    const { brand } = await seedBrand(prisma);
    const envio = await userWith("ENVIO", brand.id);
    await expect(setFormLink(prisma, envio, { brandId: brand.id, form: "hunter", url: TEMPLATE })).rejects.toThrow(/permissão/);
    const hunter = await userWith("HUNTER", brand.id);
    await expectDbError(prisma.hunterLink.create({ data: { brandId: brand.id, userId: hunter.userId, code: "Ana!" } }), /HunterLink_code_format/);
    await expectDbError(prisma.formLink.create({ data: { brandId: brand.id, form: "hunter", urlTemplate: "https://x.com", updatedById: "x" } }), /FormLink_values/);
    const link = await prisma.hunterLink.create({ data: { brandId: brand.id, userId: hunter.userId, code: "bia" } });
    await expectDbError(prisma.hunterClick.create({ data: { brandId: brand.id, hunterLinkId: link.id, form: "outro" } }), /HunterClick_form/);
    const click = await prisma.hunterClick.create({ data: { brandId: brand.id, hunterLinkId: link.id, form: "hunter" } });
    await expectDbError(prisma.hunterClick.delete({ where: { id: click.id } }), /HunterClick é somente inserção/);
  });

  it("U3: a hunter vê só o próprio link e as próprias indicações, sem contato nem motivo de recusa", async () => {
    const { brand } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const bia = await userWith("HUNTER", brand.id, "Bia");
    const caio = await userWith("HUNTER", brand.id, "Caio");
    expect(await myHunterPanel(prisma, bia)).toEqual([]);
    expect((await staffHome(prisma, bia)).hunter).toEqual({ clicks30: 0, inReview: 0, approved: 0, hasLink: false });
    await createHunterLink(prisma, gestao, { brandId: brand.id, userId: bia.userId, code: "bia" });
    await createHunterLink(prisma, gestao, { brandId: brand.id, userId: caio.userId, code: "caio" });
    const target = await resolveHunterLink(prisma, brand.slug, "inscricao", "bia");
    await recordHunterClick(prisma, target!.click!, { ip: "1.2.3.4", userAgent: "x" });
    const answers = (name: string, code: string) => ({ "Seu nome completo:": name, "EMAIL:": `${randomUUID()}@x.com`, "@ do seu Instagram:": "@perfil", "Quantidade de seguidores no instagram": "12 mil", "Seu whatsapp com DDD:": "11999999999", "Código de quem te convidou": code });
    const a1 = await receiveApplication(prisma, { brandSlug: brand.slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: answers("Maria", "bia") });
    await receiveApplication(prisma, { brandSlug: brand.slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: answers("Joana", "caio") });
    await rejectApplication(prisma, gestao, a1.id, "motivo interno");

    const [panel] = await myHunterPanel(prisma, bia);
    expect(panel).toMatchObject({ code: "bia", clicks: 1, clicks30: 1, counts: { total: 1, inReview: 0, approved: 0, rejected: 1 } });
    expect(panel!.applications).toEqual([{ id: a1.id, name: "Maria", instagram: "perfil", followers: "12 mil", submittedAt: expect.any(Date), status: "REJECTED" }]);
    expect(JSON.stringify(panel)).not.toMatch(/motivo interno|11999999999|@x\.com/);
    expect((await staffHome(prisma, bia)).hunter).toEqual({ clicks30: 1, inReview: 0, approved: 0, hasLink: true });
    await expect(myHunterPanel(prisma, gestao)).rejects.toThrow(/permissão/);
  });
});
