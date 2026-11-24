import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { addDaysKey, dayKey, distratoLinkMessage, distratoTextKinds, renderContract, startOfLocalDay, whatsappChatUrl, CONTRACT_TEXT_LABEL } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { createAutentiqueDocument, getAutentiqueDocument, type Fetcher } from "@/lib/autentique/client";
import { loadAutentique } from "@/lib/autentique/credentials";
import { contractPdf } from "@/lib/autentique/pdf";
import { nextWhatsAppTime } from "@/lib/autentique/applications";
import { currentContract } from "@/lib/contracts/sign";
import { enqueueJob } from "@/lib/jobs/queue";
import { configuredWhatsApp, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";
import { ArchiveError, setCouponsEnd } from "./archive";

/**
 * D-DISTRATO (pedido da Fátima, 2026-11-23; respostas do responsável): a Gestão encerra a parceria na ficha, com a data
 * (hoje ou futura). O cupom vale até 23h59 desse dia: o fim já fica gravado na Shopify ao agendar (se a Shopify recusar,
 * nada muda). No dia seguinte o worker processa: a creator fica Desligada (D-ENDRELEASE libera toda a comissão), o cupom
 * fica inativo, os produtos liberados e não escolhidos expiram e os pedidos esperando aprovação são cancelados (os que já
 * estão "Preparando" ficam para a Gestão decidir). Em seguida o distrato sai pelo Autentique (e-mail e link no WhatsApp),
 * se o texto estiver publicado em Contratos; sem texto, fica esperando e a Gestão manda pela ficha depois. Até ser
 * processado, a Gestão pode cancelar: o cupom volta a valer sem fim e nada é enviado.
 */

export class TerminationError extends Error {}

export const DISTRATO_SEND_JOB = "distrato.send";
export const DISTRATO_LINK_JOB = "distrato.link";
export const DISTRATO_CHECK_JOB = "distrato.check";
const SYSTEM = "system:distrato";
const ENDED_REASON = "Parceria encerrada (distrato).";

type Deps = { clientFor?: ClientFactory; fetcher?: Fetcher; encKey?: Buffer; now?: Date };

const fold = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

async function loadCreator(prisma: PrismaClient, actor: Actor | null, creatorId: string) {
  const c = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      id: true, brandId: true, status: true, archivedAt: true,
      brand: { select: { timezone: true } },
      couponAssignments: { where: { validTo: null, coupon: { kind: "CREATOR" } }, select: { coupon: { select: { id: true, code: true, shopifyId: true } } } },
    },
  });
  if (!c) throw new TerminationError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", c.brandId)) throw new TerminationError("Só a Gestão encerra parcerias.");
  return c;
}

const openTermination = (prisma: PrismaClient, creatorId: string) =>
  prisma.creatorTermination.findFirst({ where: { creatorId, cancelledAt: null }, orderBy: { createdAt: "desc" } });

/** Agenda o encerramento: o cupom já fica com o fim (23h59 do dia, no fuso da marca) na Shopify. */
export async function scheduleTermination(prisma: PrismaClient, actor: Actor | null, creatorId: string, endDay: string, deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const c = await loadCreator(prisma, actor, creatorId);
  if (c.archivedAt || c.status === "DEACTIVATED") throw new TerminationError("Creator já desligada.");
  if (!isDay(endDay)) throw new TerminationError("Escolha a data de encerramento.");
  if (endDay < dayKey(now, c.brand.timezone)) throw new TerminationError("A data de encerramento não pode ser no passado.");
  if (await openTermination(prisma, creatorId)) throw new TerminationError("Já existe um encerramento para ela. Atualize a página.");
  const endsAt = startOfLocalDay(addDaysKey(endDay, 1), c.brand.timezone);
  const coupons = c.couponAssignments.map((a) => a.coupon);
  try {
    await setCouponsEnd(prisma, c.brandId, coupons, endsAt, deps.clientFor ?? defaultClientFactory);
  } catch (error) {
    if (error instanceof ArchiveError) throw new TerminationError(error.message);
    throw error;
  }
  await prisma.$transaction(async (tx) => {
    const t = await tx.creatorTermination.create({ data: { brandId: c.brandId, creatorId, endDate: new Date(`${endDay}T00:00:00Z`), scheduledById: actor!.userId, createdAt: now } });
    await tx.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId: actor!.userId, action: "creator.termination_scheduled", entity: "Creator", entityId: creatorId, after: { terminationId: t.id, endDay, couponEndsAt: endsAt.toISOString(), coupons: coupons.map((x) => x.code) } },
    });
  });
}

