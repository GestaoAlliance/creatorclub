import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { createHunterLink, recordHunterClick, resolveHunterLink } from "@/lib/onboarding/hunters";
import { approveApplication } from "@/lib/onboarding/applications";
import { SIGNUP_LIMIT_PER_HOUR, signupCouponTaken, submitSignup, type SignupAuth } from "@/lib/onboarding/signup";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "HUNTER", brandId: string, name: string = role) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** CPF válido diferente a cada chamada (o cadastro recusa CPF repetido). */
let seq = Math.floor(Math.random() * 1e8);
function cpf(): string {
  const d = String(++seq % 1e9).padStart(9, "1").split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i]! * (len + 1 - i);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const values = (email: string, coupon = `C${randomUUID().slice(0, 8)}`): Record<string, string> => ({
  fullName: "Maria Exemplo", cpf: cpf(), cnpj: "", email, phone: "(11) 91234-5678", instagram: "@maria.exemplo", tiktok: "maria.tt", coupon,
  addrZip: "01310-100", addrStreet: "Avenida Paulista", addrNumber: "1000", addrComplement: "", addrDistrict: "Bela Vista", addrCity: "São Paulo", addrState: "SP",
});

/** Supabase Auth falso: cria e apaga logins em memória. */
function fakeAuth() {
  const users = new Map<string, string>();
  const auth: SignupAuth = {
    async createUser(email) {
      if ([...users.values()].includes(email)) return { error: "exists" };
      const id = randomUUID();
      users.set(id, email);
      return { userId: id };
    },
    async deleteUser(id) {
      users.delete(id);
    },
  };
  return { auth, users };
}
const PASSWORD = "senha-forte-123";
const base = (slug: string, email: string, ip: string, coupon?: string) => ({ brandSlug: slug, values: values(email, coupon), password: PASSWORD, honeypot: "", hunterCode: null, ip });

