import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { createHunterLink, recordHunterClick, resolveHunterLink } from "@/lib/onboarding/hunters";
import { SIGNUP_LIMIT_PER_HOUR, submitSignup } from "@/lib/onboarding/signup";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "HUNTER", brandId: string, name: string = role) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

const values = (email: string): Record<string, string> => ({
  fullName: "Maria Exemplo", kind: "Influencer", phone: "(11) 91234-5678", email, instagram: "@maria.exemplo", followers: "5000",
  storiesViews: "400", niche: "Saúde", content: "Rotina", why: "Gosto", knows: "Sim", commissioned: "Não", accepts: "Sim",
  brands: "Botanika", collab: "Sim", address: "Rua A, 1", coupon: "MARIA", cpf: "529.982.247-25", pix: "chave",
});
const base = (slug: string, email: string, ip: string) => ({ brandSlug: slug, values: values(email), consent: true, honeypot: "", hunterCode: null, ip });

describe("inscrição pelo formulário do sistema (D-SIGNUP, banco real)", () => {
  it("vira candidata Nova com aceite, hunter do link e os mesmos campos do Google", async () => {
    const { brand } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const hunter = await userWith("HUNTER", brand.id, "Bia Hunter");
    await createHunterLink(prisma, gestao, { brandId: brand.id, userId: hunter.userId, code: "bia" });

    // Link do hunter: conta o clique e abre o formulário com o código.
    const target = await resolveHunterLink(prisma, brand.slug, "inscricao", "BIA");
    expect(target).toMatchObject({ url: "/inscricao?h=bia", click: { form: "inscricao" } });
    await recordHunterClick(prisma, target!.click!, { ip: "9.9.9.9", userAgent: "x" });
    expect(await resolveHunterLink(prisma, brand.slug, "inscricao", "ninguem")).toEqual({ url: "/inscricao", click: null });

    const now = new Date("2026-10-10T15:00:00Z");
    expect(await submitSignup(prisma, { ...base(brand.slug, "Maria@Example.com", "1.1.1.1"), hunterCode: "bia" }, now)).toEqual({ ok: true });
    const a = await prisma.creatorApplication.findFirstOrThrow({ where: { brandId: brand.id, source: "site_form" } });
    expect(a).toMatchObject({ status: "NEW", fullName: "Maria Exemplo", email: "maria@example.com", hunterCode: "bia", suggestedCoupon: "MARIA", consentAt: now });
    expect(a.hunterLinkId).not.toBeNull();
    expect(a.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(a.raw)).not.toContain("1.1.1.1");

    // A mesma pessoa enviando de novo no mesmo dia não duplica.
    expect(await submitSignup(prisma, base(brand.slug, "maria@example.com", "2.2.2.2"), now)).toEqual({ ok: true });
    expect(await prisma.creatorApplication.count({ where: { brandId: brand.id, source: "site_form" } })).toBe(1);
  });

  it("robô, erros, limite por aparelho e a trava do aceite", async () => {
    const { brand } = await seedBrand(prisma);
    const now = new Date("2026-10-10T15:00:00Z");
    expect(await submitSignup(prisma, { ...base(brand.slug, "robo@x.com", "3.3.3.3"), honeypot: "spam" }, now)).toEqual({ ok: true });
    const bad = await submitSignup(prisma, { ...base(brand.slug, "x@", "3.3.3.3"), consent: false }, now);
    expect(bad).toEqual({ ok: false, errors: { email: "E-mail inválido.", consent: "É preciso concordar para enviar." } });
    await expect(submitSignup(prisma, base("nao-existe", "a@x.com", "3.3.3.3"), now)).rejects.toThrow(/Marca/);

    for (let i = 0; i < SIGNUP_LIMIT_PER_HOUR; i++) expect((await submitSignup(prisma, base(brand.slug, `p${i}@x.com`, "4.4.4.4"), now)).ok).toBe(true);
    const blocked = await submitSignup(prisma, base(brand.slug, "p9@x.com", "4.4.4.4"), now);
    expect(blocked).toMatchObject({ ok: false, errors: { _form: expect.stringMatching(/muitas inscrições/) } });
    expect((await submitSignup(prisma, base(brand.slug, "p9@x.com", "5.5.5.5"), now)).ok).toBe(true);
    expect(await prisma.creatorApplication.count({ where: { brandId: brand.id, source: "site_form" } })).toBe(SIGNUP_LIMIT_PER_HOUR + 1);

    await expectDbError(
      prisma.creatorApplication.create({ data: { brandId: brand.id, source: "site_form", externalKey: randomUUID(), submittedAt: now, fullName: "X", raw: {} } }),
      /CreatorApplication_site_consent/,
    );
    const link = await prisma.hunterLink.findFirst({ select: { id: true, brandId: true } });
    if (link) await expectDbError(prisma.hunterClick.create({ data: { brandId: link.brandId, hunterLinkId: link.id, form: "outro" } }), /HunterClick_form/);
  });
});