/** Desfaz o encerramento ainda não processado: o cupom volta a valer sem data de fim. */
export async function cancelTermination(prisma: PrismaClient, actor: Actor | null, creatorId: string, deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const c = await loadCreator(prisma, actor, creatorId);
  const t = await openTermination(prisma, creatorId);
  if (!t) throw new TerminationError("Não há encerramento agendado.");
  if (t.processedAt) throw new TerminationError("A parceria já foi encerrada: não dá para desfazer.");
  try {
    await setCouponsEnd(prisma, c.brandId, c.couponAssignments.map((a) => a.coupon), null, deps.clientFor ?? defaultClientFactory);
  } catch (error) {
    if (error instanceof ArchiveError) throw new TerminationError(error.message);
    throw error;
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.creatorTermination.updateMany({ where: { id: t.id, processedAt: null, cancelledAt: null }, data: { cancelledAt: now, cancelledById: actor!.userId } });
    if (count === 0) throw new TerminationError("A parceria acabou de ser encerrada: atualize a página.");
    await tx.auditLog.create({ data: { brandId: c.brandId, actorType: "USER", actorId: actor!.userId, action: "creator.termination_cancelled", entity: "Creator", entityId: creatorId, after: { terminationId: t.id, endDay: dayOf(t.endDate) } } });
  });
}

/**
 * Worker: encerramentos cuja data já passou (no fuso da marca). Cada um numa transação: Desligada, cupom inativo,
 * produtos não escolhidos expiram, pedidos esperando aprovação cancelados. Depois, a tarefa do distrato.
 */
export async function processDueTerminations(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.creatorTermination.findMany({
    where: { processedAt: null, cancelledAt: null, endDate: { lt: new Date(`${dayKey(now)}T00:00:00Z`) } },
    select: { id: true, brandId: true, creatorId: true, endDate: true, brand: { select: { timezone: true } } },
    take: 50,
  });
  let n = 0;
  for (const t of due) {
    const endDay = dayOf(t.endDate);
    if (endDay >= dayKey(now, t.brand.timezone)) continue; // ainda é o dia (marca em outro fuso)
    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.creatorTermination.updateMany({ where: { id: t.id, processedAt: null, cancelledAt: null }, data: { processedAt: now } });
      if (count === 0) return false;
      const c = await tx.creator.findUniqueOrThrow({ where: { id: t.creatorId }, select: { status: true, deactivatedAt: true } });
      await tx.creator.update({ where: { id: t.creatorId }, data: { status: "DEACTIVATED", deactivatedAt: c.deactivatedAt ?? now } });
      const coupons = await tx.couponAssignment.findMany({ where: { creatorId: t.creatorId, validTo: null, coupon: { kind: "CREATOR" } }, select: { couponId: true } });
      await tx.coupon.updateMany({ where: { id: { in: coupons.map((x) => x.couponId) } }, data: { active: false } });
      const waiting = await tx.shipment.findMany({ where: { creatorId: t.creatorId, status: "AWAITING_APPROVAL" }, select: { id: true } });
      const shipmentIds = waiting.map((s) => s.id);
      if (shipmentIds.length) {
        await tx.shipment.updateMany({ where: { id: { in: shipmentIds }, status: "AWAITING_APPROVAL" }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: SYSTEM, rejectReason: ENDED_REASON } });
      }
      // Kits dos pedidos cancelados e os ainda não escolhidos: expiram (não viram dinheiro nem outra vantagem).
      const expired = await tx.kitGrant.updateMany({
        where: { creatorId: t.creatorId, OR: [{ status: "PENDING" }, ...(shipmentIds.length ? [{ shipmentId: { in: shipmentIds } }] : [])] },
        data: { status: "EXPIRED", expiredAt: now, shipmentId: null, chosenAt: null },
      });
      await tx.auditLog.create({
        data: {
          brandId: t.brandId, actorType: "JOB", actorId: SYSTEM, action: "creator.terminated", entity: "Creator", entityId: t.creatorId,
          before: { status: c.status }, after: { terminationId: t.id, endDay, status: "DEACTIVATED", cancelledShipments: shipmentIds, expiredKits: expired.count },
        },
      });
      await enqueueJob(tx, { type: DISTRATO_SEND_JOB, brandId: t.brandId, payload: { terminationId: t.id }, dedupeKey: `distrato:${t.id}`, runAt: now, maxAttempts: 3 });
      return true;
    });
    if (done) n++;
  }
  return n;
}

