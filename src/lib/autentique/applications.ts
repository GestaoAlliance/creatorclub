import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps, contractLinkMessage, dayKey, isContractKind, longDate, parseKitTiers, renderContract, UGC_DEFAULT_VIDEO_GOAL, validateNewCouponCode, whatsappChatUrl, type ContractKind } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/rules";
import { currentContract } from "@/lib/contracts/sign";
import { validCouponDiscount } from "@/lib/coupons/create";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import { enqueueJob } from "@/lib/jobs/queue";
import { configuredWhatsApp, inWhatsAppHours, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { categoryFromAnswer, couponFromSuggestion, type Category } from "@/lib/onboarding/applications";
import { isValidCpf } from "@/lib/terms/terms";
import { createAutentiqueDocument, deleteAutentiqueDocument, getAutentiqueDocument, type Fetcher } from "./client";
import { hasAutentique, loadAutentique } from "./credentials";
import { contractPdf } from "./pdf";

/**
 * Contrato da candidata pelo Autentique (D-AUTENTIQUE2), nas marcas com o Autentique conectado (Botanika e VermeFree).
 * O cadastro do site gera o contrato sozinho (uma tarefa da fila, gravada junto com a candidatura): o texto do tipo
 * que ela escolheu (Influencer, Prescritor ou UGC, na versão de contrato mais nova desse tipo) é preenchido com os dados
 * dela, o cupom que ela sugeriu e a comissão e o desconto padrão da marca; vira PDF e vai para o e-mail dela pelo
 * Autentique. O link de assinatura também vai pelo WhatsApp da marca (das 9h às 20h). A cada 5 minutos o sistema
 * confere no Autentique quem assinou. A Gestão só aprova depois de assinado, com os valores do contrato; para mudar
 * algum valor, reenvia o contrato (o anterior é cancelado). Candidatas dos formulários antigos recebem pelo botão.
 */

export class ContractSendError extends Error {}

export const CONTRACT_SEND_JOB = "autentique.application_contract";
export const CONTRACT_LINK_JOB = "autentique.contract_link";
export const AUTENTIQUE_CHECK_JOB = "autentique.check";
const SYSTEM = "system:autentique";

type Deps = { fetcher?: Fetcher; encKey?: Buffer; now?: Date };
export type ContractOptions = { couponCode?: string; category?: Category; rateBps?: number; discountBps?: number };

const fold = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Próximo horário de mandar WhatsApp (9h às 20h de São Paulo): agora, ou às 9h do próximo dia útil do relógio. */
export function nextWhatsAppTime(now: Date): Date {
  if (inWhatsAppHours(now)) return now;
  // São Paulo está em UTC-3 o ano todo: 9h de lá = 12h UTC.
  const today = new Date(`${dayKey(now)}T12:00:00Z`);
  return today.getTime() > now.getTime() ? today : new Date(today.getTime() + 86_400_000);
}

/** Tarefa do cadastro do site: grava junto com a candidatura (mesma transação). */
export function enqueueApplicationContract(tx: Parameters<typeof enqueueJob>[0], brandId: string, applicationId: string, now = new Date()) {
  return enqueueJob(tx, { type: CONTRACT_SEND_JOB, brandId, payload: { applicationId }, dedupeKey: `contract-app:${applicationId}`, runAt: now, maxAttempts: 3 });
}

/**
 * Gera e envia o contrato da candidata. `actor` null = envio automático do cadastro (não reenvia se já há contrato
 * em aberto). Pela equipe (botão), um contrato ainda não assinado é cancelado e trocado pelo novo.
 */
export async function sendApplicationContract(
  prisma: PrismaClient,
  actor: Actor | null,
  applicationId: string,
  opts: ContractOptions = {},
  deps: Deps = {},
): Promise<{ requestId: string; email: string; sandbox: boolean; signLink: string | null } | null> {
  const now = deps.now ?? new Date();
  const app = await prisma.creatorApplication.findUnique({
    where: { id: applicationId },
    include: {
      brand: { select: { name: true, slug: true, defaultCommissionBps: true, defaultDiscountBps: true } },
      account: { select: { name: true, email: true, cpf: true, cnpj: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true, addrZip: true } },
    },
  });
  if (!app) throw new ContractSendError("Candidata não encontrada.");
  if (actor && !can(actor.grants, "creators.edit", app.brandId)) throw new ContractSendError("Sem permissão.");
  if (app.status !== "NEW") throw new ContractSendError("Esta candidata já foi decidida.");
  const open = await prisma.contractRequest.findFirst({ where: { applicationId, status: { in: ["SENT", "SIGNED"] } }, select: { id: true, brandId: true, status: true, externalId: true } });
  if (open && !actor) return null; // automático: já saiu
  if (open?.status === "SIGNED") throw new ContractSendError("Ela já assinou este contrato: a aprovação usa os valores dele.");
  const conn = await loadAutentique(prisma, app.brandId, deps.encKey);
  if (!conn) throw new ContractSendError("O Autentique desta marca não está conectado (Integrações → Autentique).");

  const email = normalizeEmail(app.account?.email ?? app.email ?? "") ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith(FAKE_EMAIL_DOMAIN)) throw new ContractSendError("A candidata não tem um e-mail válido para receber o contrato.");
  const category: ContractKind = opts.category ?? categoryFromAnswer(app.kindAnswer);
  if (!isContractKind(category)) throw new ContractSendError("Tipo inválido.");
  const templates = await prisma.contractTemplate.findMany({ where: { brandId: app.brandId, documentKind: category }, select: { id: true, key: true, name: true, months: true, releaseMinCents: true, kitTiers: true } });
  const template = templates.sort((a, b) => b.key.localeCompare(a.key))[0];
  if (!template) throw new ContractSendError(`Não há versão de contrato do tipo ${category} nesta marca (Contratos).`);
  const doc = await currentContract(prisma, app.brandId, category);
  if (!doc) throw new ContractSendError(`Não há texto de contrato publicado para o tipo ${category} (Contratos).`);

  const coupon = validateNewCouponCode(opts.couponCode ?? couponFromSuggestion(app.suggestedCoupon));
  if (!coupon.ok) throw new ContractSendError("Cupom sugerido inválido: escolha um cupom (letras e números, até 20) e envie o contrato pelo botão.");
  if (await prisma.coupon.findUnique({ where: { brandId_code: { brandId: app.brandId, code: coupon.code } }, select: { id: true } }))
    throw new ContractSendError(`O cupom ${coupon.code} já existe nesta marca: escolha outro e envie o contrato pelo botão.`);
  const reserved = await prisma.contractRequest.findFirst({
    where: { brandId: app.brandId, pendingCouponCode: coupon.code, status: { in: ["SENT", "SIGNED"] }, NOT: { applicationId } },
    select: { id: true },
  });
  if (reserved) throw new ContractSendError(`O cupom ${coupon.code} já está no contrato de outra candidata: escolha outro.`);
  const rateBps = opts.rateBps ?? app.brand.defaultCommissionBps;
  const discountBps = opts.discountBps ?? app.brand.defaultDiscountBps;
  try {
    assertBps(rateBps);
    assertBps(discountBps);
  } catch {
    throw new ContractSendError("Comissão ou desconto inválido.");
  }
  if (!validCouponDiscount(discountBps)) throw new ContractSendError("O desconto precisa ficar entre 0,01% e 50%.");

  const a = app.account;
  const structured = a?.addrStreet
    ? [`${a.addrStreet}, ${a.addrNumber ?? "s/n"}${a.addrComplement ? ` - ${a.addrComplement}` : ""}`, a.addrDistrict, a.addrCity && a.addrState ? `${a.addrCity}/${a.addrState}` : a.addrCity, a.addrZip ? `CEP ${a.addrZip}` : null]
        .filter(Boolean)
        .join(", ")
    : null;
  const address = structured ?? fold((app.address ?? "").replace(/\s*\n+\s*/g, ", ")).replace(/,\s*,/g, ",");
  const cpf = (a?.cpf ?? app.cpf ?? "").replace(/\D/g, "");
  const cnpj = (a?.cnpj ?? app.cnpj ?? "").replace(/\D/g, "");
  const fullName = fold(a?.name ?? app.fullName);
  if (!isValidCpf(cpf)) throw new ContractSendError("A candidata não informou um CPF válido: o contrato precisa dele.");
  if (address.length < 10) throw new ContractSendError("A candidata não informou o endereço: o contrato precisa dele.");

  const body = renderContract(doc.body, {
    fullName,
    cpf,
    address,
    cnpj: cnpj.length === 14 ? cnpj : null,
    companyName: cnpj.length === 14 ? fold(app.companyName) || null : null,
    coupon: coupon.code,
    discountBps,
    rateBps,
    releaseMinCents: template.releaseMinCents,
    kitTiers: parseKitTiers(template.kitTiers),
    brandSlug: app.brand.slug,
    months: template.months,
    videoGoal: UGC_DEFAULT_VIDEO_GOAL,
    signedAt: now,
  });
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  const pdf = await contractPdf(doc.title, body);

  // Reenvio pela equipe: o contrato anterior (não assinado) sai do Autentique antes de mandar o novo.
  if (open) await cancelRequest(prisma, open, conn.token, actor?.userId ?? SYSTEM, "reenviado", deps);

  let created: { id: string; signLink: string | null };
  try {
    created = await createAutentiqueDocument(
      conn.token,
      {
        name: `${doc.title} - ${fullName}`.slice(0, 180),
        message: `Olá, ${firstName(fullName)}! Este é o contrato da sua parceria com a ${app.brand.name} (data: ${longDate(now)}). Confira os seus dados e assine.`,
        pdf,
        fileName: `contrato-${app.brand.slug}.pdf`,
        signers: [{ name: fullName, email }],
        sandbox: conn.sandbox,
      },
      deps.fetcher,
    );
  } catch (error) {
    throw new ContractSendError(error instanceof Error ? error.message : "Não foi possível enviar ao Autentique.");
  }
  const actorId = actor?.userId ?? SYSTEM;
  const req = await prisma.$transaction(async (tx) => {
    const r = await tx.contractRequest.create({
      data: {
        brandId: app.brandId,
        applicationId,
        contractDocumentId: doc.id,
        contractTemplateId: template.id,
        externalId: created.id,
        sandbox: conn.sandbox,
        signerName: fullName,
        signerEmail: email,
        body,
        bodySha256,
        pendingCouponCode: coupon.code,
        pendingDiscountBps: discountBps,
        rateBps,
        signLink: created.signLink,
        createdById: actorId,
        sentAt: now,
      },
    });
    await tx.creatorApplication.update({ where: { id: applicationId }, data: { contractError: null } });
    await tx.auditLog.create({
      data: {
        brandId: app.brandId,
        actorType: actor ? "USER" : "SYSTEM",
        actorId,
        action: "contract.sent",
        entity: "ContractRequest",
        entityId: r.id,
        after: { applicationId, externalId: created.id, email, sandbox: conn.sandbox, bodySha256, coupon: coupon.code, discountBps, rateBps, templateId: template.id },
      },
    });
    if (created.signLink) await enqueueJob(tx, { type: CONTRACT_LINK_JOB, brandId: app.brandId, payload: { requestId: r.id }, dedupeKey: `contract-link:${r.id}`, runAt: nextWhatsAppTime(now), maxAttempts: 5 });
    return r;
  });
  await enqueueJob(prisma, { type: AUTENTIQUE_CHECK_JOB, brandId: app.brandId, dedupeKey: `autentique:${app.brandId}:${slot(now)}`, runAt: new Date(now.getTime() + 5 * 60_000) });
  return { requestId: req.id, email, sandbox: conn.sandbox, signLink: created.signLink };
}

