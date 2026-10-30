import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  addMonthsToDay,
  approvalMessage,
  contractLinkMessage,
  contractReminderMessage,
  CONTRACT_TEXT_LABEL,
  contractTextKinds,
  dayKey,
  isContractKind,
  longDate,
  notices,
  parseKitTiers,
  renderContract,
  UGC_DEFAULT_VIDEO_GOAL,
  WELCOME_PRODUCTS,
  WELCOME_VIDEO_PRODUCTS,
  welcomePreset,
  whatsappChatUrl,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { currentContract } from "@/lib/contracts/sign";
import { CouponCreateError, createDiscountInShopify } from "@/lib/coupons/create";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import { enqueueJob } from "@/lib/jobs/queue";
import { notify } from "@/lib/notifications/notify";
import { siteOrigin } from "@/lib/notifications/scheduled";
import { configuredWhatsApp, inWhatsAppHours, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";
import { isValidCpf } from "@/lib/terms/terms";
import { createAutentiqueDocument, deleteAutentiqueDocument, getAutentiqueDocument, type Fetcher } from "./client";
import { loadAutentique } from "./credentials";
import { contractPdf } from "./pdf";

/**
 * Contrato pelo Autentique depois da aprovação (D-CONTRACTFLOW, substitui D-AUTENTIQUE2), nas marcas com o Autentique
 * conectado. A Gestão aprova em Candidatas: a creator nasce esperando o contrato (`awaitingContractAt`), com o cupom só
 * reservado (`pendingCouponCode`) e o portal travado. Uma tarefa da fila (gravada na aprovação) gera o contrato pelo que
 * ela escolheu no cadastro: Influencer usa um dos 4 modelos (pessoa física ou empresa × 1 produto ou 2 produtos + 3
 * vídeos); Prescritor e UGC, o texto do tipo. Vai para o e-mail dela pelo Autentique e o link de assinatura pelo WhatsApp
 * da marca (9h às 20h). A cada 5 minutos o sistema confere: assinado, o contrato passa a valer e a ativação cria o cupom
 * na Shopify, libera o kit de boas-vindas (1 ou 2 produtos), destrava o portal e manda a mensagem "parceria ativa"
 * (cupom e primeiro pedido) pelo portal, WhatsApp e e-mail. Se a Shopify recusar o cupom, tenta de novo a cada rodada.
 */

export class ContractSendError extends Error {}

export const CONTRACT_SEND_JOB = "autentique.creator_contract";
/** D-AUTENTIQUE2 (fluxo antigo, contrato antes da aprovação): tarefas que ficaram na fila não fazem mais nada. */
const OLD_SEND_JOB = "autentique.application_contract";
export const CONTRACT_LINK_JOB = "autentique.contract_link";
export const AUTENTIQUE_CHECK_JOB = "autentique.check";
const SYSTEM = "system:autentique";

type Deps = { fetcher?: Fetcher; encKey?: Buffer; now?: Date; clientFor?: ClientFactory; origin?: string | null };

const fold = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const slot = (d: Date) => Math.floor(d.getTime() / (5 * 60_000));

/** Próximo horário de mandar WhatsApp (9h às 20h de São Paulo): agora, ou às 9h seguintes. */
export function nextWhatsAppTime(now: Date): Date {
  if (inWhatsAppHours(now)) return now;
  // São Paulo está em UTC-3 o ano todo: 9h de lá = 12h UTC.
  const today = new Date(`${dayKey(now)}T12:00:00Z`);
  return today.getTime() > now.getTime() ? today : new Date(today.getTime() + 86_400_000);
}

/** Tarefa da aprovação: grava junto com a creator (mesma transação). */
export function enqueueCreatorContract(tx: Parameters<typeof enqueueJob>[0], brandId: string, creatorId: string, now = new Date()) {
  return enqueueJob(tx, { type: CONTRACT_SEND_JOB, brandId, payload: { creatorId }, dedupeKey: `contract-creator:${creatorId}`, runAt: now, maxAttempts: 3 });
}

/**
 * Gera e envia o contrato da creator aprovada. `actor` null = envio automático da aprovação (não reenvia se já há
 * contrato em aberto). Pela equipe (botão), um contrato ainda não assinado é cancelado e trocado pelo novo.
 */
export async function sendCreatorContract(
  prisma: PrismaClient,
  actor: Actor | null,
  creatorId: string,
  deps: Deps = {},
): Promise<{ requestId: string; email: string; sandbox: boolean; signLink: string | null } | null> {
  const now = deps.now ?? new Date();
  const c = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      brandId: true,
      status: true,
      categories: true,
      contractSigned: true,
      awaitingContractAt: true,
      receivesAsIndividual: true,
      welcomeVideos: true,
      ugcVideoGoal: true,
      pendingCouponCode: true,
      pendingDiscountBps: true,
      couponAssignments: { where: { validTo: null, coupon: { kind: "CREATOR" } }, orderBy: { validFrom: "desc" }, take: 1, select: { coupon: { select: { code: true, discountBps: true } } } },
      brand: { select: { name: true, slug: true } },
      contractTemplate: { select: { id: true, documentKind: true, months: true, releaseMinCents: true, kitTiers: true } },
      commissionPolicies: { where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: { validFrom: "desc" }, take: 1, select: { rateBps: true } },
      account: { select: { name: true, email: true, cpf: true, cnpj: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true, addrZip: true } },
    },
  });
  if (!c) throw new ContractSendError("Creator não encontrada.");
  if (actor && !can(actor.grants, "creators.edit", c.brandId)) throw new ContractSendError("Sem permissão.");
  if (!c.awaitingContractAt || c.contractSigned) throw new ContractSendError("Esta creator não está esperando contrato.");
  if (c.status === "DEACTIVATED") throw new ContractSendError("Creator desligada.");
  const open = await prisma.contractRequest.findFirst({ where: { creatorId, status: { in: ["SENT", "SIGNED"] } }, select: { id: true, brandId: true, status: true, externalId: true } });
  if (open && !actor) return null; // automático: já saiu
  if (open?.status === "SIGNED") throw new ContractSendError("Ela já assinou o contrato.");
  const conn = await loadAutentique(prisma, c.brandId, deps.encKey);
  if (!conn) throw new ContractSendError("O Autentique desta marca não está conectado (Integrações → Autentique).");

  const a = c.account;
  const email = a.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith(FAKE_EMAIL_DOMAIN)) throw new ContractSendError("A creator não tem um e-mail válido para receber o contrato.");
  const category = c.contractTemplate?.documentKind ?? c.categories[0] ?? "INFLUENCER";
  if (!c.contractTemplate || !isContractKind(category)) throw new ContractSendError("Falta a versão do contrato na ficha.");
  // D-WELCOMECHOICE: o modelo do envio inicial (1 produto ou 2 + 3 vídeos), senão o de pessoa física/empresa, senão o
  // texto do tipo (decisão do responsável em 2026-10-29): vale o primeiro publicado.
  const kinds = contractTextKinds(category, c.receivesAsIndividual, (c.welcomeVideos ?? 0) > 0);
  let doc: Awaited<ReturnType<typeof currentContract>> = null;
  for (const k of kinds) if (!doc) doc = await currentContract(prisma, c.brandId, k);
  if (!doc) throw new ContractSendError(`Falta publicar o texto do contrato "${CONTRACT_TEXT_LABEL[kinds[1] ?? kinds[0]!]}" (Contratos).`);
  // Cupom reservado na aprovação ou, para quem já tinha cupom (D-CONTRACTLOCK), o cupom dela.
  const current = c.couponAssignments[0]?.coupon ?? null;
  const couponCode = c.pendingCouponCode ?? current?.code ?? null;
  const couponDiscount = c.pendingDiscountBps ?? current?.discountBps ?? null;
  if (!couponCode) throw new ContractSendError("Falta o cupom reservado na aprovação.");
  const rateBps = c.commissionPolicies[0]?.rateBps ?? null;

  const address = a.addrStreet
    ? [`${a.addrStreet}, ${a.addrNumber ?? "s/n"}${a.addrComplement ? ` - ${a.addrComplement}` : ""}`, a.addrDistrict, a.addrCity && a.addrState ? `${a.addrCity}/${a.addrState}` : a.addrCity, a.addrZip ? `CEP ${a.addrZip}` : null]
        .filter(Boolean)
        .join(", ")
    : "";
  const app = await prisma.creatorApplication.findFirst({ where: { creatorId }, orderBy: { submittedAt: "desc" }, select: { id: true, address: true, companyName: true } });
  const fullAddress = address || fold((app?.address ?? "").replace(/\s*\n+\s*/g, ", ")).replace(/,\s*,/g, ",");
  const cpf = (a.cpf ?? "").replace(/\D/g, "");
  const cnpj = (a.cnpj ?? "").replace(/\D/g, "");
  const fullName = fold(a.name);
  if (!isValidCpf(cpf)) throw new ContractSendError("A creator não tem um CPF válido no cadastro: o contrato precisa dele.");
  if (fullAddress.length < 10) throw new ContractSendError("A creator não tem o endereço no cadastro: o contrato precisa dele.");
  if (!c.receivesAsIndividual && cnpj.length !== 14) throw new ContractSendError("Ela recebe como empresa, mas não tem CNPJ no cadastro.");

  const body = renderContract(doc.body, {
    fullName,
    cpf,
    address: fullAddress,
    cnpj: !c.receivesAsIndividual && cnpj.length === 14 ? cnpj : null,
    companyName: !c.receivesAsIndividual ? fold(app?.companyName) || null : null,
    coupon: couponCode,
    discountBps: couponDiscount,
    rateBps,
    releaseMinCents: c.contractTemplate.releaseMinCents,
    kitTiers: parseKitTiers(c.contractTemplate.kitTiers),
    brandSlug: c.brand.slug,
    months: c.contractTemplate.months,
    videoGoal: c.ugcVideoGoal ?? UGC_DEFAULT_VIDEO_GOAL,
    signedAt: now,
  });
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  const pdf = await contractPdf(doc.title, body);

  // Reenvio pela equipe: o contrato anterior (não assinado) sai do Autentique antes de mandar o novo. Contrato do fluxo
  // antigo (D-AUTENTIQUE2, antes da aprovação) também é cancelado.
  if (open) await cancelRequest(prisma, open, conn.token, actor?.userId ?? SYSTEM, "reenviado", deps);
  if (app) {
    const old = await prisma.contractRequest.findMany({ where: { applicationId: app.id, creatorId: null, status: { in: ["SENT", "SIGNED"] } }, select: { id: true, brandId: true, externalId: true, status: true } });
    for (const o of old) await cancelRequest(prisma, o, o.status === "SENT" ? conn.token : null, SYSTEM, "fluxo novo: contrato depois da aprovação", deps, true);
  }

  let created: { id: string; signLink: string | null };
  try {
    created = await createAutentiqueDocument(
      conn.token,
      {
        name: `${doc.title} - ${fullName}`.slice(0, 180),
        message: `Olá, ${firstName(fullName)}! Sua parceria com a ${c.brand.name} foi aprovada. Este é o seu contrato (data: ${longDate(now)}): confira os seus dados e assine.`,
        pdf,
        fileName: `contrato-${c.brand.slug}.pdf`,
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
        brandId: c.brandId,
        creatorId,
        applicationId: app?.id ?? null,
        contractDocumentId: doc.id,
        contractTemplateId: c.contractTemplate!.id,
        externalId: created.id,
        sandbox: conn.sandbox,
        signerName: fullName,
        signerEmail: email,
        body,
        bodySha256,
        pendingCouponCode: couponCode,
        pendingDiscountBps: couponDiscount,
        rateBps,
        signLink: created.signLink,
        createdById: actorId,
        sentAt: now,
      },
    });
    if (app) await tx.creatorApplication.update({ where: { id: app.id }, data: { contractError: null } });
    await tx.auditLog.create({
      data: {
        brandId: c.brandId,
        actorType: actor ? "USER" : "SYSTEM",
        actorId,
        action: "contract.sent",
        entity: "ContractRequest",
        entityId: r.id,
        after: { creatorId, externalId: created.id, email, sandbox: conn.sandbox, bodySha256, kind: doc.kind, coupon: couponCode, templateId: c.contractTemplate!.id },
      },
    });
    if (created.signLink) await enqueueJob(tx, { type: CONTRACT_LINK_JOB, brandId: c.brandId, payload: { requestId: r.id }, dedupeKey: `contract-link:${r.id}`, runAt: nextWhatsAppTime(now), maxAttempts: 5 });
    return r;
  });
  await enqueueJob(prisma, { type: AUTENTIQUE_CHECK_JOB, brandId: c.brandId, dedupeKey: `autentique:${c.brandId}:${slot(now)}`, runAt: new Date(now.getTime() + 5 * 60_000) });
  return { requestId: req.id, email, sandbox: conn.sandbox, signLink: created.signLink };
}

