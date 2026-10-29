import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { createHunterLink, recordHunterClick, resolveHunterLink } from "@/lib/onboarding/hunters";
import { approveApplication } from "@/lib/onboarding/applications";
import { actionQueue } from "@/lib/actions/queue";
import { requestPortalAccess, SIGNUP_LIMIT_PER_HOUR, signupCouponTaken, submitSignup, type SignupAuth } from "@/lib/onboarding/signup";
import { createCreatorInvite, inviteCreatorsInBulk } from "@/lib/team/creator-invites";
import { expectDbError, seedBrand, testClient, letters } from "./fixtures";

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

const values = (email: string, coupon = `C${randomUUID().replace(/[^a-f]/g, "").slice(0, 8)}`): Record<string, string> => ({
  fullName: "Maria Exemplo", cpf: cpf(), cnpj: "", email, phone: "(11) 91234-5678", instagram: "@maria.exemplo", tiktok: "maria.tt", tiktokShop: "Sim", coupon, payoutAs: "Pessoa física (CPF)",
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
    const code = `MARIA${letters(4)}`;
    const withOrigin = base(brand.slug, email, "1.1.1.1", code.toLowerCase());
    expect(
      await submitSignup(prisma, { ...withOrigin, values: { ...withOrigin.values, heardFrom: "Outro", heardFromOther: "feira" }, hunterCode: "maria", campaignTag: "Stories Outubro" }, auth, now),
    ).toEqual({ ok: true, email: email.toLowerCase() });
    expect(users.size).toBe(1);
    const [userId] = [...users.keys()];
    const account = await prisma.creatorAccount.findUniqueOrThrow({ where: { email: email.toLowerCase() }, include: { applications: true } });
    expect(account).toMatchObject({ userId, name: "Maria Exemplo", instagram: "maria.exemplo", tiktok: "maria.tt", tiktokShop: true, addrZip: "01310100", addrStreet: "Avenida Paulista", addrState: "SP", pixKey: null });
    expect(account.applications).toHaveLength(1);
    expect(account.applications[0]).toMatchObject({ brandId: brand.id, status: "NEW", source: "site_form", suggestedCoupon: code, tiktok: "@maria.tt", hunterCode: "maria", consentAt: now, brandsWanted: brand.name, campaignTag: "stories-outubro", heardFrom: "Outro: feira" });
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
    expect(again).toMatchObject({ ok: false, errors: { email: expect.stringMatching(/já tem acesso/), cpf: expect.stringMatching(/já tem acesso/) } });
    expect(users.size).toBe(1);

    // Aprovada: a creator nasce na mesma conta, com o e-mail do login, e o portal libera.
    const shop = { clientFor: async () => ({ shop: "x", graphql: async () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: [] } }) }) as never };
    const r = await approveApplication(prisma, gestao, { applicationId: account.applications[0]!.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 500, email: "outro@x.com" }, shop.clientFor, now);
    expect(r.accountId).toBe(account.id);
    expect((await loadActor(prisma, userId!))!.creatorIds).toEqual({ [brand.id]: r.creatorId });
    expect(await signupCouponTaken(prisma, brand.id, code)).toBe(true);
  });

  it("D-PJADDR: empresa fora do MEI precisa entregar no endereço do CNPJ; MEI não; Receita fora do ar não trava", async () => {
    const { brand } = await seedBrand(prisma);
    const info = { legalName: "MARIA LTDA", mei: false, active: true, address: { zip: "01310100", street: "AV PAULISTA", number: "1000", complement: null, district: "BELA VISTA", city: "SAO PAULO", state: "SP" } };
    const pj = (email: string, regime: string, number = "1000") => {
      const b = base(brand.slug, email, "10.0.0.9");
      return { ...b, values: { ...b.values, payoutAs: "Empresa (CNPJ)", cnpj: "11.222.333/0001-81", taxRegime: regime, addrNumber: number } };
    };
    const { auth } = fakeAuth();
    const other = await submitSignup(prisma, pj(`${randomUUID()}@x.com`, "SIMPLES", "999"), auth, new Date(), async () => info);
    expect(other).toMatchObject({ ok: false, errors: { addrZip: expect.stringContaining("endereço do CNPJ: AV PAULISTA, 1000") } });
    expect(await submitSignup(prisma, pj(`${randomUUID()}@x.com`, "SIMPLES"), auth, new Date(), async () => "notfound")).toMatchObject({ ok: false, errors: { cnpj: expect.stringContaining("Receita") } });

    const email = `${randomUUID()}@x.com`;
    expect(await submitSignup(prisma, pj(email, "OUTRO"), auth, new Date(), async () => info)).toMatchObject({ ok: true });
    const acc = await prisma.creatorAccount.findUniqueOrThrow({ where: { email }, select: { taxRegime: true, applications: { select: { raw: true } } } });
    expect(acc.taxRegime).toBe("OUTRO");
    expect(acc.applications[0]!.raw).toMatchObject({ "Endereço do CNPJ:": "conferido com a Receita (MARIA LTDA)", "Regime tributário do CNPJ:": "Lucro Presumido ou Real" });

    let asked = 0;
    const mei = await submitSignup(prisma, pj(`${randomUUID()}@x.com`, "MEI", "999"), auth, new Date(), async () => (asked++, info));
    expect(mei).toMatchObject({ ok: true });
    expect(asked).toBe(0); // MEI nem consulta
    const down = `${randomUUID()}@x.com`;
    expect(await submitSignup(prisma, pj(down, "SIMPLES", "999"), auth, new Date(), async () => "unavailable")).toMatchObject({ ok: true });
    const d = await prisma.creatorAccount.findUniqueOrThrow({ where: { email: down }, select: { applications: { select: { raw: true } } } });
    expect(d.applications[0]!.raw).toMatchObject({ "Endereço do CNPJ:": expect.stringContaining("não conferido") });
    await expectDbError(prisma.creatorAccount.update({ where: { email }, data: { taxRegime: "LUCRO" } }), /CreatorAccount_taxRegime/);
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

  it("D-ACCESSREQ: já cadastrada sem senha pede o link; a tarefa aparece em Ações e sai com o convite", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const doc = cpf();
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { cpf: doc } });
    const { auth, users } = fakeAuth();
    const now = new Date("2026-10-26T13:00:00Z");

    // Mesmo CPF, outro e-mail: nada é criado e o formulário vira o pedido de acesso.
    const typed = { ...values(`${randomUUID()}@x.com`), cpf: doc };
    expect(await submitSignup(prisma, { ...base(brand.slug, "x@x.com", "7.7.7.7"), values: typed }, auth, now)).toEqual({ ok: false, errors: {}, existing: "request" });
    expect(users.size).toBe(0);
    expect(await prisma.creatorAccount.count({ where: { cpf: doc } })).toBe(1);

    await requestPortalAccess(prisma, typed, now);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).accessRequestedAt).toEqual(now);
    let tasks = (await actionQueue(prisma, brand.id, now)).filter((t) => t.kind === "ACCESS");
    expect(tasks).toEqual([expect.objectContaining({ creatorId: creator.id, owner: "GESTAO", message: null, detail: expect.stringMatching(/pediu o link de acesso ao portal em 26\/10\/2026/) })]);

    // Pedido repetido na mesma hora não muda nada; e-mail/CPF desconhecido não acusa erro.
    await requestPortalAccess(prisma, typed, new Date(now.getTime() + 60_000));
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).accessRequestedAt).toEqual(now);
    await expect(requestPortalAccess(prisma, values(`${randomUUID()}@x.com`), now)).resolves.toBeUndefined();

    // A Gestão gera o convite depois do pedido: a tarefa sai da fila.
    await createCreatorInvite(prisma, gestao, account.id, new Date(now.getTime() + 3_600_000));
    tasks = (await actionQueue(prisma, brand.id, now)).filter((t) => t.kind === "ACCESS");
    expect(tasks).toEqual([]);
  });

  it("D-ACCESSREQ: convites em massa só para quem não tem senha e tem e-mail real, com a mensagem do WhatsApp", async () => {
    const a = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", a.brand.id);
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { phone: "(31) 99876-5432" } });
    const fake = await prisma.creatorAccount.create({ data: { name: "Bia Provisória", email: `${randomUUID()}@import.creatorclub` } });
    const fakeCreator = await prisma.creator.create({ data: { brandId: a.brand.id, accountId: fake.id, categories: ["INFLUENCER"] } });
    const other = await seedBrand(prisma);

    const r = await inviteCreatorsInBulk(prisma, gestao, a.brand.id, [a.creator.id, fakeCreator.id, other.creator.id], { origin: "https://cc.test", email: null });
    expect(r).toHaveLength(2); // a creator de outra marca fica de fora
    const ok = r.find((x) => x.creatorId === a.creator.id)!;
    expect(ok.link).toMatch(/^https:\/\/cc\.test\/convite\/\S+$/);
    expect(ok.message).toContain(a.brand.name);
    expect(ok.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5531998765432\?text=/);
    expect(r.find((x) => x.creatorId === fakeCreator.id)).toMatchObject({ link: null, error: expect.stringMatching(/e-mail/) });
    await expect(inviteCreatorsInBulk(prisma, gestao, other.brand.id, [other.creator.id], { origin: "x", email: null })).rejects.toThrow(/permissão/);
    await expect(inviteCreatorsInBulk(prisma, gestao, a.brand.id, [], { origin: "x", email: null })).rejects.toThrow(/Marque/);
  });
});