async function cancelRequest(prisma: PrismaClient, req: { id: string; brandId: string; externalId: string }, token: string | null, actorId: string, reason: string, deps: Deps) {
  let remoteError: string | null = null;
  if (token) {
    try {
      await deleteAutentiqueDocument(token, req.externalId, deps.fetcher);
    } catch (error) {
      remoteError = String(error instanceof Error ? error.message : error).slice(0, 300);
    }
  }
  await prisma.$transaction([
    prisma.contractRequest.updateMany({ where: { id: req.id, status: "SENT" }, data: { status: "CANCELLED", lastError: remoteError } }),
    prisma.auditLog.create({ data: { brandId: req.brandId, actorType: actorId === SYSTEM ? "SYSTEM" : "USER", actorId, action: "contract.cancelled", entity: "ContractRequest", entityId: req.id, after: { reason, remoteError } } }),
  ]);
}

/** Recusa da candidata: os contratos dela esperando assinatura são cancelados no Autentique. */
export async function cancelApplicationContracts(prisma: PrismaClient, applicationIds: readonly string[], actorId: string, deps: Deps = {}) {
  const open = await prisma.contractRequest.findMany({ where: { applicationId: { in: [...applicationIds] }, status: "SENT" }, select: { id: true, brandId: true, externalId: true } });
  const tokens = new Map<string, string | null>();
  for (const r of open) {
    if (!tokens.has(r.brandId)) tokens.set(r.brandId, (await loadAutentique(prisma, r.brandId, deps.encKey).catch(() => null))?.token ?? null);
    await cancelRequest(prisma, r, tokens.get(r.brandId) ?? null, actorId, "candidata recusada", deps);
  }
  return open.length;
}

