import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, formatBRL, maskEmail, maskPhone, monthKey, noticeMonthSummary, whatsappChatUrl } from "@/domain";
import { portalCampaigns } from "@/lib/campaigns/campaigns";
import { configuredSender } from "@/lib/email/sender";
import { myNotifications } from "@/lib/notifications/notify";
import { configuredWhatsApp } from "@/lib/notifications/whatsapp";
import type { PortalContext } from "./context";
import { portalWithdrawalTab } from "./withdrawals";

/**
 * Avisos do portal (D-PORTALNOTICES, escolhas do responsável em 2026-11-12): o que pede ação dela agora (calculado na
 * hora, não pelos avisos), recados da equipe fixados até "Entendi", a lista (últimos 30 dias à vista; os antigos
 * recolhidos), o resumo do mês e onde ela recebe os avisos (WhatsApp ou e-mail, mascarado).
 */

export type NoticeAction = { id: string; label: string; href: string };

export async function portalNoticesBoard(prisma: PrismaClient, ctx: PortalContext, now = new Date()) {
  const base = `/portal/${ctx.brand.slug}`;
  const [brand, list, kits, shipped, campaigns, me] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id }, select: { timezone: true, whatsappInstance: true } }),
    myNotifications(prisma, ctx),
    prisma.kitGrant.count({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "PENDING" } }),
    prisma.shipment.count({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, status: "SHIPPED" } }),
    portalCampaigns(prisma, ctx, now),
    prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { account: { select: { phone: true, email: true } } } }),
  ]);
  const wd = ctx.ugcOnly ? null : await portalWithdrawalTab(prisma, ctx, { now });

  // O que pede ação agora.
  const actions: NoticeAction[] = [];
  if (kits) actions.push({ id: "kit", label: "Escolher os produtos do seu kit", href: `${base}/envios` });
  if (wd) {
    const last = wd.withdrawals[0];
    if (last?.status === "REJECTED" && !wd.blocks.includes("OUTSIDE_WINDOW") && wd.balance.availableCents > 0) actions.push({ id: "rejected", label: "Saque recusado: confira o motivo e peça de novo", href: `${base}/saque` });
    else if (wd.blocks.filter((b) => b !== "VIEW_ONLY").length === 0) actions.push({ id: "window", label: `Janela de saque aberta: ${formatBRL(wd.balance.availableCents)} para pedir`, href: `${base}/saque` });
  }
  if (shipped) actions.push({ id: "received", label: shipped === 1 ? "Seu envio está a caminho: toque em Recebi quando chegar" : `${shipped} envios a caminho: toque em Recebi quando chegarem`, href: `${base}/envios` });
  for (const c of campaigns.filter((x) => x.canJoin && (x.phase === "RUNNING" || x.phase === "SOON")).slice(0, 2)) actions.push({ id: `camp:${c.id}`, label: `Participar da campanha ${c.name}`, href: `${base}/campanhas` });

  // Onde ela recebe: WhatsApp (marca com WhatsApp ligado e celular do Brasil) ou e-mail (com o envio ligado).
  const phone = me.account.phone && whatsappChatUrl(me.account.phone) ? maskPhone(me.account.phone) : null;
  const channel =
    brand.whatsappInstance && configuredWhatsApp() && phone ? { kind: "WHATSAPP" as const, to: phone }
    : configuredSender() && me.account.email ? { kind: "EMAIL" as const, to: maskEmail(me.account.email) }
    : null;

  const month = monthKey(now, brand.timezone);
  return {
    today: dayKey(now, brand.timezone),
    timeZone: brand.timezone,
    actions,
    pinned: list.filter((n) => n.kind === "TEAM_MESSAGE" && !n.readAt),
    list: list.filter((n) => !(n.kind === "TEAM_MESSAGE" && !n.readAt)),
    newCount: list.filter((n) => !n.readAt).length,
    summary: noticeMonthSummary(list.filter((n) => monthKey(n.createdAt, brand.timezone) === month).map((n) => n.kind)),
    channel,
  };
}
