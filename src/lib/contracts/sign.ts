import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  addMonthsToDay,
  CONTRACT_KINDS,
  dayKey,
  isContractKind,
  parseKitTiers,
  renderContract,
  UGC_DEFAULT_VIDEO_GOAL,
  unknownContractFields,
  type ContractData,
  type ContractKind,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";
import { isValidCpf, maskCpf } from "@/lib/terms/terms";

/**
 * Contrato assinado no portal (D-SIGNCONTRACT). Quem foi aprovada em Candidatas (`contractRequiredAt`) só usa o
 * portal depois de assinar o contrato da versão escolhida na aprovação. O texto do tipo (influencer, prescritor, UGC)
 * é preenchido com os dados dela; ela confere nome, CPF, endereço e, se tiver, CNPJ e razão social, e assina. Fica
 * guardado o texto exatamente como foi assinado (com hash), nome, CPF, data, IP e navegador. Assinar marca
 * "contrato assinado" na ficha e, se estiverem vazios, o início (data da assinatura) e o fim do contrato.
 */

export class ContractSignError extends Error {}

export async function currentContract(prisma: PrismaClient, brandId: string, kind: ContractKind) {
  return prisma.contractDocument.findFirst({
    where: { brandId, kind },
    orderBy: { version: "desc" },
    select: { id: true, kind: true, version: true, title: true, body: true, createdAt: true },
  });
}

const fold = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

/** Dados que vêm do sistema (cupom, taxa, versão do contrato) e o que a creator confere (pré-preenchido). */
async function contractBase(prisma: PrismaClient, creatorId: string, now: Date) {
  const c = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    select: {
      id: true,
      brandId: true,
      contractRequiredAt: true,
      ugcVideoGoal: true,
      contractTemplate: { select: { id: true, documentKind: true, releaseMinCents: true, kitTiers: true, months: true } },
      account: { select: { name: true, cpf: true, cnpj: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true, addrZip: true } },
      couponAssignments: {
        where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }], coupon: { kind: "CREATOR" } },
        orderBy: { validFrom: "desc" },
        take: 1,
        select: { coupon: { select: { code: true, discountBps: true } } },
      },
      commissionPolicies: { where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: { validFrom: "desc" }, take: 1, select: { rateBps: true } },
    },
  });
  const a = c.account;
  const structured = a.addrStreet
    ? [`${a.addrStreet}, ${a.addrNumber ?? "s/n"}${a.addrComplement ? ` - ${a.addrComplement}` : ""}`, a.addrDistrict, a.addrCity && a.addrState ? `${a.addrCity}/${a.addrState}` : a.addrCity, a.addrZip ? `CEP ${a.addrZip}` : null]
        .filter(Boolean)
        .join(", ")
    : null;
  const app = await prisma.creatorApplication.findFirst({ where: { creatorId }, orderBy: { submittedAt: "desc" }, select: { address: true, cnpj: true, companyName: true } });
  const coupon = c.couponAssignments[0]?.coupon ?? null;
  return {
    creator: c,
    prefill: {
      fullName: a.name,
      cpf: a.cpf ?? "",
      address: structured ?? fold((app?.address ?? "").replace(/\s*\n+\s*/g, ", ")).replace(/,\s*,/g, ","),
      cnpj: a.cnpj ?? app?.cnpj?.replace(/\D/g, "") ?? "",
      companyName: fold(app?.companyName),
    },
    fixed: {
      coupon: coupon?.code ?? null,
      discountBps: coupon?.discountBps ?? null,
      rateBps: c.commissionPolicies[0]?.rateBps ?? null,
      releaseMinCents: c.contractTemplate?.releaseMinCents ?? null,
      kitTiers: parseKitTiers(c.contractTemplate?.kitTiers),
      months: c.contractTemplate?.months ?? 6,
      videoGoal: c.ugcVideoGoal ?? UGC_DEFAULT_VIDEO_GOAL,
    },
  };
}

export type PendingContract = {
  documentId: string;
  templateId: string;
  title: string;
  body: string;
  prefill: { fullName: string; cpf: string; address: string; cnpj: string; companyName: string };
  fixed: Omit<ContractData, "fullName" | "cpf" | "address" | "cnpj" | "companyName" | "signedAt">;
};

/**
 * Contrato que a creator ainda precisa assinar, ou null. Só para quem a aprovação marcou (`contractRequiredAt`); sem
 * versão de contrato na ficha ou sem texto publicado para o tipo, não trava (a equipe resolve antes).
 */
