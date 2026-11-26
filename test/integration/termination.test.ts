import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique } from "@/lib/autentique/credentials";
import { publishContract } from "@/lib/contracts/sign";
import { DISCOUNT_UPDATE_MUTATION } from "@/lib/coupons/discount";
import { cancelTermination, checkDistratos, processDueTerminations, scheduleTermination, sendDistrato, sendDistratoLink, terminationView } from "@/lib/creators/termination";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import type { ShopifyClient } from "@/lib/shopify/client";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
const encKey = randomBytes(32);
const PREV_KEY = process.env.INTEGRATION_ENC_KEY;
beforeAll(() => {
  process.env.INTEGRATION_ENC_KEY = encKey.toString("base64");
});
afterAll(async () => {
  process.env.INTEGRATION_ENC_KEY = PREV_KEY;
  await prisma.$disconnect();
});

/** Shopify falsa (D-REALSTORE): grava as chamadas; `refuse` faz a Shopify recusar. */
function fakeShopify(refuse = false) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const client = {
    shop: "x",
    graphql: async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      return { discountCodeBasicUpdate: { codeDiscountNode: refuse ? null : { id: String(variables.id) }, userErrors: refuse ? [{ message: "não" }] : [] } };
    },
  } as unknown as ShopifyClient;
  return { clientFor: async () => client, calls };
}

/** Autentique falso: guarda os PDFs enviados e responde a situação pedida. */
function fakeAutentique() {
  const state: { sent: FormData[]; status: "none" | "signed" } = { sent: [], status: "none" };
  const fetcher: Fetcher = async (_url, init) => {
    const reply = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) });
    if (init.body instanceof FormData) {
      state.sent.push(init.body);
      const id = `doc-${randomUUID()}`;
      return reply({ createDocument: { id, signatures: [{ public_id: "dono", action: null, link: null }, { public_id: "s1", action: { name: "SIGN" }, link: { short_link: `https://assina.ae/${id}` } }] } });
    }
    const q = JSON.parse(init.body as string) as { query: string; variables: { id?: string } };
    if (q.query.includes("me {")) return reply({ me: { id: "u", name: "Marca", email: "contratos@marca.com" } });
    const signed = state.status === "signed" ? { created_at: "2026-12-02 18:00:00" } : null;
    return reply({ document: { id: q.variables.id, files: { signed: null }, signatures: [{ public_id: "s1", email: "x@y.com", action: { name: "SIGN" }, link: null, signed, rejected: null }] } });
  };
  return { state, fetcher };
}

const DISTRATO = "TERMO DE DISTRATO. {{NOME}}, CPF {{CPF}}, e-mail {{EMAIL}}, contrato de {{INICIO}}, encerrado em {{ENCERRAMENTO}}. {{DATA}}. ".padEnd(260, "x");

async function setup(role: "GESTAO" | "PAGAMENTO" = "GESTAO") {
  const s = await seedBrand(prisma);
  await prisma.brand.update({ where: { id: s.brand.id }, data: { whatsappInstance: "marca" } });
  await prisma.coupon.update({ where: { id: s.coupon.id }, data: { shopifyId: "gid://shopify/DiscountCodeNode/7" } });
  await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { cpf: "52998224725", phone: "31999998888" } });
  await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "ACTIVE", receivesAsIndividual: true, contractStart: new Date("2026-06-10T00:00:00Z") } });
  const mk = async (r: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO") => {
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: r, roleGrants: { create: { role: r, brandId: r === "SUPER_ADMIN" ? null : s.brand.id } } } });
    return (await loadActor(prisma, id))!;
  };
  const actor = await mk(role);
  const sa = await mk("SUPER_ADMIN");
  await prisma.couponAssignment.create({ data: { brandId: s.brand.id, couponId: s.coupon.id, creatorId: s.creator.id, validFrom: new Date("2026-01-01"), createdById: sa.userId, confirmedAt: new Date(), confirmedById: sa.userId } });
  const aut = fakeAutentique();
  await connectAutentique(prisma, sa, { brandId: s.brand.id, token: "t".repeat(40), sandbox: true }, aut.fetcher, encKey);
  return { ...s, actor, sa, aut };
}

const shipment = (s: { brand: { id: string }; creator: { id: string } }, status: "AWAITING_APPROVAL" | "PREPARING") =>
  prisma.shipment.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, status, address: {}, createdById: "x", ...(status === "PREPARING" ? { approvedAt: new Date(), approvedById: "x" } : {}) } });

