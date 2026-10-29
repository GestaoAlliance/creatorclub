import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import {
  AUTENTIQUE_CHECK_JOB,
  awaitingContract,
  checkContracts,
  CONTRACT_LINK_JOB,
  CONTRACT_SEND_JOB,
  enqueueDueContractChecks,
  runCreatorContractJob,
  sendContractLink,
  sendCreatorContract,
} from "@/lib/autentique/applications";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique } from "@/lib/autentique/credentials";
import { publishContract } from "@/lib/contracts/sign";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { approveApplication, listApplications, receiveApplication } from "@/lib/onboarding/applications";
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

/** Shopify falsa: nunca toca a loja real (D-REALSTORE). `fail` faz a próxima criação de cupom falhar. */
const shopCalls: unknown[] = [];
let shopFails = 0;
const shop = async () =>
  ({
    shop: "x",
    graphql: async (_q: string, v: unknown) => {
      if (shopFails > 0) {
        shopFails--;
        throw new Error("Shopify fora do ar");
      }
      shopCalls.push(v);
      return { discountCodeBasicCreate: { codeDiscountNode: { id: `gid://x/${randomUUID()}` }, userErrors: [] } };
    },
  }) as unknown as ShopifyClient;
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
  // D-CONTRACTFLOW: os 2 modelos da Influencer (aqui só o de pessoa física; o de empresa falta).
  for (const kind of ["INFLUENCER_PF"]) {
    await publishContract(prisma, sa, { brandId: brand.id, kind, title: `Contrato ${kind}`, body: `${kind}. ${BODY}` });
  }
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
      "Seu whatsapp com DDD:": "(11) 98888-7777",
      "CPF: ": "529.982.247-25",
      "Vai receber como:": "Pessoa física (CPF)",
      "ENDEREÇO PARA ENTREGA DOS PRODUTOS": "Rua das Flores, 100, Centro, São Paulo/SP",
      "SUGESTÃO DE NOME DE CUPOM:": `MARIA${letters(4)}`,
      ...extra,
    },
  });
}

