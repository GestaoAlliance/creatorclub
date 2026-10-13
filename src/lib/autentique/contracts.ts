import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { addMonthsToDay, dayKey, isContractKind, longDate, notices, renderContract } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { CouponCreateError, createDiscountInShopify } from "@/lib/coupons/create";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import { enqueueJob } from "@/lib/jobs/queue";
import { notify } from "@/lib/notifications/notify";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";
import { contractBase, currentContract } from "@/lib/contracts/sign";
import { createAutentiqueDocument, getAutentiqueDocument, type Fetcher } from "./client";
import { loadAutentique } from "./credentials";
import { contractPdf } from "./pdf";

/**
 * Contrato pelo Autentique (D-AUTENTIQUE). O texto do tipo do contrato (influencer, prescritor, UGC) é preenchido com
 * os dados da creator e do sistema, vira PDF e vai para o e-mail dela pelo Autentique. Uma tarefa da fila confere a
 * cada 5 minutos: assinado marca "contrato assinado" (início e fim, como no portal), libera o kit de boas-vindas e,
 * se a aprovação deixou o cupom para depois, cria o cupom na Shopify. Recusado fica registrado com o motivo.
 */

export class ContractSendError extends Error {}

export const AUTENTIQUE_JOB = "autentique.check";

type Deps = { fetcher?: Fetcher; encKey?: Buffer; clientFor?: ClientFactory; now?: Date };