async function cancelRequest(
  prisma: PrismaClient,
  req: { id: string; brandId: string; externalId: string },
  token: string | null,
  actorId: string,
  reason: string,
  deps: Deps,
  anyOpen = false,
) {
  let remoteError: string | null = null;
  if (token) {
    try {
      await deleteAutentiqueDocument(token, req.externalId, deps.fetcher);
    } catch (error) {
      remoteError = String(error instanceof Error ? error.message : error).slice(0, 300);
    }
  }
  await prisma.$transaction([
    prisma.contractRequest.updateMany({ where: { id: req.id, status: anyOpen ? { in: ["SENT", "SIGNED"] } : "SENT" }, data: { status: "CANCELLED", lastError: remoteError } }),
    prisma.auditLog.create({ data: { brandId: req.brandId, actorType: actorId === SYSTEM ? "SYSTEM" : "USER", actorId, action: "contract.cancelled", entity: "ContractRequest", entityId: req.id, after: { reason, remoteError } } }),
  ]);
}

/** Recusa da candidata: contrato do fluxo antigo (antes da aprovação) esperando assinatura é cancelado no Autentique. */
export async function cancelApplicationContracts(prisma: PrismaClient, applicationIds: readonly string[], actorId: string, deps: Deps = {}) {
  const open = await prisma.contractRequest.findMany({ where: { applicationId: { in: [...applicationIds] }, status: "SENT" }, select: { id: true, brandId: true, externalId: true } });
  const tokens = new Map<string, string | null>();
  for (const r of open) {
    if (!tokens.has(r.brandId)) tokens.set(r.brandId, (await loadAutentique(prisma, r.brandId, deps.encKey).catch(() => null))?.token ?? null);
    await cancelRequest(prisma, r, tokens.get(r.brandId) ?? null, actorId, "candidata recusada", deps);
  }
  return open.length;
}