export async function pendingContract(prisma: PrismaClient, ctx: Pick<PortalContext, "creatorId">, now = new Date()): Promise<PendingContract | null> {
  const head = await prisma.creator.findUnique({
    where: { id: ctx.creatorId },
    select: { brandId: true, contractRequiredAt: true, contractTemplate: { select: { documentKind: true } }, _count: { select: { contractSignatures: true } } },
  });
  if (!head?.contractRequiredAt || head._count.contractSignatures > 0 || !head.contractTemplate) return null;
  const kind = head.contractTemplate.documentKind;
  if (!isContractKind(kind)) return null;
  const doc = await currentContract(prisma, head.brandId, kind);
  if (!doc) return null;
  const base = await contractBase(prisma, ctx.creatorId, now);
  return { documentId: doc.id, templateId: base.creator.contractTemplate!.id, title: doc.title, body: doc.body, prefill: base.prefill, fixed: base.fixed };
}

export async function signContract(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: {
    actorUserId: string;
    documentId: string;
    fullName: string;
    cpf: string;
    address: string;
    cnpj: string;
    companyName: string;
    accept: boolean;
    ip?: string | null;
    userAgent?: string | null;
  },
  now = new Date(),
) {
  if (ctx.viewAs) throw new ContractSignError("Visualização da equipe: nada é assinado em nome da creator.");
  if (!input.accept) throw new ContractSignError("Marque que você leu e concorda com o contrato.");
  const fullName = fold(input.fullName).slice(0, 160);
  if (fullName.split(" ").length < 2) throw new ContractSignError("Informe seu nome completo.");
  const cpf = input.cpf.replace(/\D/g, "");
  if (!isValidCpf(cpf)) throw new ContractSignError("CPF inválido. Confira os números.");
  const address = fold(input.address).slice(0, 300);
  if (address.length < 10) throw new ContractSignError("Informe o endereço completo (rua, número, bairro, cidade, estado e CEP).");
  const cnpj = input.cnpj.replace(/\D/g, "") || null;
  if (cnpj && cnpj.length !== 14) throw new ContractSignError("CNPJ precisa ter 14 números (ou deixe em branco).");
  const companyName = fold(input.companyName).slice(0, 160) || null;
  if (cnpj && !companyName) throw new ContractSignError("Informe a razão social do CNPJ.");

  const pending = await pendingContract(prisma, ctx, now);
  if (!pending) throw new ContractSignError("Não há contrato para assinar.");
  if (pending.documentId !== input.documentId) throw new ContractSignError("O contrato foi atualizado. Recarregue a página e leia a versão nova.");
  const account = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { brandId: true, contractStart: true, contractEnd: true, account: { select: { id: true, cpf: true } } } });
  const saved = account.account.cpf?.replace(/\D/g, "") || null;
  if (saved && saved !== cpf) throw new ContractSignError("Este CPF é diferente do que está no seu cadastro. Fale com a equipe.");

  // O texto assinado é montado de novo aqui, com os dados do sistema e os que ela confirmou: é este que vale.
  const body = renderContract(pending.body, { ...pending.fixed, fullName, cpf, address, cnpj, companyName: cnpj ? companyName : null, signedAt: now });
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
  const start = account.contractStart ? account.contractStart.toISOString().slice(0, 10) : dayKey(now);
  const end = account.contractEnd ? null : addMonthsToDay(start, pending.fixed.months);

  try {
    await prisma.$transaction(async (tx) => {
      const s = await tx.contractSignature.create({
        data: {
          brandId: account.brandId,
          creatorId: ctx.creatorId,
          contractDocumentId: pending.documentId,
          contractTemplateId: pending.templateId,
          userId: input.actorUserId,
          fullName,
          cpf,
          cnpj,
          companyName: cnpj ? companyName : null,
          address,
          body,
          bodySha256,
          ip: input.ip?.slice(0, 64) ?? null,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
          signedAt: now,
        },
      });
      await tx.creator.update({
        where: { id: ctx.creatorId },
        data: {
          contractSigned: true,
          ...(account.contractStart ? {} : { contractStart: new Date(`${start}T00:00:00Z`) }),
          ...(end ? { contractEnd: new Date(`${end}T00:00:00Z`) } : {}),
        },
      });
      if (!saved) await tx.creatorAccount.update({ where: { id: account.account.id }, data: { cpf } });
      await tx.auditLog.create({
        data: {
          brandId: account.brandId,
          actorType: "USER",
          actorId: input.actorUserId,
          action: "contract.signed",
          entity: "ContractSignature",
          entityId: s.id,
          after: { documentId: pending.documentId, templateId: pending.templateId, bodySha256 },
        },
      });
    });
  } catch (error) {
    if (String(error).includes("ContractSignature_creatorId_contractDocumentId_key")) return; // clique duplo: já assinado
    throw error;
  }
}

