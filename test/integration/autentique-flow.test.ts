import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/autentique/client";
import { checkContracts, checkCreatorContracts, enqueueDueContractChecks, sendContract } from "@/lib/autentique/contracts";
import { connectAutentique } from "@/lib/autentique/credentials";
import { publishContract } from "@/lib/contracts/sign";
import { approveApplication, receiveApplication } from "@/lib/onboarding/applications";
import type { ShopifyClient } from "@/lib/shopify/client";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
const encKey = randomBytes(32);
const PREV_KEY = process.env.INTEGRATION_ENC_KEY;
beforeAll(() => {
  // Aprovar usa a conexão guardada (chave de criptografia do ambiente); no teste, uma chave só do teste.
  process.env.INTEGRATION_ENC_KEY = encKey.toString("base64");
});
afterAll(async () => {
  process.env.INTEGRATION_ENC_KEY = PREV_KEY;
  await prisma.$disconnect();
});

/** Shopify falsa: nunca toca a loja real (D-REALSTORE). */
const shopCalls: unknown[] = [];
const shop = async () => ({ shop: "x", graphql: async (_q: string, v: unknown) => (shopCalls.push(v), { discountCodeBasicCreate: { codeDiscountNode: { id: "gid://x/77" }, userErrors: [] } }) }) as unknown as ShopifyClient;

/** Autentique falso: guarda o que foi enviado e responde a situação que o teste mandar. */
function fakeAutentique() {
  const state: { sent: FormData[]; status: "none" | "signed" | "rejected" } = { sent: [], status: "none" };
  const fetcher: Fetcher = async (_url, init) => {
    const reply = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) });
    if (init.body instanceof FormData) {
      state.sent.push(init.body);
      return reply({ createDocument: { id: `doc-${state.sent.length}-${randomUUID()}` } });
    }
    const q = JSON.parse(init.body as string) as { query: string; variables: { id?: string } };
    if (q.query.includes("me {")) return reply({ me: { id: "u", name: "Marca", email: "contratos@marca.com" } });
    const signed = state.status === "signed" ? { created_at: "2026-10-13 18:00:00" } : null;
    const rejected = state.status === "rejected" ? { created_at: "2026-10-13 18:00:00", reason: "CPF errado" } : null;
    return reply({ document: { id: q.variables.id, files: { signed: null }, signatures: [{ email: "MARIA@exemplo.com", action: { name: "SIGN" }, signed, rejected }] } });
  };
  return { state, fetcher };
}

const BODY = "Contrato de teste. CONTRATADA: {{CONTRATADA}}. Cupom {{CUPOM}} com {{DESCONTO}}; comissão {{COMISSAO}}; mínimo {{MINIMO}}.\\nKit:\\n{{KIT}}\\nPrazo {{MESES}}. {{DATA}}. ".padEnd(260, "x");

async function setup() {
  const { brand } = await seedBrand(prisma);
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
  const sa = (await loadActor(prisma, id))!;
  await publishContract(prisma, sa, { brandId: brand.id, kind: "INFLUENCER", title: "Contrato de parceria", body: BODY });
  const template = await prisma.contractTemplate.create({
    data: { brandId: brand.id, key: `influencer-${letters(4)}`, name: "Influencer", releaseMinCents: 50_000, months: 6, kitTiers: [{ fromCents: 100_000, products: 1 }], welcomeProducts: 3 },
  });
  const aut = fakeAutentique();
  await connectAutentique(prisma, sa, { brandId: brand.id, token: "t".repeat(40), sandbox: true }, aut.fetcher, encKey);
  return { brand, sa, template, aut };
}

