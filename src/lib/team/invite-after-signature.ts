import type { PrismaClient } from "@/generated/prisma/client";
import { whatsappChatUrl } from "@/domain";
import { normalizeEmail } from "@/lib/auth/rules";
import type { EmailSender } from "@/lib/email/sender";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import { inWhatsAppHours, WhatsAppError, type WhatsAppSender } from "@/lib/notifications/whatsapp";
import { emailCreatorInvite } from "./invite-email";
import { INVITE_TTL_DAYS, newInviteToken } from "./tokens";

/**
 * Convite do portal sozinho depois da assinatura (D-INVITEAUTO, pedido do responsável em 2026-10-23, depois da dúvida
 * da Ana): contrato assinado (e o cupom criado, quando ficou para depois), a creator sem login recebe o convite por
 * e-mail (com remetente configurado) e pelo WhatsApp da marca (instância em Marcas, das 9h às 20h). O link aparece
 * uma vez só (no banco fica o hash), então o convite só nasce quando há por onde mandar; sem canal, segue o botão da
 * ficha. Quem se cadastrou pelo site já tem senha e não recebe convite. Uma vez por contrato.
 */

const ACTOR = "system:contract";
const PER_RUN = 10;

const dayMonth = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

export function signedInviteText(p: { name: string; brand: string; link: string; until: Date }) {
  const first = p.name.trim().split(/\s+/)[0] ?? p.name;
  return `Oi, ${first}! Seu contrato com a ${p.brand} está assinado. 🎉\n\nCrie agora o seu acesso ao portal (vendas, cupom, saldo e saque) neste link:\n${p.link}\n\nO link vale até ${dayMonth(p.until)} e só funciona uma vez.`;
}

export async function inviteAfterSignature(
  prisma: PrismaClient,
  deps: { origin: string | null; email: EmailSender | null; whatsapp: WhatsAppSender | null; now?: Date },
): Promise<number> {
  const now = deps.now ?? new Date();
  if (!deps.origin) return 0;
  const due = await prisma.contractRequest.findMany({
    where: { status: "SIGNED", inviteSentAt: null, signedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) }, OR: [{ pendingCouponCode: null }, { couponCreatedAt: { not: null } }] },
    orderBy: { signedAt: "asc" },
    take: 50,
    select: {
      id: true,
      brandId: true,
      creator: { select: { account: { select: { id: true, name: true, email: true, phone: true, userId: true } } } },
      brand: { select: { name: true, whatsappInstance: true } },
    },
  });
  let sent = 0;
  for (const r of due) {
    if (sent >= PER_RUN) break;
    const a = r.creator.account;
    if (a.userId) {
      // Já tem login (cadastro pelo site): entra com a senha dela; nada a mandar.
      await prisma.contractRequest.update({ where: { id: r.id }, data: { inviteSentAt: now } });
      continue;
    }
    const emailOk = deps.email !== null && Boolean(normalizeEmail(a.email)) && !a.email.endsWith(FAKE_EMAIL_DOMAIN);
    const chat = whatsappChatUrl(a.phone);
    const waReady = deps.whatsapp !== null && !!r.brand.whatsappInstance && !!chat;
    // WhatsApp ligado mas fora do horário: espera a próxima rodada no horário (o link vai pelos dois de uma vez).
    if (waReady && !inWhatsAppHours(now)) continue;
    if (!emailOk && !waReady) continue; // sem canal: a Ana gera pela ficha
    const { token, tokenHash } = newInviteToken();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.creatorInvite.create({ data: { accountId: a.id, tokenHash, expiresAt, createdById: ACTOR, createdAt: now } });
      await tx.auditLog.create({ data: { brandId: r.brandId, actorType: "SYSTEM", actorId: ACTOR, action: "creator_invite.auto", entity: "CreatorAccount", entityId: a.id, after: { inviteId: created.id, contractRequestId: r.id } } });
      return created;
    });
    const link = `${deps.origin}/convite/${token}`; // o token só existe aqui; no banco fica o hash
    let delivered = false;
    if (emailOk) {
      const out = await emailCreatorInvite(prisma, deps.email, { inviteId: invite.id, actorId: ACTOR, link }, now);
      delivered ||= out?.sent === true;
    }
    if (waReady) {
      try {
        await deps.whatsapp!({ instance: r.brand.whatsappInstance!, phone: chat!.replace("https://wa.me/", ""), text: signedInviteText({ name: a.name, brand: r.brand.name, link, until: expiresAt }), notificationId: `invite:${invite.id}`, kind: "INVITE", brand: r.brand.name });
        delivered = true;
      } catch (error) {
        if (!(error instanceof WhatsAppError)) throw error;
      }
    }
    if (delivered) {
      await prisma.contractRequest.update({ where: { id: r.id }, data: { inviteSentAt: now } });
      sent++;
    } else {
      // Nada saiu: o link se perdeu; o convite é cancelado e tenta de novo na próxima rodada.
      await prisma.creatorInvite.update({ where: { id: invite.id }, data: { revokedAt: now } });
    }
  }
  return sent;
}
