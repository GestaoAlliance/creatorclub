import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import {
  AUTENTIQUE_CHECK_JOB,
  checkApplicationContracts,
  CONTRACT_LINK_JOB,
  CONTRACT_SEND_JOB,
  enqueueApplicationContract,
  enqueueDueContractChecks,
  runApplicationContractJob,
  sendApplicationContract,
  sendContractLink,
} from "@/lib/autentique/applications";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique } from "@/lib/autentique/credentials";
import { publishContract } from "@/lib/contracts/sign";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { approveApplication, listApplications, receiveApplication, rejectApplication } from "@/lib/onboarding/applications";
import { myHunterPanel } from "@/lib/onboarding/hunters";
import type { ShopifyClient } from "@/lib/shopify/client";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
const encKey = randomBytes(32);
const PREV_KEY = process.env.INTEGRATION_ENC_KEY;
beforeAll(() => {
  // A conexão guardada usa a chave de criptografia do ambiente; no teste, uma chave só do teste.
  process.env.INTEGRATION_ENC_KEY = encKey.toString("base64");
});
afterAll(async () => {
  process.env.INTEGRATION_ENC_KEY = PREV_KEY;
  await prisma.$disconnect();
});

/** Shopify falsa: nunca toca a loja real (D-REALSTORE). */
const shopCalls: unknown[] = [];
const shop = async () => ({ shop: "x", graphql: async (_q: string, v: unknown) => (shopCalls.push(v), { discountCodeBasicCreate: { codeDiscountNode: { id: "gid://x/77" }, userErrors: [] } }) }) as unknown as ShopifyClient;

/** Autentique falso: guarda o que foi enviado/cancelado e responde a situação que o teste mandar. */
function fakeAutentique() {
  const state: { sent: FormData[]; deleted: string[]; status: "none" | "signed" | "rejected" } = { sent: [], deleted: [], status: "none" };
  const fetcher: Fetcher = async (_url, init) => {
    const reply = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) });
    if (init.body instanceof FormData) {
      state.sent.push(init.body);
      const id = `doc-${state.sent.length}-${randomUUID()}`;
      return reply({ createDocument: { id, signatures: [{ public_id: "dono", action: null, link: null }, { public_id: "s1", action: { name: "SIGN" }, link: { short_link: `https://assina.ae/${id}` } }] } });
    }
    const q = JSON.parse(init.body as string) as { query: string; variables: { id?: string } };
    if (q.query.includes("me {")) return reply({ me: { id: "u", name: "Marca", email: "contratos@marca.com" } });
    if (q.query.includes("deleteDocument")) return (state.deleted.push(q.variables.id!), reply({ deleteDocument: true }));
    const signed = state.status === "signed" ? { created_at: "2026-10-29 18:00:00" } : null;
    const rejected = state.status === "rejected" ? { created_at: "2026-10-29 18:00:00", reason: "CPF errado" } : null;
    return reply({ document: { id: q.variables.id, files: { signed: null }, signatures: [{ email: "x@y.com", action: { name: "SIGN" }, signed, rejected }] } });
  };
  return { state, fetcher };
}

const BODY = "Contrato de teste. CONTRATADA: {{CONTRATADA}}. Cupom {{CUPOM}} com {{DESCONTO}}; comissão {{COMISSAO}}; mínimo {{MINIMO}}.\nKit:\n{{KIT}}\nPrazo {{MESES}}. {{DATA}}. ".padEnd(260, "x");

async function setup() {
  const { brand } = await seedBrand(prisma);
  await prisma.brand.update({ where: { id: brand.id }, data: { defaultCommissionBps: 1500, defaultDiscountBps: 1000, whatsappInstance: "botanika" } });
  const mk = async (role: "SUPER_ADMIN" | "GESTAO" | "HUNTER") => {
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId: role === "SUPER_ADMIN" ? null : brand.id } } } });
    return (await loadActor(prisma, id))!;
  };
  const sa = await mk("SUPER_ADMIN");
  const gestao = await mk("GESTAO");
  await publishContract(prisma, sa, { brandId: brand.id, kind: "INFLUENCER", title: "Contrato de parceria", body: BODY });
  await prisma.contractTemplate.create({ data: { brandId: brand.id, key: "influencer-2026-01", name: "Influencer antigo", months: 3, documentKind: "INFLUENCER" } });
  const template = await prisma.contractTemplate.create({
    data: { brandId: brand.id, key: "influencer-2026-10", name: "Influencer 2026-10", releaseMinCents: 50_000, months: 6, kitTiers: [{ fromCents: 100_000, products: 1 }], documentKind: "INFLUENCER" },
  });
  const aut = fakeAutentique();
  await connectAutentique(prisma, sa, { brandId: brand.id, token: "t".repeat(40), sandbox: true }, aut.fetcher, encKey);
  return { brand, sa, gestao, template, aut, mk };
}