/** Handler do cadastro do site: envia o contrato; o que impede o envio fica escrito na candidata para a Gestão. */
export async function runApplicationContractJob(prisma: PrismaClient, applicationId: string, deps: Deps = {}) {
  const app = await prisma.creatorApplication.findUnique({ where: { id: applicationId }, select: { brandId: true, status: true } });
  if (!app || app.status !== "NEW" || !(await hasAutentique(prisma, app.brandId))) return;
  try {
    await sendApplicationContract(prisma, null, applicationId, {}, deps);
  } catch (error) {
    if (!(error instanceof ContractSendError)) throw error;
    await prisma.creatorApplication.update({ where: { id: applicationId }, data: { contractError: error.message.slice(0, 300) } });
  }
}

/** Manda o link de assinatura pelo WhatsApp da marca (uma vez). Sem n8n, instância ou celular: fica só o e-mail. */
export async function sendContractLink(prisma: PrismaClient, sender: WhatsAppSender | null, requestId: string, now = new Date()) {
  const r = await prisma.contractRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, signLink: true, linkSentAt: true, signerName: true, application: { select: { phone: true } }, brand: { select: { name: true, whatsappInstance: true } } },
  });
  if (!r || r.status !== "SENT" || !r.signLink || r.linkSentAt || !sender || !r.brand.whatsappInstance) return false;
  const chat = whatsappChatUrl(r.application?.phone ?? null);
  if (!chat) return false;
  // Falha do n8n (WhatsAppError) sobe: a fila tenta de novo.
  await sender({ instance: r.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""), text: contractLinkMessage({ name: r.signerName, brand: r.brand.name, link: r.signLink }), notificationId: r.id, kind: "CONTRACT_LINK", brand: r.brand.name });
  await prisma.contractRequest.update({ where: { id: r.id }, data: { linkSentAt: now } });
  return true;
}

