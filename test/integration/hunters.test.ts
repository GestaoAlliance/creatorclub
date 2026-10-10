import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { listApplications, receiveApplication } from "@/lib/onboarding/applications";
import { createHunterLink, hunterPanel, recordHunterClick, resolveHunterLink, setFormLink } from "@/lib/onboarding/hunters";
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
});