/** Handler da aprovação: envia o contrato; o que impede o envio fica escrito na candidatura para a Gestão. */
export async function runCreatorContractJob(prisma: PrismaClient, creatorId: string, deps: Deps = {}) {
  try {
    await sendCreatorContract(prisma, null, creatorId, deps);
  } catch (error) {
    if (!(error instanceof ContractSendError)) throw error;
    const app = await prisma.creatorApplication.findFirst({ where: { creatorId }, orderBy: { submittedAt: "desc" }, select: { id: true } });
    if (app) await prisma.creatorApplication.update({ where: { id: app.id }, data: { contractError: error.message.slice(0, 300) } });
  }
}

export const REMIND_DAYS = [3, 7] as const;
const DAY_MS = 86_400_000;

/**
 * D-CONTRACTREMIND: contrato sem assinar há 3 e há 7 dias (contados do envio) ganha um lembrete no WhatsApp da marca,
 * com o link de assinatura; cada um sai uma vez, das 9h às 20h. Quem já passou dos 7 sem o de 3 recebe só o de 7.
 */
export async function remindUnsignedContracts(prisma: PrismaClient, sender: WhatsAppSender | null, now = new Date()) {
  if (!sender || !inWhatsAppHours(now)) return { sent: 0 };
  const due3 = new Date(now.getTime() - 3 * DAY_MS);
  const due7 = new Date(now.getTime() - 7 * DAY_MS);
  const rows = await prisma.contractRequest.findMany({
    where: {
      status: "SENT",
      signLink: { not: null },
      creator: { awaitingContractAt: { not: null }, contractSigned: false },
      OR: [{ sentAt: { lte: due3 }, reminder3At: null }, { sentAt: { lte: due7 }, reminder7At: null }],
    },
    select: {
      id: true, sentAt: true, signLink: true, signerName: true, reminder7At: true,
      creator: { select: { account: { select: { phone: true } } } },
      brand: { select: { name: true, whatsappInstance: true } },
    },
  });
  let sent = 0;
  for (const r of rows) {
    const chat = whatsappChatUrl(r.creator?.account.phone ?? null);
    if (!chat || !r.brand.whatsappInstance || !r.signLink) continue;
    const seventh = r.sentAt <= due7 && !r.reminder7At;
    // Marca antes de mandar: dois workers ao mesmo tempo não mandam duas vezes (falha do n8n: perde-se só este lembrete).
    const { count } = await prisma.contractRequest.updateMany({
      where: { id: r.id, ...(seventh ? { reminder7At: null } : { reminder3At: null }) },
      data: seventh ? { reminder7At: now, reminder3At: now } : { reminder3At: now },
    });
    if (count === 0) continue;
    try {
      await sender({
        instance: r.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""), text: contractReminderMessage({ name: r.signerName, brand: r.brand.name, link: r.signLink }),
        notificationId: `${r.id}:${seventh ? 7 : 3}`, kind: "CONTRACT_REMINDER", brand: r.brand.name,
      });
      sent += 1;
    } catch {
      // n8n fora: o lembrete não volta (a Gestão vê no dia 7 em Ações).
    }
  }
  return { sent };
}

