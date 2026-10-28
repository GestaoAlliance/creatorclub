import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildRemessa, checkRemessa, dayKey, type CnabCompany, type CnabPayment, type RemessaProblem } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Remessa SICOOB (D-REMESSA): o Pagamento gera o arquivo CNAB 240 de Pix com os saques aprovados pela Gestão e
 * ainda não enviados ao banco (PJ com NF e PF com recibo, pela chave Pix do cadastro). Os saques ficam marcados como
 * enviados; depois que o banco processa, o Pagamento marca como pagos (como hoje). Saque recusado pelo banco pode
 * sair da remessa para ir na próxima.
 */

export class RemessaError extends Error {
  constructor(message: string, readonly problems: RemessaProblem[] = []) {
    super(message);
  }
}

const SELECT = {
  id: true,
  amountCents: true,
  method: true,
  creator: { select: { account: { select: { name: true, cpf: true, cnpj: true, pixKey: true } } } },
} as const;

type Row = { id: string; amountCents: number; method: string; creator: { account: { name: string; cpf: string | null; cnpj: string | null; pixKey: string | null } } };

function toPayment(w: Row): CnabPayment {
  const a = w.creator.account;
  // PJ (NF) recebe no CNPJ; PF (recibo) no CPF.
  const doc = (w.method === "NF_PIX" ? a.cnpj : a.cpf) ?? a.cpf ?? a.cnpj ?? "";
  return { id: w.id, name: a.name, doc: doc.replace(/\D/g, ""), pixKey: a.pixKey ?? "", amountCents: w.amountCents };
}

function companyOf(b: { name: string; legalName: string | null; nfTakerDocument: string | null; bankConvenio: string | null; bankAgency: string | null; bankAgencyDv: string | null; bankAccount: string | null; bankAccountDv: string | null }): CnabCompany {
  return {
    cnpj: b.nfTakerDocument ?? "",
    name: b.legalName ?? b.name,
    convenio: b.bankConvenio ?? "",
    agency: b.bankAgency ?? "",
    agencyDv: b.bankAgencyDv ?? "",
    account: b.bankAccount ?? "",
    accountDv: b.bankAccountDv ?? "",
  };
}

const BRAND_SELECT = { id: true, slug: true, name: true, timezone: true, legalName: true, nfTakerDocument: true, bankConvenio: true, bankAgency: true, bankAgencyDv: true, bankAccount: true, bankAccountDv: true, remittanceSeq: true } as const;

function assertPay(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.manage", brandId)) throw new RemessaError("Sem permissão.");
}

/** O que entraria na próxima remessa da marca, com os problemas que impedem gerar. */
export async function remessaPreview(prisma: PrismaClient, actor: Actor | null, brandId: string, payDay: string, now = new Date()) {
  assertPay(actor, brandId);
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: BRAND_SELECT });
  const rows = await prisma.withdrawal.findMany({ where: { brandId, status: "APPROVED", remittanceId: null }, orderBy: { approvedAt: "asc" }, select: SELECT });
  const payments = rows.map(toPayment);
  const problems = checkRemessa(companyOf(brand), payments, payDay, dayKey(now, brand.timezone));
  return { count: payments.length, totalCents: payments.reduce((s, p) => s + p.amountCents, 0), problems: problems.map((p) => ({ ...p, name: payments.find((x) => x.id === p.id)?.name ?? null })) };
}

/** Gera a remessa: grava o registro, marca os saques e devolve o arquivo. */
export async function generateRemessa(prisma: PrismaClient, actor: Actor | null, brandId: string, payDay: string, now = new Date()) {
  assertPay(actor, brandId);
  return prisma.$transaction(async (tx) => {
    // Trava a marca: duas remessas ao mesmo tempo não pegam os mesmos saques nem o mesmo número.
    await tx.$queryRaw`SELECT id FROM "Brand" WHERE id = ${brandId} FOR UPDATE`;
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: BRAND_SELECT });
    const rows = await tx.withdrawal.findMany({ where: { brandId, status: "APPROVED", remittanceId: null }, orderBy: { approvedAt: "asc" }, select: SELECT });
    const payments = rows.map(toPayment);
    const company = companyOf(brand);
    const today = dayKey(now, brand.timezone);
    const problems = checkRemessa(company, payments, payDay, today);
    if (problems.length) throw new RemessaError("A remessa tem pendências.", problems);
    const nsa = brand.remittanceSeq + 1;
    const content = buildRemessa({ company, payments, payDay, nsa, now, today });
    const totalCents = payments.reduce((s, p) => s + p.amountCents, 0);
    const remittance = await tx.paymentRemittance.create({
      data: { brandId, nsa, payDay: new Date(`${payDay}T00:00:00Z`), count: payments.length, totalCents, sha256: createHash("sha256").update(content).digest("hex"), createdById: actor.userId, createdAt: now },
    });
    await tx.withdrawal.updateMany({ where: { id: { in: payments.map((p) => p.id) }, remittanceId: null, status: "APPROVED" }, data: { remittanceId: remittance.id } });
    await tx.brand.update({ where: { id: brandId }, data: { remittanceSeq: nsa } });
    await tx.auditLog.create({
      data: { brandId, actorType: "USER", actorId: actor.userId, action: "remittance.generated", entity: "PaymentRemittance", entityId: remittance.id, after: { nsa, payDay, count: payments.length, totalCents } },
    });
    return { fileName: `REMESSA_${brand.slug.toUpperCase()}_${String(nsa).padStart(6, "0")}.txt`, content, count: payments.length, totalCents, nsa };
  });
}

/** Tira um saque da remessa (o banco recusou): ele volta para a próxima. */
export async function removeFromRemessa(prisma: PrismaClient, actor: Actor | null, withdrawalId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId }, select: { brandId: true, status: true, remittanceId: true } });
  if (!w) throw new RemessaError("Saque não encontrado.");
  assertPay(actor, w.brandId);
  if (w.status !== "APPROVED" || !w.remittanceId) throw new RemessaError("Só saque aprovado e enviado ao banco sai da remessa.");
  await prisma.$transaction([
    prisma.withdrawal.update({ where: { id: withdrawalId }, data: { remittanceId: null } }),
    prisma.auditLog.create({ data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "remittance.removed", entity: "Withdrawal", entityId: withdrawalId, before: { remittanceId: w.remittanceId } } }),
  ]);
}