/**
 * Gera o distrato preenchido e manda pelo Autentique. Sem texto publicado (ou sem e-mail/CPF): guarda o motivo em
 * `lastError` e espera (a Gestão manda pela ficha). `actor` null = envio automático do processamento.
 */
export async function sendDistrato(prisma: PrismaClient, actor: Actor | null, terminationId: string, deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const t = await prisma.creatorTermination.findUnique({
    where: { id: terminationId },
    select: {
      id: true, brandId: true, creatorId: true, endDate: true, processedAt: true, cancelledAt: true, sentAt: true,
      brand: { select: { name: true, slug: true } },
      creator: {
        select: {
          receivesAsIndividual: true, contractStart: true, activatedAt: true,
          account: { select: { name: true, email: true, cpf: true, cnpj: true, instagram: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true, addrZip: true } },
        },
      },
    },
  });
  if (!t) throw new TerminationError("Encerramento não encontrado.");
  if (actor && !can(actor.grants, "creators.edit", t.brandId)) throw new TerminationError("Só a Gestão manda o distrato.");
  if (!t.processedAt || t.cancelledAt) throw new TerminationError("O distrato só sai depois da data de encerramento.");
  if (t.sentAt) throw new TerminationError("O distrato já foi enviado.");
  const fail = async (msg: string) => {
    await prisma.creatorTermination.update({ where: { id: t.id }, data: { lastError: msg } });
    if (actor) throw new TerminationError(msg);
    return null;
  };
  const kinds = distratoTextKinds(t.creator.receivesAsIndividual);
  let doc: Awaited<ReturnType<typeof currentContract>> = null;
  for (const k of kinds) if (!doc) doc = await currentContract(prisma, t.brandId, k);
  if (!doc) return fail(`Falta publicar o texto "${CONTRACT_TEXT_LABEL[kinds[0]!]}" em Contratos.`);
  const conn = await loadAutentique(prisma, t.brandId, deps.encKey);
  if (!conn) return fail("A marca não tem o Autentique conectado.");
  const a = t.creator.account;
  const cpf = (a.cpf ?? "").replace(/\D/g, "");
  const cnpj = (a.cnpj ?? "").replace(/\D/g, "");
  const email = fold(a.email).toLowerCase();
  const fullName = fold(a.name);
  if (!email || email.endsWith(".invalid")) return fail("A creator não tem e-mail no cadastro: o distrato vai por e-mail.");
  if (cpf.length !== 11) return fail("A creator não tem CPF no cadastro: o distrato precisa dele.");
  const address = a.addrStreet
    ? [`${a.addrStreet}, ${a.addrNumber ?? "s/n"}${a.addrComplement ? ` - ${a.addrComplement}` : ""}`, a.addrDistrict, a.addrCity && a.addrState ? `${a.addrCity}/${a.addrState}` : a.addrCity, a.addrZip ? `CEP ${a.addrZip}` : null]
        .filter(Boolean)
        .join(", ")
    : "(endereço não informado)";
  const app = await prisma.creatorApplication.findFirst({ where: { creatorId: t.creatorId }, orderBy: { submittedAt: "desc" }, select: { companyName: true } });
  const endDay = dayOf(t.endDate);
  const start = t.creator.contractStart ? dayOf(t.creator.contractStart) : t.creator.activatedAt ? dayKey(t.creator.activatedAt) : null;
  const pj = !t.creator.receivesAsIndividual && cnpj.length === 14;
  const body = renderContract(doc.body, {
    fullName, cpf, address, cnpj: pj ? cnpj : null, companyName: pj ? fold(app?.companyName) || null : null,
    coupon: null, discountBps: null, rateBps: null, releaseMinCents: null, kitTiers: [], months: 6, videoGoal: 0,
    signedAt: now, instagram: a.instagram, email, contractStartDay: start, endDay,
  });
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  let created: { id: string; signLink: string | null };
  try {
    created = await createAutentiqueDocument(
      conn.token,
      {
        name: `${doc.title} - ${fullName}`.slice(0, 180),
        message: `Olá, ${fullName.split(" ")[0]}! Este é o termo de distrato da sua parceria com a ${t.brand.name} (encerrada em ${endDay.split("-").reverse().join("/")}): confira e assine.`,
        pdf: await contractPdf(doc.title, body),
        fileName: `distrato-${t.brand.slug}.pdf`,
        signers: [{ name: fullName, email }],
        sandbox: conn.sandbox,
      },
      deps.fetcher,
    );
  } catch (error) {
    return fail(error instanceof Error ? `Autentique: ${error.message}`.slice(0, 300) : "Não foi possível enviar ao Autentique.");
  }
  const actorId = actor?.userId ?? SYSTEM;
  await prisma.$transaction(async (tx) => {
    await tx.creatorTermination.update({
      where: { id: t.id },
      data: { contractDocumentId: doc.id, externalId: created.id, sandbox: conn.sandbox, signerEmail: email, body, bodySha256, signLink: created.signLink, sentAt: now, lastError: null },
    });
    await tx.auditLog.create({
      data: { brandId: t.brandId, actorType: actor ? "USER" : "SYSTEM", actorId, action: "distrato.sent", entity: "Creator", entityId: t.creatorId, after: { terminationId: t.id, externalId: created.id, email, kind: doc.kind, version: doc.version, bodySha256, sandbox: conn.sandbox } },
    });
    if (created.signLink) await enqueueJob(tx, { type: DISTRATO_LINK_JOB, brandId: t.brandId, payload: { terminationId: t.id }, dedupeKey: `distrato-link:${t.id}`, runAt: nextWhatsAppTime(now), maxAttempts: 5 });
  });
  return { email, sandbox: conn.sandbox };
}