/** Manda o link de assinatura pelo WhatsApp da marca (uma vez). Sem n8n, instância ou celular: fica só o e-mail. */
export async function sendContractLink(prisma: PrismaClient, sender: WhatsAppSender | null, requestId: string, now = new Date()) {
  const r = await prisma.contractRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, status: true, signLink: true, linkSentAt: true, signerName: true,
      creator: { select: { account: { select: { phone: true } } } },
      application: { select: { phone: true } },
      brand: { select: { name: true, whatsappInstance: true } },
    },
  });
  if (!r || r.status !== "SENT" || !r.signLink || r.linkSentAt || !sender || !r.brand.whatsappInstance) return false;
  const chat = whatsappChatUrl(r.creator?.account.phone ?? r.application?.phone ?? null);
  if (!chat) return false;
  // Falha do n8n (WhatsAppError) sobe: a fila tenta de novo.
  await sender({ instance: r.brand.whatsappInstance, phone: chat.replace("https://wa.me/", ""), text: contractLinkMessage({ name: r.signerName, brand: r.brand.name, link: r.signLink }), notificationId: r.id, kind: "CONTRACT_LINK", brand: r.brand.name });
  await prisma.contractRequest.update({ where: { id: r.id }, data: { linkSentAt: now } });
  return true;
}

