import type { PrismaClient } from "@/generated/prisma/client";
import { creatorInviteEmail, staffInviteEmail } from "@/domain";
import { EmailError, type EmailSender } from "@/lib/email/sender";

/**
 * Convite por e-mail (D-EMAIL): logo depois de criar o convite, o sistema manda o link para o e-mail da pessoa. O link
 * continua aparecendo uma vez na tela (WhatsApp). Falha no envio não desfaz o convite: fica na auditoria e a tela avisa.
 */

export type EmailOutcome = { sent: true; to: string } | { sent: false; to: string; reason: string } | null;

export const STAFF_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  GESTAO: "Gestão",
  ENVIO: "Envio",
  PAGAMENTO: "Pagamento",
  HUNTER: "Hunter",
};

async function deliver(
  prisma: PrismaClient,
  sender: EmailSender,
  target: { table: "creatorInvite" | "staffInvite"; entity: string; inviteId: string; brandId: string | null; actorId: string; to: string },
  content: ReturnType<typeof creatorInviteEmail>,
  now: Date,
): Promise<EmailOutcome> {
  try {
    const { id } = await sender({ ...content, to: target.to, idempotencyKey: `invite-${target.inviteId}` });
    await prisma.$transaction([
      target.table === "creatorInvite"
        ? prisma.creatorInvite.update({ where: { id: target.inviteId }, data: { emailedAt: now } })
        : prisma.staffInvite.update({ where: { id: target.inviteId }, data: { emailedAt: now } }),
      prisma.auditLog.create({
        data: { brandId: target.brandId, actorType: "USER", actorId: target.actorId, action: "invite.emailed", entity: target.entity, entityId: target.inviteId, after: { providerId: id } },
      }),
    ]);
    return { sent: true, to: target.to };
  } catch (error) {
    if (!(error instanceof EmailError)) throw error;
    await prisma.auditLog.create({
      data: { brandId: target.brandId, actorType: "USER", actorId: target.actorId, action: "invite.email_failed", entity: target.entity, entityId: target.inviteId, after: { reason: error.message } },
    });
    return { sent: false, to: target.to, reason: error.message };
  }
}

/** Manda o convite da creator por e-mail. Sem remetente configurado devolve null (nada a fazer). */
export async function emailCreatorInvite(prisma: PrismaClient, sender: EmailSender | null, input: { inviteId: string; actorId: string; link: string }, now = new Date()): Promise<EmailOutcome> {
  if (!sender) return null;
  const invite = await prisma.creatorInvite.findUniqueOrThrow({
    where: { id: input.inviteId },
    select: { expiresAt: true, account: { select: { name: true, email: true, creators: { select: { brandId: true, brand: { select: { name: true } } }, orderBy: { brand: { name: "asc" } } } } } },
  });
  const first = invite.account.creators[0];
  const brandName = invite.account.creators.map((c) => c.brand.name).join(" e ") || "Creator Club";
  return deliver(
    prisma,
    sender,
    { table: "creatorInvite", entity: "CreatorInvite", inviteId: input.inviteId, brandId: first?.brandId ?? null, actorId: input.actorId, to: invite.account.email },
    creatorInviteEmail({ name: invite.account.name, brandName, link: input.link, expiresAt: invite.expiresAt }),
    now,
  );
}

/** Manda o convite da equipe por e-mail. Sem remetente configurado devolve null. */
export async function emailStaffInvite(prisma: PrismaClient, sender: EmailSender | null, input: { inviteId: string; actorId: string; link: string }, now = new Date()): Promise<EmailOutcome> {
  if (!sender) return null;
  const invite = await prisma.staffInvite.findUniqueOrThrow({
    where: { id: input.inviteId },
    select: { email: true, name: true, role: true, brandId: true, expiresAt: true, brand: { select: { name: true } } },
  });
  return deliver(
    prisma,
    sender,
    { table: "staffInvite", entity: "StaffInvite", inviteId: input.inviteId, brandId: invite.brandId, actorId: input.actorId, to: invite.email },
    staffInviteEmail({ name: invite.name, roleLabel: STAFF_ROLE_LABEL[invite.role] ?? invite.role, brandName: invite.brand?.name ?? null, link: input.link, expiresAt: invite.expiresAt }),
    now,
  );
}
