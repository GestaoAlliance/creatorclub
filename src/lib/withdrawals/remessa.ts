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
  bankResult: true,
  bankAt: true,
  creator: { select: { account: { select: { name: true, cpf: true, cnpj: true, pixKey: true, pixKeyChangedAt: true } } } },
} as const;

type Row = { id: string; amountCents: number; method: string; creator: { account: { name: string; cpf: string | null; cnpj: string | null; pixKey: string | null } } };

/** Mesma ordem na geração e no "baixar de novo" (o arquivo precisa sair idêntico). */
const ORDER = [{ approvedAt: "asc" }, { id: "asc" }] as const;

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
  const rows = await prisma.withdrawal.findMany({ where: { brandId, status: "APPROVED", remittanceId: null }, orderBy: [...ORDER], select: SELECT });
  const payments = rows.map(toPayment);
  const problems = checkRemessa(companyOf(brand), payments, payDay, dayKey(now, brand.timezone));
  // D-BANKREJECT: devolvido pelo banco e a chave não mudou desde então: avisa (não impede; o motivo pode ser outro).
  const warnings = rows
    .filter((w) => w.bankResult === "REJECTED" && !(w.creator.account.pixKeyChangedAt && w.bankAt && w.creator.account.pixKeyChangedAt > w.bankAt))
    .map((w) => ({ name: w.creator.account.name, problem: "o banco devolveu o último Pix e a chave Pix não foi trocada desde então. Confira antes de mandar de novo." }));
  const cnpj = rows.filter((w) => w.method === "NF_PIX").length;
  return {
    count: payments.length,
    cnpj,
    cpf: payments.length - cnpj,
    totalCents: payments.reduce((s, p) => s + p.amountCents, 0),
    problems: problems.map((p) => ({ ...p, name: payments.find((x) => x.id === p.id)?.name ?? null })),
    warnings,
  };
}

/** Gera a remessa: grava o registro, marca os saques e devolve o arquivo. */
export async function generateRemessa(prisma: PrismaClient, actor: Actor | null, brandId: string, payDay: string, now = new Date()) {
  assertPay(actor, brandId);
  return prisma.$transaction(async (tx) => {
    // Trava a marca: duas remessas ao mesmo tempo não pegam os mesmos saques nem o mesmo número.
    await tx.$queryRaw`SELECT id FROM "Brand" WHERE id = ${brandId} FOR UPDATE`;
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: BRAND_SELECT });
    const rows = await tx.withdrawal.findMany({ where: { brandId, status: "APPROVED", remittanceId: null }, orderBy: [...ORDER], select: SELECT });
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
    const marked = await tx.withdrawal.updateMany({ where: { id: { in: payments.map((p) => p.id) }, remittanceId: null, status: "APPROVED" }, data: { remittanceId: remittance.id, bankResult: null, bankNote: null, bankAt: null } });
    // D-NODOUBLEPAY: algum saque foi pago ou recusado no meio do caminho: nada é gerado (o arquivo teria um Pix a mais).
    if (marked.count !== payments.length) throw new RemessaError("Um saque mudou de situação enquanto a remessa era gerada. Gere de novo.");
    await tx.brand.update({ where: { id: brandId }, data: { remittanceSeq: nsa } });
    await tx.auditLog.create({
      data: { brandId, actorType: "USER", actorId: actor.userId, action: "remittance.generated", entity: "PaymentRemittance", entityId: remittance.id, after: { nsa, payDay, count: payments.length, totalCents } },
    });
    return { fileName: `REMESSA_${brand.slug.toUpperCase()}_${String(nsa).padStart(6, "0")}.txt`, content, count: payments.length, totalCents, nsa };
  });
}

/** Remessas da marca, da mais nova para a mais antiga (para baixar de novo o arquivo). */
export async function recentRemessas(prisma: PrismaClient, actor: Actor | null, brandId: string, take = 6) {
  assertPay(actor, brandId);
  const rows = await prisma.paymentRemittance.findMany({
    where: { brandId },
    orderBy: { nsa: "desc" },
    take,
    select: { id: true, nsa: true, payDay: true, count: true, totalCents: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, payDay: r.payDay.toISOString().slice(0, 10) }));
}

/**
 * D-REMESSAFILE: o arquivo de uma remessa já gerada, para baixar de novo (o download pode falhar). Remonta com os mesmos
 * dados e só entrega se a assinatura bater com a da geração: se algum saque saiu da remessa ou um dado mudou (ex.: chave
 * Pix), o arquivo não seria o mesmo e não sai.
 */
export async function remessaFile(prisma: PrismaClient, actor: Actor | null, remittanceId: string) {
  const r = await prisma.paymentRemittance.findUnique({ where: { id: remittanceId }, select: { id: true, brandId: true, nsa: true, payDay: true, sha256: true, createdAt: true } });
  if (!r) throw new RemessaError("Remessa não encontrada.");
  assertPay(actor, r.brandId);
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: r.brandId }, select: BRAND_SELECT });
  const rows = await prisma.withdrawal.findMany({ where: { remittanceId: r.id }, orderBy: [...ORDER], select: SELECT });
  const content = rows.length
    ? buildRemessa({ company: companyOf(brand), payments: rows.map(toPayment), payDay: r.payDay.toISOString().slice(0, 10), nsa: r.nsa, now: r.createdAt, today: dayKey(r.createdAt, brand.timezone) })
    : "";
  if (!content || createHash("sha256").update(content).digest("hex") !== r.sha256)
    throw new RemessaError(`A remessa nº ${r.nsa} mudou depois de gerada (saque tirado ou devolvido pelo banco, ou dado da creator trocado). O arquivo de antes não pode ser refeito: se ela ainda não foi enviada ao banco, tire os saques dela e gere uma nova.`);
  await prisma.auditLog.create({ data: { brandId: r.brandId, actorType: "USER", actorId: actor.userId, action: "remittance.downloaded", entity: "PaymentRemittance", entityId: r.id, after: { nsa: r.nsa } } });
  return { fileName: `REMESSA_${brand.slug.toUpperCase()}_${String(r.nsa).padStart(6, "0")}.txt`, content };
}

/** Tira um saque da remessa (o banco recusou): ele volta para a próxima. */
export async function removeFromRemessa(prisma: PrismaClient, actor: Actor | null, withdrawalId: string, confirmNotPaid = false) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId }, select: { brandId: true, status: true, remittanceId: true, bankResult: true } });
  if (!w) throw new RemessaError("Saque não encontrado.");
  assertPay(actor, w.brandId);
  if (w.status !== "APPROVED" || !w.remittanceId) throw new RemessaError("Só saque aprovado e enviado ao banco sai da remessa.");
  // D-NODOUBLEPAY: agendado ou esperando assinatura no banco = o banco vai pagar; tirar faria pagar de novo.
  if (w.bankResult === "SCHEDULED" || w.bankResult === "PENDING") throw new RemessaError("O banco já agendou este Pix (ou está esperando assinatura). Cancele no Internet Banking e suba o retorno; não tire da remessa.");
  if (!confirmNotPaid) throw new RemessaError("Confirme que o arquivo desta remessa não foi enviado ao banco (ou que o banco não vai pagar este Pix).");
  await prisma.$transaction([
    prisma.withdrawal.update({ where: { id: withdrawalId }, data: { remittanceId: null } }),
    prisma.auditLog.create({ data: { brandId: w.brandId, actorType: "USER", actorId: actor.userId, action: "remittance.removed", entity: "Withdrawal", entityId: withdrawalId, before: { remittanceId: w.remittanceId } } }),
  ]);
}