const slot = (d: Date) => Math.floor(d.getTime() / (5 * 60_000));

/** Agenda a conferência das marcas com contrato de candidata esperando assinatura (uma por marca a cada 5 min). */
export async function enqueueDueContractChecks(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.contractRequest.findMany({ where: { status: "SENT", applicationId: { not: null } }, distinct: ["brandId"], select: { brandId: true } });
  let n = 0;
  for (const { brandId } of brands) if (await enqueueJob(prisma, { type: AUTENTIQUE_CHECK_JOB, brandId, dedupeKey: `autentique:${brandId}:${slot(now)}`, runAt: now })) n++;
  return n;
}

/** Confere no Autentique os contratos de candidatas da marca esperando assinatura. */
export async function checkApplicationContracts(prisma: PrismaClient, brandId: string, deps: Deps & { applicationId?: string } = {}) {
  const now = deps.now ?? new Date();
  const out = { signed: 0, rejected: 0, errors: 0 };
  const open = await prisma.contractRequest.findMany({
    where: { brandId, status: "SENT", applicationId: deps.applicationId ?? { not: null } },
    orderBy: { sentAt: "asc" },
    take: 50,
  });
  const conn = open.length ? await loadAutentique(prisma, brandId, deps.encKey) : null;
  for (const req of open) {
    if (!conn) break;
    try {
      const doc = await getAutentiqueDocument(conn.token, req.externalId, deps.fetcher);
      const mine = doc.signatures.find((s) => s.email?.toLowerCase() === req.signerEmail.toLowerCase()) ?? doc.signatures[0];
      if (mine?.rejectedAt) {
        await prisma.$transaction([
          prisma.contractRequest.update({ where: { id: req.id }, data: { status: "REJECTED", rejectedAt: now, rejectReason: mine.rejectReason?.slice(0, 500) ?? null, lastCheckedAt: now, lastError: null } }),
          prisma.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "contract.rejected", entity: "ContractRequest", entityId: req.id, after: { reason: mine.rejectReason ?? null } } }),
        ]);
        out.rejected++;
      } else if (mine?.signedAt) {
        await prisma.$transaction([
          prisma.contractRequest.updateMany({ where: { id: req.id, status: "SENT" }, data: { status: "SIGNED", signedAt: now, lastCheckedAt: now, lastError: null } }),
          prisma.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "contract.signed", entity: "ContractRequest", entityId: req.id, after: { externalId: req.externalId, applicationId: req.applicationId } } }),
        ]);
        out.signed++;
      } else {
        await prisma.contractRequest.update({ where: { id: req.id }, data: { lastCheckedAt: now, lastError: null } });
      }
    } catch (error) {
      out.errors++;
      await prisma.contractRequest.update({ where: { id: req.id }, data: { lastCheckedAt: now, lastError: String(error instanceof Error ? error.message : error).slice(0, 300) } });
    }
  }
  return out;
}

