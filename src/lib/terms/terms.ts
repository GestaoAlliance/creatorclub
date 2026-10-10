import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";

/**
 * Termo de aceite da creator (P4, D-TERMS). Texto por marca, em versões que só recebem inserções; a creator aceita
 * a versão mais nova no primeiro acesso (o portal fica bloqueado até lá) e de novo a cada versão nova. O aceite grava
 * nome completo e CPF digitados, data, IP e navegador. Publicar versão nova: só super admin (`staff.manage`).
 */

export class TermsError extends Error {}

/** CPF com 11 números e dígitos verificadores certos (sem todos iguais). */
export function isValidCpf(input: string): boolean {
  const d = input.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

export function maskCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

export async function currentTerms(prisma: PrismaClient, brandId: string) {
  return prisma.termsVersion.findFirst({ where: { brandId }, orderBy: { version: "desc" }, select: { id: true, version: true, title: true, body: true, createdAt: true } });
}

/** Termo que a creator ainda precisa aceitar (a versão mais nova), ou null. Sem termo na marca: nada a aceitar. */
export async function pendingTerms(prisma: PrismaClient, ctx: Pick<PortalContext, "creatorId" | "brand">) {
  const terms = await currentTerms(prisma, ctx.brand.id);
  if (!terms) return null;
  const accepted = await prisma.termsAcceptance.findUnique({ where: { creatorId_termsVersionId: { creatorId: ctx.creatorId, termsVersionId: terms.id } }, select: { id: true } });
  return accepted ? null : terms;
}

export async function acceptTerms(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: { actorUserId: string; termsVersionId: string; fullName: string; cpf: string; accept: boolean; ip?: string | null; userAgent?: string | null },
  now = new Date(),
) {
  if (ctx.viewAs) throw new TermsError("Visualização da equipe: nada é aceito em nome da creator.");
  if (!input.accept) throw new TermsError("Marque que você leu e aceita o termo.");
  const fullName = input.fullName.trim().replace(/\s+/g, " ").slice(0, 160);
  if (fullName.split(" ").length < 2) throw new TermsError("Informe seu nome completo.");
  const cpf = input.cpf.replace(/\D/g, "");
  if (!isValidCpf(cpf)) throw new TermsError("CPF inválido. Confira os números.");
  const terms = await currentTerms(prisma, ctx.brand.id);
  if (!terms || terms.id !== input.termsVersionId) throw new TermsError("O termo foi atualizado. Recarregue a página e leia a versão nova.");

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { brandId: true, account: { select: { id: true, cpf: true } } } });
  const saved = creator.account.cpf?.replace(/\D/g, "") || null;
  if (saved && saved !== cpf) throw new TermsError("Este CPF é diferente do que está no seu cadastro. Fale com a equipe.");

  await prisma.$transaction(async (tx) => {
    const exists = await tx.termsAcceptance.findUnique({ where: { creatorId_termsVersionId: { creatorId: ctx.creatorId, termsVersionId: terms.id } }, select: { id: true } });
    if (exists) return;
    const a = await tx.termsAcceptance.create({
      data: {
        brandId: creator.brandId,
        creatorId: ctx.creatorId,
        termsVersionId: terms.id,
        userId: input.actorUserId,
        fullName,
        cpf,
        ip: input.ip?.slice(0, 64) ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        acceptedAt: now,
      },
    });
    if (!saved) await tx.creatorAccount.update({ where: { id: creator.account.id }, data: { cpf } });
    await tx.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: input.actorUserId, action: "terms.accepted", entity: "TermsAcceptance", entityId: a.id, after: { version: terms.version } },
    });
  });
}

export async function publishTerms(prisma: PrismaClient, actor: Actor | null, input: { brandId: string; title: string; body: string }) {
  if (!actor || !can(actor.grants, "staff.manage", input.brandId)) throw new TermsError("Só super admin publica o termo.");
  const title = input.title.trim().slice(0, 200);
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!title || body.length < 50) throw new TermsError("Informe o título e o texto completo do termo.");
  const current = await currentTerms(prisma, input.brandId);
  if (current && current.title === title && current.body === body) throw new TermsError("Nada mudou em relação à versão atual.");
  const version = (current?.version ?? 0) + 1;
  try {
    return await prisma.$transaction(async (tx) => {
      const v = await tx.termsVersion.create({ data: { brandId: input.brandId, version, title, body, createdById: actor.userId } });
      await tx.auditLog.create({
        data: { brandId: input.brandId, actorType: "USER", actorId: actor.userId, action: "terms.published", entity: "TermsVersion", entityId: v.id, after: { version } },
      });
      return { version };
    });
  } catch (error) {
    if (String(error).includes("TermsVersion_brandId_version_key")) throw new TermsError("Outra pessoa publicou uma versão agora. Recarregue a página.");
    throw error;
  }
}

/** Painel do termo: versão atual e quantas creators (não desligadas) já aceitaram. */
export async function termsOverview(prisma: PrismaClient, actor: Actor | null, brandId: string) {
  if (!actor || !can(actor.grants, "staff.manage", brandId)) throw new TermsError("Só super admin.");
  const current = await currentTerms(prisma, brandId);
  const [creators, accepted, versions] = await Promise.all([
    prisma.creator.count({ where: { brandId, status: { not: "DEACTIVATED" } } }),
    current ? prisma.termsAcceptance.count({ where: { termsVersionId: current.id, creator: { status: { not: "DEACTIVATED" } } } }) : Promise.resolve(0),
    prisma.termsVersion.findMany({ where: { brandId }, orderBy: { version: "desc" }, select: { version: true, createdAt: true, _count: { select: { acceptances: true } } } }),
  ]);
  return { current, creators, accepted, versions: versions.map((v) => ({ version: v.version, createdAt: v.createdAt, acceptances: v._count.acceptances })) };
}

/** Situação do termo na ficha da creator. */
export async function creatorTermsStatus(prisma: PrismaClient, creatorId: string, brandId: string) {
  const [current, last] = await Promise.all([
    currentTerms(prisma, brandId),
    prisma.termsAcceptance.findFirst({
      where: { creatorId },
      orderBy: { acceptedAt: "desc" },
      select: { acceptedAt: true, fullName: true, cpf: true, ip: true, termsVersion: { select: { version: true } } },
    }),
  ]);
  return {
    currentVersion: current?.version ?? null,
    last: last ? { at: last.acceptedAt, name: last.fullName, cpf: maskCpf(last.cpf), ip: last.ip, version: last.termsVersion.version } : null,
  };
}