describe("contrato pelo Autentique (D-AUTENTIQUE, banco real)", () => {
  it("aprovar envia o contrato e não cria cupom; assinado: contrato marcado, kit de 3 e cupom criado na Shopify", async () => {
    const s = await setup();
    const app = await receiveApplication(prisma, {
      brandSlug: s.brand.slug, source: "site_form", externalKey: randomUUID(), submittedAt: new Date(), consentAt: new Date(),
      answers: { "Seu nome completo:": "Maria da Silva", "EMAIL:": "maria@exemplo.com".replace("maria", `maria${letters(5)}`), "Sou:": "Influencer", "CPF: ": "529.982.247-25" },
    });
    const code = letters(6);
    shopCalls.length = 0;
    const r = await approveApplication(prisma, s.sa, { applicationId: app.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 500, contractTemplateId: s.template.id }, shop, new Date(), { fetcher: s.aut.fetcher, encKey });
    expect(r.contract).toMatchObject({ sent: true, sandbox: true });
    expect(shopCalls).toHaveLength(0); // nada na Shopify antes de assinar
    expect(await prisma.coupon.findUnique({ where: { brandId_code: { brandId: s.brand.id, code } } })).toBeNull();
    const creator = await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId } });
    expect(creator.contractRequiredAt).toBeNull(); // assinatura é no Autentique, não no portal

    // O PDF foi com o texto preenchido (cupom pendente) e a creator como signatária.
    const ops = JSON.parse(String(s.aut.state.sent[0]!.get("operations")));
    expect(ops.variables.signers).toEqual([{ name: "Maria da Silva", email: expect.stringContaining("@exemplo.com"), action: "SIGN" }]);
    const req = await prisma.contractRequest.findFirstOrThrow({ where: { creatorId: r.creatorId } });
    expect(req).toMatchObject({ status: "SENT", pendingCouponCode: code, pendingDiscountBps: 500, sandbox: true });
    expect(req.body).toContain(`Cupom ${code}`);
    expect(req.bodySha256).toBe(createHash("sha256").update(req.body, "utf8").digest("hex"));
    // Um contrato em aberto por creator.
    await expect(sendContract(prisma, s.sa, r.creatorId, {}, { fetcher: s.aut.fetcher, encKey })).rejects.toThrow(/esperando a assinatura/);
    await expectDbError(
      prisma.contractRequest.create({ data: { ...req, id: randomUUID(), externalId: randomUUID() } }),
      /ContractRequest_one_open_per_creator/,
    );

    // Ainda não assinou: nada muda; a fila agenda a conferência.
    await enqueueDueContractChecks(prisma); // o envio já agendou; não duplica na mesma janela de 5 min
    expect(await prisma.job.count({ where: { type: "autentique.check", brandId: s.brand.id } })).toBe(1);
    expect(await checkContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop })).toMatchObject({ signed: 0 });

    s.aut.state.status = "signed";
    expect(await checkContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop })).toMatchObject({ signed: 1, coupons: 1, errors: 0 });
    const after = await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId }, include: { couponAssignments: { include: { coupon: true } }, kitGrants: true } });
    expect(after.contractSigned).toBe(true);
    expect(after.contractStart).not.toBeNull();
    expect(after.contractEnd).not.toBeNull();
    expect(after.couponAssignments[0]).toMatchObject({ coupon: { code, shopifyId: "gid://x/77", discountBps: 500 } });
    expect(after.couponAssignments[0]!.confirmedAt).not.toBeNull();
    expect(after.kitGrants).toEqual([expect.objectContaining({ kind: "WELCOME", products: 3 })]);
    expect(shopCalls).toHaveLength(1);
    // Rodar de novo não duplica nada.
    expect(await checkContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop })).toEqual({ signed: 0, rejected: 0, coupons: 0, errors: 0 });
    await expectDbError(prisma.contractRequest.update({ where: { id: req.id }, data: { signedAt: null } }), /ContractRequest_signed_has_date/);
  });

  it("creator que já existe (cupom antigo): envio pela ficha; recusado fica com o motivo e pode reenviar", async () => {
    const s = await setup();
    const acc = await prisma.creatorAccount.create({ data: { name: "Ana Teste", email: `ana${letters(5)}@exemplo.com`, cpf: "52998224725" } });
    const c = await prisma.creator.create({ data: { brandId: s.brand.id, accountId: acc.id, categories: ["INFLUENCER"], contractTemplateId: s.template.id, contractRequiredAt: new Date() } });
    await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: c.id, kind: "WELCOME", month: "2026-09", salesCents: 0, products: 1 } });

    const sent = await sendContract(prisma, s.sa, c.id, {}, { fetcher: s.aut.fetcher, encKey });
    expect(sent.email).toBe(acc.email);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: c.id } })).contractRequiredAt).toBeNull();

    s.aut.state.status = "rejected";
    expect(await checkCreatorContracts(prisma, s.sa, c.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop })).toMatchObject({ rejected: 1 });
    expect(await prisma.contractRequest.findFirstOrThrow({ where: { creatorId: c.id } })).toMatchObject({ status: "REJECTED", rejectReason: "CPF errado" });

    // Reenvia depois de corrigir; assinado não dá segundo kit de boas-vindas e não cria cupom (ela já tem).
    s.aut.state.status = "none";
    await sendContract(prisma, s.sa, c.id, {}, { fetcher: s.aut.fetcher, encKey });
    s.aut.state.status = "signed";
    expect(await checkCreatorContracts(prisma, s.sa, c.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop })).toMatchObject({ signed: 1, coupons: 0 });
    expect(await prisma.kitGrant.count({ where: { creatorId: c.id, kind: "WELCOME" } })).toBe(1);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: c.id } })).contractSigned).toBe(true);
  });

  it("sem Autentique conectado, a aprovação segue como antes (cupom na hora, assinatura no portal)", async () => {
    const { brand } = await seedBrand(prisma);
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
    const sa = (await loadActor(prisma, id))!;
    const template = await prisma.contractTemplate.create({ data: { brandId: brand.id, key: `inf-${letters(4)}`, name: "Inf", releaseMinCents: 50_000, months: 6, kitTiers: [], welcomeProducts: 3 } });
    const app = await receiveApplication(prisma, {
      brandSlug: brand.slug, source: "site_form", externalKey: randomUUID(), submittedAt: new Date(), consentAt: new Date(),
      answers: { "Seu nome completo:": "Bia Souza", "EMAIL:": `bia${letters(5)}@exemplo.com`, "Sou:": "Influencer" },
    });
    const r = await approveApplication(prisma, sa, { applicationId: app.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500, contractTemplateId: template.id }, shop);
    expect(r.contract).toBeNull();
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId } })).contractRequiredAt).not.toBeNull();
  });
});