describe("contrato pelo Autentique depois da aprovação (D-CONTRACTFLOW, banco real)", () => {
  it("aprovar: creator esperando, cupom só reservado; contrato do modelo escolhido; portal travado; assinou: cupom, kit de 2 e mensagem", async () => {
    const s = await setup();
    const app = await apply(s.brand.slug);
    expect(await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).toMatchObject({ payoutAnswer: "Pessoa física (CPF)" });
    const code = letters(6);
    shopCalls.length = 0;
    const r = await approveApplication(
      prisma, s.gestao,
      { applicationId: app.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 1000, receivesAsIndividual: true, welcomeWithVideos: true },
      shop,
    );
    expect(r.awaitingContract).toBe(true);
    expect(shopCalls).toHaveLength(0); // nada na Shopify antes da assinatura
    const creator = await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId }, include: { couponAssignments: true, kitGrants: true } });
    expect(creator).toMatchObject({ contractSigned: false, pendingCouponCode: code.toUpperCase(), pendingDiscountBps: 1000, contractTemplateId: s.template.id, welcomeVideos: 3, goalStartAt: null });
    expect(creator.awaitingContractAt).not.toBeNull();
    expect(creator.couponAssignments).toHaveLength(0);
    expect(creator.kitGrants).toHaveLength(0);
    expect(await prisma.job.count({ where: { type: CONTRACT_SEND_JOB, dedupeKey: `contract-creator:${r.creatorId}` } })).toBe(1);
    expect(await awaitingContract(prisma, r.creatorId)).toMatchObject({ signed: false, status: null });

    // Outra candidata não pega o cupom reservado.
    const other = await apply(s.brand.slug);
    await expect(approveApplication(prisma, s.gestao, { applicationId: other.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 1000 }, shop)).rejects.toThrow(/reservado/);

    await runCreatorContractJob(prisma, r.creatorId, { fetcher: s.aut.fetcher, encKey });
    const req = await prisma.contractRequest.findFirstOrThrow({ where: { creatorId: r.creatorId } });
    expect(req).toMatchObject({ status: "SENT", applicationId: app.id, pendingCouponCode: code.toUpperCase(), rateBps: 1500 });
    expect(req.body.startsWith("INFLUENCER_PF.")).toBe(true); // modelo pessoa física
    expect(req.body).toContain(`Cupom ${code.toUpperCase()} com 10%; comissão 15%`);
    expect(await prisma.job.count({ where: { type: CONTRACT_LINK_JOB, dedupeKey: `contract-link:${req.id}` } })).toBe(1);
    await runCreatorContractJob(prisma, r.creatorId, { fetcher: s.aut.fetcher, encKey }); // a fila repetiu: não manda outro
    expect(s.aut.state.sent).toHaveLength(1);
    expect(await awaitingContract(prisma, r.creatorId)).toMatchObject({ signed: false, status: "SENT", signLink: req.signLink });

    const sent: WhatsAppMessage[] = [];
    expect(await sendContractLink(prisma, async (m) => void sent.push(m), req.id)).toBe(true);
    expect(sent[0]).toMatchObject({ instance: "botanika", phone: "5511988887777", kind: "CONTRACT_LINK" });

    const row = (await listApplications(prisma, s.gestao, "APPROVED")).rows.find((x) => x.id === app.id)!;
    expect(row).toMatchObject({ awaitingContract: { signed: false }, contract: { status: "SENT" } });

    // Assinou, mas a Shopify falhou: contrato vale, ativação tenta de novo.
    await enqueueDueContractChecks(prisma);
    expect(await prisma.job.count({ where: { type: AUTENTIQUE_CHECK_JOB, brandId: s.brand.id } })).toBeGreaterThanOrEqual(1);
    s.aut.state.status = "signed";
    shopFails = 1;
    expect(await checkContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop, origin: "https://x.test" })).toMatchObject({ signed: 1, activated: 0, errors: 1 });
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId } })).toMatchObject({ contractSigned: true, pendingCouponCode: code.toUpperCase() });
    expect(await awaitingContract(prisma, r.creatorId)).toMatchObject({ signed: true });

    expect(await checkContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop, origin: "https://x.test" })).toMatchObject({ activated: 1 });
    const active = await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId }, include: { couponAssignments: { include: { coupon: true } }, kitGrants: true, notifications: true } });
    expect(active).toMatchObject({ awaitingContractAt: null, pendingCouponCode: null, pendingDiscountBps: null });
    expect(active.goalStartAt).not.toBeNull();
    expect(active.contractStart).not.toBeNull();
    expect(active.couponAssignments[0]!.coupon).toMatchObject({ code: code.toUpperCase(), discountBps: 1000 });
    expect(active.kitGrants).toEqual([expect.objectContaining({ kind: "WELCOME", products: 2 })]);
    const welcome = active.notifications.find((n) => n.kind === "PARTNERSHIP_ACTIVE")!;
    expect(welcome.title).toBe(`Sua parceria com a ${s.brand.name} está ativa!`);
    expect(welcome.body).toContain(`*2. Seu cupom exclusivo:* ${code.toUpperCase()}`);
    expect(welcome.body).toContain("2 produtos");
    expect(await awaitingContract(prisma, r.creatorId)).toBeNull();
    expect(shopCalls).toHaveLength(1);
  });

  it("modelo que falta fica escrito para a Gestão; reenviar cancela o anterior; recusa no Autentique fica registrada", async () => {
    const s = await setup();
    const app = await apply(s.brand.slug, { "Vai receber como:": "Empresa (CNPJ)", "CNPJ: ": "11.222.333/0001-81" });
    const r = await approveApplication(prisma, s.gestao, { applicationId: app.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 1000, receivesAsIndividual: false, welcomeWithVideos: false }, shop);
    await runCreatorContractJob(prisma, r.creatorId, { fetcher: s.aut.fetcher, encKey });
    expect((await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).contractError).toMatch(/Influencer · empresa \(CNPJ\)"/);
    expect(await prisma.contractRequest.count({ where: { creatorId: r.creatorId } })).toBe(0);

    await publishContract(prisma, s.sa, { brandId: s.brand.id, kind: "INFLUENCER_PJ", title: "Contrato PJ", body: `INFLUENCER_PJ. ${BODY}` });
    const hunter = await s.mk("HUNTER");
    await expect(sendCreatorContract(prisma, hunter, r.creatorId, { fetcher: s.aut.fetcher, encKey })).rejects.toThrow(/Sem permissão/);
    const first = await sendCreatorContract(prisma, s.gestao, r.creatorId, { fetcher: s.aut.fetcher, encKey });
    expect((await prisma.contractRequest.findUniqueOrThrow({ where: { id: first!.requestId } })).body).toContain("11.222.333/0001-81");
    expect((await prisma.creatorApplication.findUniqueOrThrow({ where: { id: app.id } })).contractError).toBeNull();
    const second = await sendCreatorContract(prisma, s.gestao, r.creatorId, { fetcher: s.aut.fetcher, encKey });
    expect(await prisma.contractRequest.findUniqueOrThrow({ where: { id: first!.requestId } })).toMatchObject({ status: "CANCELLED" });
    expect(s.aut.state.deleted).toHaveLength(1);

    s.aut.state.status = "rejected";
    expect(await checkContracts(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey, clientFor: shop })).toMatchObject({ rejected: 1 });
    expect(await prisma.contractRequest.findUniqueOrThrow({ where: { id: second!.requestId } })).toMatchObject({ status: "REJECTED", rejectReason: "CPF errado" });
    expect(await awaitingContract(prisma, r.creatorId)).toMatchObject({ status: "REJECTED" });
  });

  it("travas: contrato de candidata ou creator; um em aberto por candidata; comissão válida; cupom reservado", async () => {
    const s = await setup();
    const app = await apply(s.brand.slug);
    const doc = await prisma.contractDocument.findFirstOrThrow({ where: { brandId: s.brand.id } });
    const base = { brandId: s.brand.id, contractDocumentId: doc.id, contractTemplateId: s.template.id, signerName: "M", signerEmail: "m@x.com", body: "b", bodySha256: "h", createdById: "t" };
    await expectDbError(prisma.contractRequest.create({ data: { ...base, externalId: randomUUID() } }), /ContractRequest_target/);
    await expectDbError(prisma.contractRequest.create({ data: { ...base, applicationId: app.id, externalId: randomUUID(), rateBps: 10_001 } }), /ContractRequest_rate_bps/);
    await prisma.contractRequest.create({ data: { ...base, applicationId: app.id, externalId: randomUUID() } });
    await expectDbError(prisma.contractRequest.create({ data: { ...base, applicationId: app.id, externalId: randomUUID() } }), /ContractRequest_one_open_per_application/);
    const { creator } = await seedBrand(prisma);
    await expectDbError(prisma.creator.update({ where: { id: creator.id }, data: { pendingCouponCode: "ABC" } }), /Creator_pending_coupon/);
    await expectDbError(prisma.creator.update({ where: { id: creator.id }, data: { pendingCouponCode: "abc", pendingDiscountBps: 500 } }), /Creator_pending_coupon/);
  });
});