/** Link do distrato pelo WhatsApp da marca (uma vez). Sem n8n, instância ou celular: fica só o e-mail. */
export async function sendDistratoLink(prisma: PrismaClient, sender: WhatsAppSender | null, terminationId: string, now = new Date()) {
  const t = await prisma.creatorTermination.findUnique({
    where: { id: terminationId },
    select: { id: true, signLink: true, linkSentAt: true, signedAt: true, endDate: true, brand: { select: { name: true, whatsappInstance: true } }, creator: { select: { account: { select: { name: true, phone: true } } } } },
  });
  if (!t || !t.signLink || t.linkSentAt || t.signedAt || !sender || !t.brand.whatsappInstance) return false;
  const chat = whatsappChatUrl(t.creator.account.phone);
  if (!chat) return false;
  await sender({
    instance: t.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""),
    text: distratoLinkMessage({ name: t.creator.account.name, brand: t.brand.name, link: t.signLink, endDay: dayOf(t.endDate) }),
    notificationId: `distrato:${t.id}`, kind: "DISTRATO_LINK", brand: t.brand.name,
  });
  await prisma.creatorTermination.update({ where: { id: t.id }, data: { linkSentAt: now } });
  return true;
}

/** Confere no Autentique os distratos enviados e ainda não assinados (com a conferência dos contratos). */
export async function checkDistratos(prisma: PrismaClient, brandId: string, deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const open = await prisma.creatorTermination.findMany({ where: { brandId, sentAt: { not: null }, signedAt: null, rejectedAt: null }, take: 50 });
  if (open.length === 0) return 0;
  const conn = await loadAutentique(prisma, brandId, deps.encKey);
  if (!conn) return 0;
  let signed = 0;
  for (const t of open) {
    try {
      const doc = await getAutentiqueDocument(conn.token, t.externalId!, deps.fetcher);
      const mine = doc.signatures.find((s) => s.email?.toLowerCase() === t.signerEmail?.toLowerCase()) ?? doc.signatures[0];
      if (mine?.signedAt || mine?.rejectedAt) {
        await prisma.$transaction([
          prisma.creatorTermination.update({ where: { id: t.id }, data: mine.signedAt ? { signedAt: now, lastError: null } : { rejectedAt: now, lastError: mine.rejectReason?.slice(0, 300) ?? "Recusado no Autentique." } }),
          prisma.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: SYSTEM, action: mine.signedAt ? "distrato.signed" : "distrato.rejected", entity: "Creator", entityId: t.creatorId, after: { terminationId: t.id } } }),
        ]);
        if (mine.signedAt) signed++;
      }
    } catch (error) {
      await prisma.creatorTermination.update({ where: { id: t.id }, data: { lastError: String(error instanceof Error ? error.message : error).slice(0, 300) } });
    }
  }
  return signed;
}