describe("encerrar parceria e distrato (D-DISTRATO, banco real)", () => {
  it("agenda com o fim do cupom na Shopify (23h59 de SP), desfaz até a data e trava data passada e permissão", async () => {
    const s = await setup();
    const now = new Date("2026-11-24T15:00:00Z");
    await expect(scheduleTermination(prisma, s.actor, s.creator.id, "2026-11-23", { clientFor: fakeShopify().clientFor, now })).rejects.toThrow(/passado/);
    await expect(scheduleTermination(prisma, s.actor, s.creator.id, "2026-11-30", { clientFor: fakeShopify(true).clientFor, now })).rejects.toThrow(/Shopify recusou/);
    expect(await prisma.creatorTermination.count({ where: { creatorId: s.creator.id } })).toBe(0); // Shopify recusou: nada mudou

    const shop = fakeShopify();
    await scheduleTermination(prisma, s.actor, s.creator.id, "2026-11-30", { clientFor: shop.clientFor, now });
    expect(shop.calls.at(-1)).toMatchObject({ query: DISCOUNT_UPDATE_MUTATION, variables: { id: "gid://shopify/DiscountCodeNode/7", input: { endsAt: "2026-12-01T03:00:00.000Z" } } });
    await expect(scheduleTermination(prisma, s.actor, s.creator.id, "2026-12-05", { clientFor: shop.clientFor, now })).rejects.toThrow(/Já existe/);
    await expectDbError(
      prisma.creatorTermination.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, endDate: new Date("2026-12-05"), scheduledById: "x" } }),
      /CreatorTermination_one_open/,
    );

    await cancelTermination(prisma, s.actor, s.creator.id, { clientFor: shop.clientFor, now });
    expect(shop.calls.at(-1)!.variables).toMatchObject({ input: { endsAt: null } });
    expect(await terminationView(prisma, s.creator.id)).toBeNull();
    // Cancelada não entra no processamento.
    expect(await processDueTerminations(prisma, new Date("2026-12-02T12:00:00Z"))).toBe(0);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { entityId: s.creator.id, action: { in: ["creator.termination_scheduled", "creator.termination_cancelled"] } } })).toBe(2);

    const pay = await setup("PAGAMENTO");
    await expect(scheduleTermination(prisma, pay.actor, pay.creator.id, "2026-11-30", { clientFor: shop.clientFor, now })).rejects.toThrow(/Gestão/);
  });

  it("no dia seguinte: Desligada, cupom inativo, produtos não escolhidos expiram, pedido esperando é cancelado; distrato espera o texto e sai pelo Autentique", async () => {
    const s = await setup();
    const shop = fakeShopify();
    await scheduleTermination(prisma, s.actor, s.creator.id, "2026-11-24", { clientFor: shop.clientFor, now: new Date("2026-11-23T15:00:00Z") });
    const pending = await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "WELCOME", month: "2026-11", salesCents: 0, products: 1 } });
    const waiting = await shipment(s, "AWAITING_APPROVAL");
    const chosen = await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "MONTHLY", month: "2026-10", salesCents: 100_000, products: 1, status: "CHOSEN", shipmentId: waiting.id, chosenAt: new Date() } });
    const preparing = await shipment(s, "PREPARING");

    // Ainda é o dia do encerramento (23h em SP = 02h UTC do dia 25): nada acontece.
    expect(await processDueTerminations(prisma, new Date("2026-11-25T02:00:00Z"))).toBe(0);
    const day = new Date("2026-11-25T12:00:00Z");
    expect(await processDueTerminations(prisma, day)).toBe(1);
    expect(await processDueTerminations(prisma, day)).toBe(0); // uma vez só
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).toMatchObject({ status: "DEACTIVATED", deactivatedAt: day });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).active).toBe(false);
    expect(await prisma.kitGrant.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: "EXPIRED", expiredAt: day });
    expect(await prisma.kitGrant.findUniqueOrThrow({ where: { id: chosen.id } })).toMatchObject({ status: "EXPIRED", shipmentId: null });
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: waiting.id } })).toMatchObject({ status: "CANCELLED", rejectReason: "Parceria encerrada (distrato)." });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: preparing.id } })).status).toBe("PREPARING");
    expect(await prisma.job.count({ where: { type: "distrato.send", dedupeKey: { startsWith: "distrato:" }, brandId: s.brand.id } })).toBe(1);
    await expect(cancelTermination(prisma, s.actor, s.creator.id, { clientFor: shop.clientFor })).rejects.toThrow(/não dá para desfazer/);

    // Sem texto publicado: espera, com o motivo na ficha.
    const t = (await terminationView(prisma, s.creator.id))!;
    expect(t).toMatchObject({ endDay: "2026-11-24", preparing: 1 });
    expect(await sendDistrato(prisma, null, t.id, { fetcher: s.aut.fetcher, encKey })).toBeNull();
    expect((await terminationView(prisma, s.creator.id))!.lastError).toMatch(/Falta publicar o texto "Distrato · pessoa física/);

    // Texto único publicado: sai pelo Autentique com os dados dela; o link vai pelo WhatsApp.
    await publishContract(prisma, s.sa, { brandId: s.brand.id, kind: "DISTRATO", title: "Termo de distrato", body: DISTRATO });
    const r = await sendDistrato(prisma, s.actor, t.id, { fetcher: s.aut.fetcher, encKey, now: new Date("2026-12-01T13:00:00Z") });
    expect(r).toMatchObject({ email: s.account.email, sandbox: true });
    expect(s.aut.state.sent).toHaveLength(1);
    const sent = await prisma.creatorTermination.findUniqueOrThrow({ where: { id: t.id } });
    expect(sent.body).toContain("encerrado em 24 de novembro de 2026");
    expect(sent.body).toContain("contrato de 10 de junho de 2026");
    expect(sent.body).toContain(`e-mail ${s.account.email}`);
    await expect(sendDistrato(prisma, s.actor, t.id, { fetcher: s.aut.fetcher, encKey })).rejects.toThrow(/já foi enviado/);
    const msgs: WhatsAppMessage[] = [];
    expect(await sendDistratoLink(prisma, async (m) => void msgs.push(m), t.id)).toBe(true);
    expect(msgs[0]!.text).toContain("encerrada em 24/11/2026");
    expect(msgs[0]!.text).toContain(sent.signLink!);
    expect(await sendDistratoLink(prisma, async (m) => void msgs.push(m), t.id)).toBe(false); // uma vez só

    s.aut.state.status = "signed";
    expect(await checkDistratos(prisma, s.brand.id, { fetcher: s.aut.fetcher, encKey })).toBe(1);
    expect((await terminationView(prisma, s.creator.id))!.signedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: s.creator.id, action: { in: ["creator.terminated", "distrato.sent", "distrato.signed"] } } })).toBe(3);
  });

  it("D-ENDNOW: com a data de hoje encerra na hora (cupom para agora, Desligada, distrato na fila)", async () => {
    const s = await setup();
    const shop = fakeShopify();
    const now = new Date("2026-11-26T19:20:00Z"); // 16h20 em SP
    const pending = await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "WELCOME", month: "2026-11", salesCents: 0, products: 1 } });
    expect(await scheduleTermination(prisma, s.actor, s.creator.id, "2026-11-26", { clientFor: shop.clientFor, now })).toEqual({ immediate: true });
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } })).toMatchObject({ status: "DEACTIVATED", deactivatedAt: now });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: s.coupon.id } })).active).toBe(false);
    expect((await prisma.kitGrant.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("EXPIRED");
    expect(await prisma.job.count({ where: { type: "distrato.send", brandId: s.brand.id } })).toBe(1);
    expect(await processDueTerminations(prisma, new Date("2026-11-27T12:00:00Z"))).toBe(0); // já processado
    // Data futura continua para o dia seguinte.
    const other = await setup();
    expect(await scheduleTermination(prisma, other.actor, other.creator.id, "2026-11-27", { clientFor: shop.clientFor, now })).toEqual({ immediate: false });
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: other.creator.id } })).status).toBe("ACTIVE");
  });

  it("travas do banco: distrato só depois de processado, cancelado não é processado, produto expirado tem data", async () => {
    const s = await setup();
    const t = await prisma.creatorTermination.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, endDate: new Date("2026-12-01"), scheduledById: "x" } });
    await expectDbError(prisma.creatorTermination.update({ where: { id: t.id }, data: { sentAt: new Date() } }), /CreatorTermination_sent/);
    await expectDbError(prisma.creatorTermination.update({ where: { id: t.id }, data: { cancelledAt: new Date(), cancelledById: "x", processedAt: new Date() } }), /CreatorTermination_cancel_or_process/);
    await expectDbError(prisma.creatorTermination.update({ where: { id: t.id }, data: { cancelledAt: new Date() } }), /CreatorTermination_cancelled_by/);
    await expectDbError(prisma.creatorTermination.update({ where: { id: t.id }, data: { signedAt: new Date() } }), /CreatorTermination_signed/);
    await expectDbError(prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "WELCOME", month: "2026-11", salesCents: 0, products: 1, status: "EXPIRED" } }), /KitGrant_expired/);
  });
});