async function apply(slug: string, extra: Record<string, string> = {}) {
  return receiveApplication(prisma, {
    brandSlug: slug,
    source: "site_form",
    externalKey: randomUUID(),
    submittedAt: new Date(),
    consentAt: new Date(),
    answers: {
      "Seu nome completo:": "Maria da Silva",
      "EMAIL:": `maria${letters(5)}@exemplo.com`,
      "Seu WhatsApp:": "(11) 98888-7777",
      "Sou:": "Influencer",
      "CPF:": "529.982.247-25",
      "Endereço para entrega:": "Rua das Flores, 100, Centro, São Paulo/SP",
      "SUGESTÃO DE NOME DE CUPOM:": `MARIA${letters(4)}`,
      ...extra,
    },
  });
}

describe("contrato da candidata pelo Autentique (D-AUTENTIQUE2, banco real)", () => {
  it("cadastro gera o contrato sozinho (versão mais nova do tipo, cupom dela, padrão da marca); aprovar só depois de assinado, com os valores do contrato", async () => {
    const s = await setup();
    const app = await apply(s.brand.slug);
    await enqueueApplicationContract(prisma, s.brand.id, app.id);
    expect(await prisma.job.count({ where: { type: CONTRACT_SEND_JOB, dedupeKey: `contract-app:${app.id}` } })).toBe(1);

    await runApplicationContractJob(prisma, app.id, { fetcher: s.aut.fetcher, encKey });
    const req = await prisma.contractRequest.findFirstOrThrow({ where: { applicationId: app.id } });
    const coupon = (await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).suggestedCoupon!.toUpperCase();
    expect(req).toMatchObject({ status: "SENT", creatorId: null, contractTemplateId: s.template.id, pendingCouponCode: coupon, pendingDiscountBps: 1000, rateBps: 1500, sandbox: true });
    expect(req.signLink).toMatch(/^https:\/\/assina\.ae\//);
    expect(req.body).toContain(`Cupom ${coupon} com 10%; comissão 15%`);
    expect(req.body).toContain("529.982.247-25");
    expect(await prisma.job.count({ where: { type: CONTRACT_LINK_JOB, dedupeKey: `contract-link:${req.id}` } })).toBe(1);
    // Rodar de novo (a fila repetiu) não manda outro.
    await runApplicationContractJob(prisma, app.id, { fetcher: s.aut.fetcher, encKey });
    expect(s.aut.state.sent).toHaveLength(1);

    // Link pelo WhatsApp da marca, uma vez.
    const sent: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void sent.push(m);
    expect(await sendContractLink(prisma, sender, req.id)).toBe(true);
    expect(await sendContractLink(prisma, sender, req.id)).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ instance: "botanika", phone: "5511988887777", kind: "CONTRACT_LINK" });
    expect(sent[0]!.text).toContain(req.signLink!);

    // Lista: selo "não assinado"; aprovar travado.
    const row = (await listApplications(prisma, s.gestao)).rows.find((r) => r.id === app.id)!;
    expect(row).toMatchObject({ autentique: true, contract: { status: "SENT", coupon, rateBps: 1500 } });
    const input = { applicationId: app.id, couponCode: "OUTRO", category: "UGC" as const, rateBps: 900, discountBps: 500 };
    await expect(approveApplication(prisma, s.gestao, input, shop)).rejects.toThrow(/ainda não assinou/);

    // A conferência acha a assinatura.
    await enqueueDueContractChecks(prisma);
    expect(await prisma.job.count({ where: { type: AUTENTIQUE_CHECK_JOB, brandId: s.brand.id } })).toBe(1);
    s.aut.state.status = "signed";
    expect(await checkApplicationContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey })).toMatchObject({ signed: 1 });

    // Aprova com os valores do contrato (os do formulário são ignorados) e liga o contrato à creator.
    const r = await approveApplication(prisma, s.gestao, input, shop);
    expect(r.couponCode).toBe(coupon);
    const creator = await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId }, include: { commissionPolicies: true, couponAssignments: { include: { coupon: true } } } });
    expect(creator).toMatchObject({ categories: ["INFLUENCER"], contractTemplateId: s.template.id, contractSigned: true });
    expect(creator.commissionPolicies[0]!.rateBps).toBe(1500);
    expect(creator.couponAssignments[0]!.coupon).toMatchObject({ code: coupon, discountBps: 1000 });
    expect((await prisma.contractRequest.findUniqueOrThrow({ where: { id: req.id } })).creatorId).toBe(r.creatorId);
  });

  it("o que impede o envio fica escrito; a Gestão reenvia com outro cupom (o anterior é cancelado); recusar cancela no Autentique", async () => {
    const s = await setup();
    const taken = letters(7);
    await prisma.coupon.create({ data: { brandId: s.brand.id, code: taken, kind: "CREATOR", classifiedAt: new Date(), classifiedById: s.gestao.userId } });
    const app = await apply(s.brand.slug, { "SUGESTÃO DE NOME DE CUPOM:": taken });
    await runApplicationContractJob(prisma, app.id, { fetcher: s.aut.fetcher, encKey });
    expect(await prisma.contractRequest.count({ where: { applicationId: app.id } })).toBe(0);
    expect((await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).contractError).toMatch(new RegExp(`cupom ${taken} já existe`));

    const hunter = await s.mk("HUNTER");
    await expect(sendApplicationContract(prisma, hunter, app.id, { couponCode: letters(6) }, { fetcher: s.aut.fetcher, encKey })).rejects.toThrow(/Sem permissão/);
    const first = await sendApplicationContract(prisma, s.gestao, app.id, { couponCode: letters(6) }, { fetcher: s.aut.fetcher, encKey });
    expect((await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).contractError).toBeNull();
    const code2 = letters(6);
    const second = await sendApplicationContract(prisma, s.gestao, app.id, { couponCode: code2, rateBps: 1200 }, { fetcher: s.aut.fetcher, encKey });
    expect(await prisma.contractRequest.findUniqueOrThrow({ where: { id: first!.requestId } })).toMatchObject({ status: "CANCELLED" });
    expect(s.aut.state.deleted).toHaveLength(1);
    expect(await prisma.contractRequest.findUniqueOrThrow({ where: { id: second!.requestId } })).toMatchObject({ status: "SENT", pendingCouponCode: code2.toUpperCase(), rateBps: 1200 });

    // Outra candidata não pode usar o mesmo cupom de um contrato em aberto.
    const other = await apply(s.brand.slug);
    await expect(sendApplicationContract(prisma, s.gestao, other.id, { couponCode: code2 }, { fetcher: s.aut.fetcher, encKey })).rejects.toThrow(/contrato de outra candidata/);

    const r = await rejectApplication(prisma, s.gestao, app.id, "", new Date(), { fetcher: s.aut.fetcher, encKey });
    expect(r.cancelled).toBe(1);
    expect(await prisma.contractRequest.findUniqueOrThrow({ where: { id: second!.requestId } })).toMatchObject({ status: "CANCELLED" });
    expect(s.aut.state.deleted).toHaveLength(2);
  });

  it("recusa da candidata no Autentique fica registrada; hunter vê a situação do contrato", async () => {
    const s = await setup();
    const hunter = await s.mk("HUNTER");
    const link = await prisma.hunterLink.create({ data: { brandId: s.brand.id, userId: hunter.userId, code: letters(6).toLowerCase() } });
    const app = await apply(s.brand.slug);
    await prisma.creatorApplication.update({ where: { id: app.id }, data: { hunterLinkId: link.id } });
    await sendApplicationContract(prisma, s.gestao, app.id, {}, { fetcher: s.aut.fetcher, encKey });
    expect((await myHunterPanel(prisma, hunter))[0]!.applications[0]).toMatchObject({ status: "NEW", contract: "SENT" });
    s.aut.state.status = "rejected";
    expect(await checkApplicationContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey })).toMatchObject({ rejected: 1 });
    expect(await prisma.contractRequest.findFirstOrThrow({ where: { applicationId: app.id } })).toMatchObject({ status: "REJECTED", rejectReason: "CPF errado" });
  });

  it("marca sem Autentique: a tarefa não faz nada e a aprovação segue como antes (D4Sign)", async () => {
    const { brand } = await seedBrand(prisma);
    const app = await apply(brand.slug);
    await runApplicationContractJob(prisma, app.id);
    expect(await prisma.contractRequest.count({ where: { applicationId: app.id } })).toBe(0);
    expect((await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).contractError).toBeNull();
  });

  it("travas: contrato de candidata ou creator; um em aberto por candidata; comissão válida", async () => {
    const s = await setup();
    const app = await apply(s.brand.slug);
    const doc = await prisma.contractDocument.findFirstOrThrow({ where: { brandId: s.brand.id } });
    const base = { brandId: s.brand.id, contractDocumentId: doc.id, contractTemplateId: s.template.id, signerName: "M", signerEmail: "m@x.com", body: "b", bodySha256: "h", createdById: "t" };
    await expectDbError(prisma.contractRequest.create({ data: { ...base, externalId: randomUUID() } }), /ContractRequest_target/);
    await expectDbError(prisma.contractRequest.create({ data: { ...base, applicationId: app.id, externalId: randomUUID(), rateBps: 10_001 } }), /ContractRequest_rate_bps/);
    await prisma.contractRequest.create({ data: { ...base, applicationId: app.id, externalId: randomUUID() } });
    await expectDbError(prisma.contractRequest.create({ data: { ...base, applicationId: app.id, externalId: randomUUID() } }), /ContractRequest_one_open_per_application/);
  });
});