describe("cadastro de creator com conta (D-SIGNUPACCOUNT, banco real)", () => {
  it("cria login, conta com endereço e inscrição Nova ligada a ela, com aceite e hunter do link", async () => {
    const { brand } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const hunter = await userWith("HUNTER", brand.id, "Bia Hunter");
    await createHunterLink(prisma, gestao, { brandId: brand.id, userId: hunter.userId, code: "maria" });
    const target = await resolveHunterLink(prisma, brand.slug, "inscricao", "MARIA");
    expect(target).toMatchObject({ url: `/inscricao/${brand.slug}?h=maria`, click: { form: "inscricao" } });
    await recordHunterClick(prisma, target!.click!, { ip: "9.9.9.9", userAgent: "x" });

    const { auth, users } = fakeAuth();
    const now = new Date("2026-10-22T15:00:00Z");
    const email = `${randomUUID()}@Example.com`;
    const code = `MARIA${seq % 1000}`;
    expect(await submitSignup(prisma, { ...base(brand.slug, email, "1.1.1.1", code.toLowerCase()), hunterCode: "maria" }, auth, now)).toEqual({ ok: true, email: email.toLowerCase() });
    expect(users.size).toBe(1);
    const [userId] = [...users.keys()];
    const account = await prisma.creatorAccount.findUniqueOrThrow({ where: { email: email.toLowerCase() }, include: { applications: true } });
    expect(account).toMatchObject({ userId, name: "Maria Exemplo", instagram: "maria.exemplo", tiktok: "maria.tt", addrZip: "01310100", addrStreet: "Avenida Paulista", addrState: "SP", pixKey: null });
    expect(account.applications).toHaveLength(1);
    expect(account.applications[0]).toMatchObject({ brandId: brand.id, status: "NEW", source: "site_form", suggestedCoupon: code, tiktok: "@maria.tt", hunterCode: "maria", consentAt: now, brandsWanted: brand.name });
    expect(account.applications[0]!.hunterLinkId).not.toBeNull();
    expect(JSON.stringify(account.applications[0]!.raw)).toContain(`dados pessoais pela ${brand.name}`);
    expect(JSON.stringify(account.applications[0]!.raw)).not.toContain(PASSWORD);
    // Logada e ainda sem participação: sem acesso ao portal até a aprovação.
    expect(await loadActor(prisma, userId!)).toEqual({ userId, grants: [], creatorIds: {} });

    // Cupom reservado: outra pessoa não pega o mesmo; e-mail e CPF repetidos não criam outra conta.
    expect(await signupCouponTaken(prisma, brand.id, code.toLowerCase())).toBe(true);
    const twin = await submitSignup(prisma, base(brand.slug, `${randomUUID()}@x.com`, "2.2.2.2", code), auth, now);
    expect(twin).toEqual({ ok: false, errors: { coupon: "Este cupom já está em uso. Escolha outro." } });
    const again = await submitSignup(prisma, { ...base(brand.slug, email, "2.2.2.2"), values: { ...values(email), cpf: account.cpf! } }, auth, now);
    expect(again).toMatchObject({ ok: false, errors: { email: expect.stringMatching(/já tem cadastro/), cpf: expect.stringMatching(/já tem cadastro/) } });
    expect(users.size).toBe(1);

    // Aprovada (sem Autentique): a creator nasce na mesma conta, com o e-mail do login, e o portal libera.
    const shop = { clientFor: async () => ({ shop: "x", graphql: async () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: [] } }) }) as never };
    const r = await approveApplication(prisma, gestao, { applicationId: account.applications[0]!.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 500, email: "outro@x.com" }, shop.clientFor, now);
    expect(r.accountId).toBe(account.id);
    expect((await loadActor(prisma, userId!))!.creatorIds).toEqual({ [brand.id]: r.creatorId });
    expect(await signupCouponTaken(prisma, brand.id, code)).toBe(true);
  });

  it("robô, erros, senha curta, limite por aparelho; falha no banco apaga o login criado", async () => {
    const { brand } = await seedBrand(prisma);
    const { auth, users } = fakeAuth();
    const now = new Date("2026-10-22T15:00:00Z");
    expect(await submitSignup(prisma, { ...base(brand.slug, "robo@x.com", "3.3.3.3"), honeypot: "spam" }, auth, now)).toEqual({ ok: true, email: null });
    const bad = await submitSignup(prisma, { ...base(brand.slug, "x@", "3.3.3.3"), password: "curta" }, auth, now);
    expect(bad).toEqual({ ok: false, errors: { email: "E-mail inválido.", password: expect.stringMatching(/pelo menos 10/) } });
    await expect(submitSignup(prisma, base("nao-existe", "a@x.com", "3.3.3.3"), auth, now)).rejects.toThrow(/Marca/);
    expect(users.size).toBe(0);

    for (let i = 0; i < SIGNUP_LIMIT_PER_HOUR; i++) expect((await submitSignup(prisma, base(brand.slug, `${randomUUID()}@x.com`, "4.4.4.4"), auth, now)).ok).toBe(true);
    const blocked = await submitSignup(prisma, base(brand.slug, `${randomUUID()}@x.com`, "4.4.4.4"), auth, now);
    expect(blocked).toMatchObject({ ok: false, errors: { _form: expect.stringMatching(/muitos cadastros/) } });
    expect(users.size).toBe(SIGNUP_LIMIT_PER_HOUR);

    // O login já existe no Auth (ex.: alguém da equipe sem ficha): avisa no e-mail e não grava nada.
    const taken = `${randomUUID()}@x.com`;
    await auth.createUser(taken, PASSWORD);
    expect(await submitSignup(prisma, base(brand.slug, taken, "5.5.5.5"), auth, now)).toMatchObject({ ok: false, errors: { email: expect.stringMatching(/já tem cadastro/) } });

    // Banco recusa (ex.: User com o mesmo id): o login criado é apagado.
    const clash = randomUUID();
    await prisma.user.create({ data: { id: clash, email: `${clash}@x.com`, name: "X" } });
    const before = users.size;
    const clashing: SignupAuth = { createUser: async () => (users.set(clash, "c@x.com"), { userId: clash }), deleteUser: auth.deleteUser };
    expect(await submitSignup(prisma, base(brand.slug, `${randomUUID()}@x.com`, "6.6.6.6"), clashing, now)).toMatchObject({ ok: false });
    expect(users.size).toBe(before);

    await expectDbError(
      prisma.creatorApplication.create({ data: { brandId: brand.id, source: "site_form", externalKey: randomUUID(), submittedAt: now, fullName: "X", raw: {} } }),
      /CreatorApplication_site_consent/,
    );
  });
});