/**
 * Agenda a conferência das marcas com contrato esperando assinatura ou creator esperando a ativação. E, de hora em hora,
 * tenta de novo o envio para quem espera o contrato e ainda não tem nenhum (ex.: Autentique conectado depois).
 */
export async function enqueueDueContractChecks(prisma: PrismaClient, now = new Date()): Promise<number> {
  const hour = Math.floor(now.getTime() / 3_600_000);
  const unsent = await prisma.creator.findMany({ where: { awaitingContractAt: { not: null }, contractSigned: { not: true }, contractRequests: { none: {} } }, select: { id: true, brandId: true }, take: 200 });
  let retries = 0;
  for (const c of unsent) {
    if (await enqueueJob(prisma, { type: CONTRACT_SEND_JOB, brandId: c.brandId, payload: { creatorId: c.id }, dedupeKey: `contract-creator:${c.id}:${hour}`, runAt: now, maxAttempts: 1 })) retries++;
  }
  const [sent, activating] = await Promise.all([
    prisma.contractRequest.findMany({ where: { status: "SENT" }, distinct: ["brandId"], select: { brandId: true } }),
    prisma.creator.findMany({ where: { awaitingContractAt: { not: null }, contractSigned: true }, distinct: ["brandId"], select: { brandId: true } }),
  ]);
  let n = retries;
  for (const brandId of new Set([...sent, ...activating].map((b) => b.brandId))) {
    if (await enqueueJob(prisma, { type: AUTENTIQUE_CHECK_JOB, brandId, dedupeKey: `autentique:${brandId}:${slot(now)}`, runAt: now })) n++;
  }
  return n;
}

/** Confere no Autentique os contratos da marca esperando assinatura e ativa quem já assinou. */
export async function checkContracts(prisma: PrismaClient, brandId: string, deps: Deps & { creatorId?: string } = {}) {
  const now = deps.now ?? new Date();
  const out = { signed: 0, rejected: 0, activated: 0, errors: 0 };
  const open = await prisma.contractRequest.findMany({
    where: { brandId, status: "SENT", ...(deps.creatorId ? { creatorId: deps.creatorId } : {}) },
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
        if (await markSigned(prisma, req.id, now)) out.signed++;
      } else {
        await prisma.contractRequest.update({ where: { id: req.id }, data: { lastCheckedAt: now, lastError: null } });
      }
    } catch (error) {
      out.errors++;
      await prisma.contractRequest.update({ where: { id: req.id }, data: { lastCheckedAt: now, lastError: String(error instanceof Error ? error.message : error).slice(0, 300) } });
    }
  }
  // Ativação (cupom na Shopify, kit, portal e mensagem): tenta de novo a cada rodada se a Shopify falhar.
  const due = await prisma.creator.findMany({ where: { brandId, awaitingContractAt: { not: null }, contractSigned: true, ...(deps.creatorId ? { id: deps.creatorId } : {}) }, select: { id: true } });
  for (const c of due) {
    try {
      await activateCreator(prisma, c.id, deps.clientFor ?? defaultClientFactory, deps.origin === undefined ? siteOrigin() : deps.origin, now);
      out.activated++;
    } catch (error) {
      out.errors++;
      const msg = error instanceof CouponCreateError ? `Cupom: ${error.message}` : String(error instanceof Error ? error.message : error);
      await prisma.contractRequest.updateMany({ where: { creatorId: c.id, status: "SIGNED" }, data: { lastError: msg.slice(0, 300) } });
    }
  }
  return out;
}

