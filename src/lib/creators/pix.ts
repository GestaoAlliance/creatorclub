import type { PrismaClient } from "@/generated/prisma/client";
import { notices } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { notify } from "@/lib/notifications/notify";
import type { PortalContext } from "@/lib/portal/context";
import { maskPix } from "@/lib/portal/withdrawal-extras";

/**
 * Troca da chave Pix (D-PIXCHANGE, pedido do responsável em 2026-11-16): a creator troca no portal (Saque) e a equipe
 * (quem vê dados fiscais e edita creators ou paga saques) troca na ficha, com o motivo. Contra golpe: toda troca vai
 * para a auditoria, a creator recebe o aviso (portal, WhatsApp ou e-mail) e o saque mostra "chave trocada há X dias".
 * Não troca com saque aprovado esperando o Pix (o Pagamento pode estar pagando na chave antiga), salvo o que o banco
 * devolveu e já saiu da remessa (D-BANKREJECT).
 */

export class PixError extends Error {}

export type PixWho = { kind: "creator"; ctx: PortalContext; userId: string } | { kind: "staff"; actor: Actor | null; reason: string };

/** Chave como a pessoa digitou, sem espaços nas pontas; 3 a 140 caracteres. */
export function cleanPixKey(raw: string): string {
  const key = raw.trim().replace(/\s+/g, " ");
  if (key.length < 3 || key.length > 140) throw new PixError("Digite a chave Pix (CPF, CNPJ, e-mail, celular ou chave aleatória).");
  return key;
}

export const canEditPix = (actor: Actor, brandId: string) =>
  can(actor.grants, "personal.fiscal", brandId) && (can(actor.grants, "creators.edit", brandId) || can(actor.grants, "withdrawals.manage", brandId));

export async function changePixKey(prisma: PrismaClient, who: PixWho, creatorId: string, rawKey: string, now = new Date()) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, accountId: true, account: { select: { pixKey: true } } } });
  if (!c) throw new PixError("Creator não encontrada.");
  let actorId: string;
  let reason: string | null = null;
  if (who.kind === "creator") {
    if (who.ctx.viewAs) throw new PixError("Visualização da equipe: nada é alterado em nome da creator.");
    if (who.ctx.creatorId !== creatorId) throw new PixError("Sem permissão.");
    actorId = who.userId;
  } else {
    if (!who.actor || !canEditPix(who.actor, c.brandId)) throw new PixError("Sem permissão para trocar a chave Pix.");
    reason = who.reason.trim().replace(/\s+/g, " ").slice(0, 200);
    if (!reason) throw new PixError("Escreva o motivo da troca (ex.: a creator pediu pelo WhatsApp).");
    actorId = who.actor.userId;
  }
  const key = cleanPixKey(rawKey);
  if (key === c.account.pixKey) throw new PixError("Esta já é a chave cadastrada.");
  // Saque aprovado esperando o Pix (de qualquer marca da pessoa): a chave antiga pode estar sendo paga.
  // D-BANKREJECT: o que o banco devolveu e já saiu da remessa não está sendo pago; a troca da chave é o conserto.
  const waiting = await prisma.withdrawal.count({
    where: { status: "APPROVED", creator: { accountId: c.accountId }, OR: [{ remittanceId: { not: null } }, { bankResult: null }, { bankResult: { not: "REJECTED" } }] },
  });
  if (waiting) throw new PixError("Há um saque aprovado esperando o Pix. Troque a chave depois que ele for pago (ou peça para a equipe recusar e você pede de novo).");
  await prisma.$transaction(async (tx) => {
    await tx.creatorAccount.update({ where: { id: c.accountId }, data: { pixKey: key, pixKeyChangedAt: now } });
    await tx.auditLog.create({
      data: { brandId: c.brandId, actorType: "USER", actorId, action: "creator.pix_change", entity: "CreatorAccount", entityId: c.accountId, before: { pixKey: c.account.pixKey }, after: { pixKey: key, by: who.kind, reason } },
    });
    // Aviso na marca em que a troca foi feita (a chave vale para todas as marcas da pessoa).
    await notify(tx, [{ brandId: c.brandId, creatorId, notice: notices.pixChanged(maskPix(key), who.kind === "staff", now) }]);
  });
  return { masked: maskPix(key) };
}