export async function publishContract(prisma: PrismaClient, actor: Actor | null, input: { brandId: string; kind: string; title: string; body: string }) {
  if (!actor || !can(actor.grants, "staff.manage", input.brandId)) throw new ContractSignError("Só super admin publica o contrato.");
  if (!isContractKind(input.kind)) throw new ContractSignError("Tipo de contrato inválido.");
  const title = fold(input.title).slice(0, 200);
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!title || body.length < 200) throw new ContractSignError("Informe o título e o texto completo do contrato.");
  const unknown = unknownContractFields(body);
  if (unknown.length) throw new ContractSignError(`Campo desconhecido no texto: ${unknown.map((f) => `{{${f}}}`).join(", ")}. Confira a lista de campos.`);
  const current = await currentContract(prisma, input.brandId, input.kind);
  if (current && current.title === title && current.body === body) throw new ContractSignError("Nada mudou em relação à versão atual.");
  const version = (current?.version ?? 0) + 1;
  try {
    return await prisma.$transaction(async (tx) => {
      const d = await tx.contractDocument.create({ data: { brandId: input.brandId, kind: input.kind, version, title, body, createdById: actor.userId } });
      await tx.auditLog.create({
        data: { brandId: input.brandId, actorType: "USER", actorId: actor.userId, action: "contract.published", entity: "ContractDocument", entityId: d.id, after: { kind: input.kind, version } },
      });
      return { version };
    });
  } catch (error) {
    if (String(error).includes("ContractDocument_brandId_kind_version_key")) throw new ContractSignError("Outra pessoa publicou uma versão agora. Recarregue a página.");
    throw error;
  }
}

/** Página Contratos: versão atual de cada tipo, assinaturas e quem ainda falta assinar. */
export async function contractsOverview(prisma: PrismaClient, actor: Actor | null, brandId: string) {
  if (!actor || !can(actor.grants, "staff.manage", brandId)) throw new ContractSignError("Só super admin.");
  const kinds = await Promise.all(
    CONTRACT_KINDS.map(async (kind) => {
      const current = await currentContract(prisma, brandId, kind);
      const versions = await prisma.contractDocument.findMany({
        where: { brandId, kind },
        orderBy: { version: "desc" },
        select: { version: true, createdAt: true, _count: { select: { signatures: true } } },
      });
      return { kind, current, versions: versions.map((v) => ({ version: v.version, createdAt: v.createdAt, signatures: v._count.signatures })) };
    }),
  );
  const waiting = await prisma.creator.findMany({
    where: { brandId, contractRequiredAt: { not: null }, contractSignatures: { none: {} }, status: { not: "DEACTIVATED" } },
    orderBy: { contractRequiredAt: "asc" },
    select: { id: true, contractRequiredAt: true, account: { select: { name: true } }, contractTemplate: { select: { name: true } } },
  });
  return { kinds, waiting: waiting.map((w) => ({ id: w.id, name: w.account.name, since: w.contractRequiredAt!, template: w.contractTemplate?.name ?? null })) };
}

/** Situação do contrato na ficha: se precisa assinar e a assinatura (sem o CPF inteiro). */
export async function creatorContractSignature(prisma: PrismaClient, creatorId: string) {
  const [c, s] = await Promise.all([
    prisma.creator.findUnique({ where: { id: creatorId }, select: { contractRequiredAt: true } }),
    prisma.contractSignature.findFirst({
      where: { creatorId },
      orderBy: { signedAt: "desc" },
      select: { id: true, signedAt: true, fullName: true, cpf: true, ip: true, contractDocument: { select: { kind: true, version: true } } },
    }),
  ]);
  return {
    required: c?.contractRequiredAt ?? null,
    signature: s ? { id: s.id, at: s.signedAt, name: s.fullName, cpf: maskCpf(s.cpf), ip: s.ip, kind: s.contractDocument.kind, version: s.contractDocument.version } : null,
  };
}

/** Texto assinado, para a equipe ler na ficha. Tem CPF e endereço inteiros: só quem vê os dados fiscais. */
export async function signedContractText(prisma: PrismaClient, actor: Actor | null, signatureId: string) {
  const s = await prisma.contractSignature.findUnique({
    where: { id: signatureId },
    select: { brandId: true, creatorId: true, body: true, bodySha256: true, signedAt: true, fullName: true, ip: true, userAgent: true, contractDocument: { select: { title: true, version: true } } },
  });
  if (!s || !actor || !can(actor.grants, "personal.fiscal", s.brandId)) throw new ContractSignError("Contrato não encontrado.");
  return s;
}