/** Assinado: o contrato passa a valer (início na assinatura, fim pelos meses da versão). */
async function markSigned(prisma: PrismaClient, requestId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.contractRequest.updateMany({ where: { id: requestId, status: "SENT" }, data: { status: "SIGNED", signedAt: now, lastCheckedAt: now, lastError: null } });
    if (count === 0) return false; // outra rodada já marcou
    const req = await tx.contractRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (req.creatorId) {
      const c = await tx.creator.findUniqueOrThrow({ where: { id: req.creatorId }, select: { contractTemplate: { select: { months: true } } } });
      const start = dayKey(now);
      await tx.creator.update({
        where: { id: req.creatorId },
        data: {
          contractSigned: true,
          contractRequiredAt: null,
          contractStart: new Date(`${start}T00:00:00Z`),
          contractEnd: new Date(`${addMonthsToDay(start, c.contractTemplate?.months ?? 6)}T00:00:00Z`),
          // D-GOALKIT: as janelas da meta de vendas começam com a parceria valendo.
          goalStartAt: new Date(`${start}T00:00:00Z`),
        },
      });
    }
    await tx.auditLog.create({ data: { brandId: req.brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "contract.signed", entity: "ContractRequest", entityId: req.id, after: { externalId: req.externalId, creatorId: req.creatorId } } });
    return true;
  });
}

/** Ativação depois da assinatura: cupom na Shopify, kit de boas-vindas, portal liberado e a mensagem "parceria ativa". */
async function activateCreator(prisma: PrismaClient, creatorId: string, clientFor: ClientFactory, origin: string | null, now: Date) {
  const c = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    select: {
      brandId: true, pendingCouponCode: true, pendingDiscountBps: true, welcomeVideos: true, reviewedById: true, account: { select: { userId: true } }, brand: { select: { name: true, slug: true, approvalSuggestion: true, welcomeOneIds: true, welcomeTwoIds: true } },
      couponAssignments: { where: { validTo: null, coupon: { kind: "CREATOR" } }, orderBy: { validFrom: "desc" }, take: 1, select: { coupon: { select: { code: true, discountBps: true } } } },
    },
  });
  // Cupom reservado na aprovação ou, para quem já tinha cupom antes da trava (D-CONTRACTLOCK), o cupom dela.
  const current = c.couponAssignments[0]?.coupon ?? null;
  const code = c.pendingCouponCode ?? current?.code ?? null;
  const discountBps = c.pendingDiscountBps ?? current?.discountBps ?? 0;
  const actorId = c.reviewedById ?? SYSTEM;
  const existing = code ? await prisma.coupon.findUnique({ where: { brandId_code: { brandId: c.brandId, code } }, select: { id: true, assignments: { select: { creatorId: true } } } }) : null;
  if (existing && !existing.assignments.some((x) => x.creatorId === creatorId)) throw new CouponCreateError(`o cupom ${code} já existe nesta marca; escolha outro na ficha.`);
  const shopifyId = existing || !code ? null : await createDiscountInShopify(prisma, c.brandId, code, discountBps, clientFor, now);
  const withVideos = c.welcomeVideos > 0;
  const products = withVideos ? WELCOME_VIDEO_PRODUCTS : WELCOME_PRODUCTS;
  const loginUrl = origin ? `${origin}/entrar?marca=${c.brand.slug}` : null;
  const message = approvalMessage({ brand: c.brand.name, coupon: code ?? "(a equipe te manda)", discountBps, suggestion: c.brand.approvalSuggestion, withVideos, loginUrl: c.account.userId ? loginUrl : null });
  await prisma.$transaction(async (tx) => {
    if (code && !existing) {
      const coupon = await tx.coupon.create({ data: { brandId: c.brandId, code, kind: "CREATOR", classifiedAt: now, classifiedById: actorId, discountBps, shopifyId } });
      await tx.couponAssignment.create({ data: { brandId: c.brandId, couponId: coupon.id, creatorId, validFrom: now, createdById: actorId, confirmedAt: now, confirmedById: actorId } });
    }
    const month = dayKey(now).slice(0, 7);
    if (!(await tx.kitGrant.findFirst({ where: { creatorId, kind: "WELCOME" }, select: { id: true } }))) {
      await tx.kitGrant.create({ data: { brandId: c.brandId, creatorId, kind: "WELCOME", month, salesCents: 0, products, presetProductIds: welcomePreset(c.brand, products) } });
    }
    await tx.creator.update({ where: { id: creatorId }, data: { awaitingContractAt: null, pendingCouponCode: null, pendingDiscountBps: null } });
    await tx.contractRequest.updateMany({ where: { creatorId, status: "SIGNED", couponCreatedAt: null }, data: { couponCreatedAt: now, lastError: null } });
    await notify(tx, [{ brandId: c.brandId, creatorId, notice: notices.partnershipActive(c.brand.name, message) }]);
    await tx.auditLog.create({ data: { brandId: c.brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "creator.activated", entity: "Creator", entityId: creatorId, after: { coupon: code, discountBps, shopifyId, welcomeProducts: products } } });
  });
}