/** De hora em hora: marcas com distrato esperando assinatura ganham uma conferência. */
export async function enqueueDueDistratoChecks(prisma: PrismaClient, now = new Date()): Promise<number> {
  const hour = Math.floor(now.getTime() / 3_600_000);
  const brands = await prisma.creatorTermination.findMany({ where: { sentAt: { not: null }, signedAt: null, rejectedAt: null }, distinct: ["brandId"], select: { brandId: true } });
  let n = 0;
  for (const b of brands) if (await enqueueJob(prisma, { type: DISTRATO_CHECK_JOB, brandId: b.brandId, dedupeKey: `distrato-check:${b.brandId}:${hour}`, runAt: now })) n++;
  return n;
}

/** Tarefas da fila do distrato. */
export function terminationHandlers(prisma: PrismaClient) {
  return {
    [DISTRATO_SEND_JOB]: async (job: { payload: unknown }) => {
      const id = (job.payload as { terminationId?: string } | null)?.terminationId;
      if (id) await sendDistrato(prisma, null, id);
    },
    [DISTRATO_LINK_JOB]: async (job: { payload: unknown }) => {
      const id = (job.payload as { terminationId?: string } | null)?.terminationId;
      if (id) await sendDistratoLink(prisma, configuredWhatsApp(), id);
    },
    [DISTRATO_CHECK_JOB]: async (job: { brandId: string | null }) => {
      if (job.brandId) await checkDistratos(prisma, job.brandId);
    },
  };
}

/** Para a ficha: o encerramento em aberto (agendado ou processado) e os envios "Preparando" que a Gestão decide. */
export async function terminationView(prisma: PrismaClient, creatorId: string) {
  const t = await prisma.creatorTermination.findFirst({
    where: { creatorId, cancelledAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, endDate: true, createdAt: true, processedAt: true, sentAt: true, signedAt: true, rejectedAt: true, signLink: true, signerEmail: true, lastError: true, sandbox: true },
  });
  if (!t) return null;
  const preparing = t.processedAt ? await prisma.shipment.count({ where: { creatorId, status: "PREPARING" } }) : 0;
  return { ...t, endDay: dayOf(t.endDate), preparing };
}