/** Envia o contrato da creator para assinatura. `pendingCoupon`: cupom que só nasce depois de assinado (aprovação). */
export async function sendContract(
  prisma: PrismaClient,
  actor: Actor | null,
  creatorId: string,
  opts: { pendingCoupon?: { code: string; discountBps: number } } = {},
  deps: Deps = {},
): Promise<{ requestId: string; email: string; sandbox: boolean }> {
  const now = deps.now ?? new Date();
  const head = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { brandId: true, status: true, contractTemplate: { select: { documentKind: true } }, account: { select: { name: true, email: true } }, brand: { select: { name: true } } },
  });
  if (!head) throw new ContractSendError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", head.brandId)) throw new ContractSendError("Sem permissão.");
  if (head.status === "DEACTIVATED") throw new ContractSendError("Creator desligada.");
  if (!head.contractTemplate || !isContractKind(head.contractTemplate.documentKind)) throw new ContractSendError("Escolha a versão do contrato na ficha antes de enviar.");
  const email = head.account.email;
  if (email.endsWith(FAKE_EMAIL_DOMAIN)) throw new ContractSendError("Salve o e-mail real da creator antes de enviar o contrato.");
  if (await prisma.contractRequest.findFirst({ where: { creatorId, status: "SENT" }, select: { id: true } }))
    throw new ContractSendError("Já há um contrato esperando a assinatura dela.");
  const conn = await loadAutentique(prisma, head.brandId, deps.encKey);
  if (!conn) throw new ContractSendError("O Autentique desta marca não está conectado (página Shopify → Autentique).");
  const doc = await currentContract(prisma, head.brandId, head.contractTemplate.documentKind);
  if (!doc) throw new ContractSendError("Não há texto de contrato publicado para este tipo (Contratos).");

  const base = await contractBase(prisma, creatorId, now);
  const fixed = opts.pendingCoupon ? { ...base.fixed, coupon: opts.pendingCoupon.code, discountBps: opts.pendingCoupon.discountBps } : base.fixed;
  const p = base.prefill;
  const body = renderContract(doc.body, {
    ...fixed,
    fullName: p.fullName,
    cpf: p.cpf.replace(/\D/g, ""),
    address: p.address,
    cnpj: p.cnpj.replace(/\D/g, "") || null,
    companyName: p.cnpj ? p.companyName || null : null,
    signedAt: now,
  });
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  const pdf = await contractPdf(doc.title, body);
  const name = `${doc.title} - ${p.fullName}`.slice(0, 180);
  let externalId: string;
  try {
    ({ id: externalId } = await createAutentiqueDocument(
      conn.token,
      {
        name,
        message: `Olá, ${p.fullName.split(" ")[0]}! Este é o contrato da sua parceria com a ${head.brand.name} (data: ${longDate(now)}). Confira os seus dados e assine.`,
        pdf,
        fileName: `contrato-${head.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
        signers: [{ name: p.fullName, email }],
        sandbox: conn.sandbox,
      },
      deps.fetcher,
    ));
  } catch (error) {
    throw new ContractSendError(error instanceof Error ? error.message : "Não foi possível enviar ao Autentique.");
  }
  const r = await prisma.$transaction(async (tx) => {
    const req = await tx.contractRequest.create({
      data: {
        brandId: head.brandId,
        creatorId,
        contractDocumentId: doc.id,
        contractTemplateId: base.creator.contractTemplate!.id,
        externalId,
        sandbox: conn.sandbox,
        signerName: p.fullName,
        signerEmail: email,
        body,
        bodySha256,
        pendingCouponCode: opts.pendingCoupon?.code ?? null,
        pendingDiscountBps: opts.pendingCoupon?.discountBps ?? null,
        createdById: actor.userId,
        sentAt: now,
      },
    });
    // Assina pelo Autentique: o portal não pede mais a assinatura (D-SIGNCONTRACT fica para quem não tem Autentique).
    await tx.creator.update({ where: { id: creatorId }, data: { contractRequiredAt: null } });
    await tx.auditLog.create({
      data: { brandId: head.brandId, actorType: "USER", actorId: actor.userId, action: "contract.sent", entity: "ContractRequest", entityId: req.id, after: { externalId, email, sandbox: conn.sandbox, bodySha256, pendingCoupon: opts.pendingCoupon?.code ?? null } },
    });
    return req;
  });
  await enqueueJob(prisma, { type: AUTENTIQUE_JOB, brandId: head.brandId, dedupeKey: `autentique:${head.brandId}:${slot(now)}`, runAt: new Date(now.getTime() + 5 * 60_000) });
  return { requestId: r.id, email, sandbox: conn.sandbox };
}

const slot = (d: Date) => Math.floor(d.getTime() / (5 * 60_000));

/** Agenda a conferência das marcas com contrato esperando assinatura ou cupom a criar (uma por marca a cada 5 min). */
export async function enqueueDueContractChecks(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.contractRequest.findMany({
    where: { OR: [{ status: "SENT" }, { status: "SIGNED", pendingCouponCode: { not: null }, couponCreatedAt: null }] },
    distinct: ["brandId"],
    select: { brandId: true },
  });
  let n = 0;
  for (const { brandId } of brands) if (await enqueueJob(prisma, { type: AUTENTIQUE_JOB, brandId, dedupeKey: `autentique:${brandId}:${slot(now)}`, runAt: now })) n++;
  return n;
}

/** "Conferir agora" na ficha: confere os contratos daquela creator na hora. */
export async function checkCreatorContracts(prisma: PrismaClient, actor: Actor | null, creatorId: string, deps: Deps = {}) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
  if (!c || !actor || !can(actor.grants, "creators.edit", c.brandId)) throw new ContractSendError("Sem permissão.");
  return checkContracts(prisma, c.brandId, { ...deps, creatorId });
}

/** Confere no Autentique os contratos da marca esperando assinatura e cria os cupons que ficaram para depois. */
export async function checkContracts(prisma: PrismaClient, brandId: string, deps: Deps & { creatorId?: string } = {}) {
  const now = deps.now ?? new Date();
  const out = { signed: 0, rejected: 0, coupons: 0, errors: 0 };
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
          prisma.auditLog.create({ data: { brandId, actorType: "SYSTEM", action: "contract.rejected", entity: "ContractRequest", entityId: req.id, after: { reason: mine.rejectReason ?? null } } }),
        ]);
        out.rejected++;
      } else if (mine?.signedAt) {
        await markSigned(prisma, req.id, now);
        out.signed++;
      } else {
        await prisma.contractRequest.update({ where: { id: req.id }, data: { lastCheckedAt: now, lastError: null } });
      }
    } catch (error) {
      out.errors++;
      await prisma.contractRequest.update({ where: { id: req.id }, data: { lastCheckedAt: now, lastError: String(error instanceof Error ? error.message : error).slice(0, 300) } });
    }
  }
  // Cupom da aprovação nova: criado na Shopify só depois da assinatura (tenta de novo a cada rodada se falhar).
  const due = await prisma.contractRequest.findMany({
    where: { brandId, status: "SIGNED", pendingCouponCode: { not: null }, couponCreatedAt: null, ...(deps.creatorId ? { creatorId: deps.creatorId } : {}) },
  });
  for (const req of due) {
    try {
      await createPendingCoupon(prisma, req, deps.clientFor ?? defaultClientFactory, now);
      out.coupons++;
    } catch (error) {
      out.errors++;
      const msg = error instanceof CouponCreateError ? `Cupom: ${error.message}` : String(error instanceof Error ? error.message : error);
      await prisma.contractRequest.update({ where: { id: req.id }, data: { lastError: msg.slice(0, 300) } });
    }
  }
  return out;
}

async function markSigned(prisma: PrismaClient, requestId: string, now: Date) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.contractRequest.updateMany({ where: { id: requestId, status: "SENT" }, data: { status: "SIGNED", signedAt: now, lastCheckedAt: now, lastError: null } });
    if (count === 0) return; // outra rodada já marcou
    const req = await tx.contractRequest.findUniqueOrThrow({ where: { id: requestId } });
    const c = await tx.creator.findUniqueOrThrow({
      where: { id: req.creatorId },
      select: { contractStart: true, contractEnd: true, contractTemplate: { select: { months: true, welcomeProducts: true } } },
    });
    const start = c.contractStart ? c.contractStart.toISOString().slice(0, 10) : dayKey(now);
    const end = c.contractEnd ? null : addMonthsToDay(start, c.contractTemplate?.months ?? 6);
    await tx.creator.update({
      where: { id: req.creatorId },
      data: {
        contractSigned: true,
        contractRequiredAt: null,
        ...(c.contractStart ? {} : { contractStart: new Date(`${start}T00:00:00Z`) }),
        ...(end ? { contractEnd: new Date(`${end}T00:00:00Z`) } : {}),
      },
    });
    // D-WELCOMEKIT: kit do início da parceria, uma vez só (quem já tem kit de boas-vindas não ganha outro).
    const welcome = c.contractTemplate?.welcomeProducts ?? 0;
    const hasWelcome = await tx.kitGrant.findFirst({ where: { creatorId: req.creatorId, kind: "WELCOME" }, select: { id: true } });
    if (welcome > 0 && !hasWelcome) {
      const month = dayKey(now).slice(0, 7);
      await tx.kitGrant.create({ data: { brandId: req.brandId, creatorId: req.creatorId, kind: "WELCOME", month, salesCents: 0, products: welcome } });
      await notify(tx, [{ brandId: req.brandId, creatorId: req.creatorId, notice: notices.kitAvailable("WELCOME", month, welcome) }]);
    }
    await tx.auditLog.create({
      data: { brandId: req.brandId, actorType: "SYSTEM", action: "contract.signed", entity: "ContractRequest", entityId: req.id, after: { externalId: req.externalId, welcomeKit: hasWelcome ? 0 : welcome } },
    });
  });
}

async function createPendingCoupon(
  prisma: PrismaClient,
  req: { id: string; brandId: string; creatorId: string; createdById: string; pendingCouponCode: string | null; pendingDiscountBps: number | null },
  clientFor: ClientFactory,
  now: Date,
) {
  const code = req.pendingCouponCode!;
  const discountBps = req.pendingDiscountBps!;
  if (await prisma.coupon.findUnique({ where: { brandId_code: { brandId: req.brandId, code } }, select: { id: true } }))
    throw new CouponCreateError(`o cupom ${code} já existe nesta marca; crie outro na ficha.`);
  const shopifyId = await createDiscountInShopify(prisma, req.brandId, code, discountBps, clientFor, now);
  await prisma.$transaction(async (tx) => {
    const c = await tx.coupon.create({ data: { brandId: req.brandId, code, kind: "CREATOR", classifiedAt: now, classifiedById: req.createdById, discountBps, shopifyId } });
    await tx.couponAssignment.create({
      data: { brandId: req.brandId, couponId: c.id, creatorId: req.creatorId, validFrom: now, createdById: req.createdById, confirmedAt: now, confirmedById: req.createdById },
    });
    await tx.contractRequest.update({ where: { id: req.id }, data: { couponCreatedAt: now, lastError: null } });
    await tx.auditLog.create({
      data: { brandId: req.brandId, actorType: "SYSTEM", action: "coupon.created_after_contract", entity: "Coupon", entityId: c.id, after: { code, discountBps, shopifyId, contractRequestId: req.id } },
    });
  });
}

/** Handler da fila: confere os contratos de uma marca. */
export const autentiqueCheckHandler = (prisma: PrismaClient) => async (job: { brandId: string | null }) => {
  if (!job.brandId) throw new Error("Tarefa sem marca.");
  await checkContracts(prisma, job.brandId);
};

/** Situação do Autentique na ficha: a marca está conectada? Os últimos contratos enviados para esta creator. */
export async function creatorAutentique(prisma: PrismaClient, creatorId: string, brandId: string) {
  const [row, requests] = await Promise.all([
    prisma.brandIntegration.findUnique({ where: { brandId_kind: { brandId, kind: "AUTENTIQUE" } }, select: { status: true } }),
    prisma.contractRequest.findMany({
      where: { creatorId },
      orderBy: { sentAt: "desc" },
      take: 5,
      select: { id: true, status: true, sandbox: true, signerEmail: true, sentAt: true, signedAt: true, rejectedAt: true, rejectReason: true, lastCheckedAt: true, lastError: true, pendingCouponCode: true, couponCreatedAt: true },
    }),
  ]);
  return { connected: row?.status === "CONNECTED", requests };
}
export type CreatorAutentique = Awaited<ReturnType<typeof creatorAutentique>>;