/** "Conferir agora" (Candidatas e ficha). */
export async function checkCreatorNow(prisma: PrismaClient, actor: Actor | null, creatorId: string, deps: Deps = {}) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
  if (!c || !actor || !can(actor.grants, "creators.edit", c.brandId)) throw new ContractSendError("Sem permissão.");
  return checkContracts(prisma, c.brandId, { ...deps, creatorId });
}

/** Portal travado (D-CONTRACTFLOW): o que a creator aprovada vê até a parceria ficar ativa. */
export async function awaitingContract(prisma: PrismaClient, creatorId: string) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { awaitingContractAt: true, contractSigned: true } });
  if (!c?.awaitingContractAt) return null;
  const req = await prisma.contractRequest.findFirst({ where: { creatorId }, orderBy: { sentAt: "desc" }, select: { status: true, signLink: true, signerEmail: true } });
  return { signed: c.contractSigned === true, status: req?.status ?? null, signLink: req?.status === "SENT" ? req.signLink : null, email: req?.signerEmail ?? null };
}

/** Tarefas da fila do Autentique. */
export function autentiqueHandlers(prisma: PrismaClient) {
  return {
    [CONTRACT_SEND_JOB]: async (job: { payload: unknown }) => {
      const id = (job.payload as { creatorId?: string } | null)?.creatorId;
      if (id) await runCreatorContractJob(prisma, id);
    },
    [OLD_SEND_JOB]: async () => {},
    [CONTRACT_LINK_JOB]: async (job: { payload: unknown }) => {
      const id = (job.payload as { requestId?: string } | null)?.requestId;
      if (id) await sendContractLink(prisma, configuredWhatsApp(), id);
    },
    [AUTENTIQUE_CHECK_JOB]: async (job: { brandId: string | null }) => {
      if (!job.brandId) throw new Error("Tarefa sem marca.");
      await checkContracts(prisma, job.brandId);
    },
  };
}

/**
 * D-CONTRACTLOCK: a Gestão marca "Contrato assinado" para quem assinou fora do Autentique (ex.: D4Sign) ou quando a marca
 * ainda não tem Autentique. O contrato passa a valer hoje e a ativação (cupom, kit, portal e mensagem) roda na hora; se a
 * Shopify falhar, a conferência de 5 em 5 minutos tenta de novo. Contrato do Autentique ainda aberto é cancelado.
 */
/**
 * D-UNDOAPPROVAL: a Gestão desfaz a aprovação de quem não assinou. O contrato é cancelado no Autentique, o cupom
 * reservado é liberado, a creator fica Desligada (nada é apagado) e a candidatura volta para Recusadas com o motivo.
 */
export async function undoApproval(prisma: PrismaClient, actor: Actor | null, creatorId: string, note: string, deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const c = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      brandId: true, status: true, awaitingContractAt: true, contractSigned: true, pendingCouponCode: true,
      couponAssignments: { where: { validTo: null, coupon: { kind: "CREATOR", active: true } }, select: { id: true } },
    },
  });
  if (!c || !actor || !can(actor.grants, "creators.edit", c.brandId)) throw new ContractSendError("Sem permissão.");
  if (!c.awaitingContractAt || c.contractSigned) throw new ContractSendError("Só dá para desfazer a aprovação de quem ainda não assinou o contrato.");
  if (c.couponAssignments.length) throw new ContractSendError("Ela já tem cupom ativo na loja: use \"Arquivar creator\" na ficha.");
  const decisionNote = note.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!decisionNote) throw new ContractSendError("Escreva o motivo.");

  const open = await prisma.contractRequest.findMany({ where: { creatorId, status: "SENT" }, select: { id: true, brandId: true, externalId: true } });
  if (open.length) {
    const token = (await loadAutentique(prisma, c.brandId, deps.encKey).catch(() => null))?.token ?? null;
    for (const r of open) await cancelRequest(prisma, r, token, actor.userId, "aprovação desfeita", deps);
  }
  const applicationIds = await prisma.$transaction(async (tx) => {
    const apps = await tx.creatorApplication.findMany({ where: { creatorId, status: "APPROVED" }, select: { id: true } });
    await tx.creatorApplication.updateMany({
      where: { id: { in: apps.map((a) => a.id) } },
      data: { status: "REJECTED", creatorId: null, decidedAt: now, decidedById: actor.userId, decisionNote },
    });
    await tx.creator.update({
      where: { id: creatorId },
      data: { status: "DEACTIVATED", deactivatedAt: now, awaitingContractAt: null, pendingCouponCode: null, pendingDiscountBps: null },
    });
    await tx.auditLog.create({
      data: {
        brandId: c.brandId, actorType: "USER", actorId: actor.userId, action: "application.approval_undone", entity: "Creator", entityId: creatorId,
        before: { status: c.status, pendingCoupon: c.pendingCouponCode }, after: { status: "DEACTIVATED", note: decisionNote, applications: apps.map((a) => a.id) },
      },
    });
    return apps.map((a) => a.id);
  });
  return { cancelled: open.length, applicationIds };
}