/** "Conferir agora" em Candidatas. */
export async function checkApplicationNow(prisma: PrismaClient, actor: Actor | null, applicationId: string, deps: Deps = {}) {
  const app = await prisma.creatorApplication.findUnique({ where: { id: applicationId }, select: { brandId: true } });
  if (!app || !actor || !can(actor.grants, "creators.edit", app.brandId)) throw new ContractSendError("Sem permissão.");
  return checkApplicationContracts(prisma, app.brandId, { ...deps, applicationId });
}

/** Tarefas da fila do Autentique. */
export function autentiqueHandlers(prisma: PrismaClient) {
  return {
    [CONTRACT_SEND_JOB]: async (job: { payload: unknown }) => {
      const id = (job.payload as { applicationId?: string } | null)?.applicationId;
      if (id) await runApplicationContractJob(prisma, id);
    },
    [CONTRACT_LINK_JOB]: async (job: { payload: unknown }) => {
      const id = (job.payload as { requestId?: string } | null)?.requestId;
      if (id) await sendContractLink(prisma, configuredWhatsApp(), id);
    },
    [AUTENTIQUE_CHECK_JOB]: async (job: { brandId: string | null }) => {
      if (!job.brandId) throw new Error("Tarefa sem marca.");
      await checkApplicationContracts(prisma, job.brandId);
    },
  };
}