export async function confirmSignedOutside(prisma: PrismaClient, actor: Actor | null, creatorId: string, deps: Deps = {}, reason = "assinado fora do Autentique") {
  const now = deps.now ?? new Date();
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, awaitingContractAt: true, contractSigned: true, contractTemplate: { select: { months: true } } } });
  if (!c || !actor || !can(actor.grants, "creators.edit", c.brandId)) throw new ContractSendError("Sem permissão.");
  if (!c.awaitingContractAt) throw new ContractSendError("Esta creator não está esperando contrato.");
  if (!c.contractSigned) {
    const open = await prisma.contractRequest.findMany({ where: { creatorId, status: "SENT" }, select: { id: true, brandId: true, externalId: true } });
    if (open.length) {
      const token = (await loadAutentique(prisma, c.brandId, deps.encKey).catch(() => null))?.token ?? null;
      for (const r of open) await cancelRequest(prisma, r, token, actor.userId, reason, deps);
    }
    const start = dayKey(now);
    await prisma.$transaction([
      prisma.creator.update({
        where: { id: creatorId },
        data: {
          contractSigned: true,
          contractRequiredAt: null,
          contractStart: new Date(`${start}T00:00:00Z`),
          contractEnd: new Date(`${addMonthsToDay(start, c.contractTemplate?.months ?? 6)}T00:00:00Z`),
          goalStartAt: new Date(`${start}T00:00:00Z`),
        },
      }),
      prisma.auditLog.create({ data: { brandId: c.brandId, actorType: "USER", actorId: actor.userId, action: "contract.signed_outside", entity: "Creator", entityId: creatorId, after: { start, reason } } }),
    ]);
  }
  try {
    await activateCreator(prisma, creatorId, deps.clientFor ?? defaultClientFactory, deps.origin === undefined ? siteOrigin() : deps.origin, now);
    return { activated: true };
  } catch (error) {
    const msg = error instanceof CouponCreateError ? `Cupom: ${error.message}` : String(error instanceof Error ? error.message : error);
    return { activated: false, error: msg.slice(0, 300) };
  }
}

/**
 * D-CONTRACTSWITCH (pedido da Fátima em 2026-10-30): o super admin ou a Gestão da marca liga ou desliga a trava do contrato na
 * aprovação. Ao desligar, quem está esperando o contrato é liberado como no fluxo antigo (contrato em aberto cancelado
 * no Autentique, cupom criado na Shopify, plataforma liberada e a mensagem de boas-vindas).
 */
export async function setContractLock(prisma: PrismaClient, actor: Actor | null, brandId: string, on: boolean, deps: Deps = {}) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new ContractSendError("Sem permissão.");
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { contractLock: true } });
  if (!brand) throw new ContractSendError("Marca não encontrada.");
  if (brand.contractLock !== on) {
    await prisma.$transaction([
      prisma.brand.update({ where: { id: brandId }, data: { contractLock: on } }),
      prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action: "brand.contract_lock", entity: "Brand", entityId: brandId, before: { contractLock: brand.contractLock }, after: { contractLock: on } } }),
    ]);
  }
  const out = { released: 0, failed: [] as string[] };
  if (on) return out;
  const waiting = await prisma.creator.findMany({ where: { brandId, awaitingContractAt: { not: null } }, select: { id: true, account: { select: { name: true } } } });
  for (const c of waiting) {
    const r = await confirmSignedOutside(prisma, actor, c.id, deps, "trava do contrato desligada na marca");
    if (r.activated) out.released++;
    else out.failed.push(c.account.name);
  }
  return out;
}
