/**
 * Avisos no portal (D-PORTALNOTICES): assunto de cada tipo (ícone e cor), grupos por dia, resumo do mês e onde ela
 * recebe (contato mascarado).
 */

import { addDaysKey } from "./time";
import type { NoticeKind } from "./notices";

export type NoticeTopic = "money" | "ship" | "campaign" | "team" | "account" | "sales";

export const NOTICE_TOPIC: Record<NoticeKind, NoticeTopic> = {
  COMMISSION_RELEASED: "money",
  WITHDRAWAL_PAID: "money",
  WITHDRAWAL_APPROVED: "money",
  WITHDRAWAL_REJECTED: "money",
  WITHDRAWAL_WINDOW: "money",
  WITHDRAWAL_BANK_REJECTED: "money",
  NEAR_MINIMUM: "sales",
  FIRST_SALE: "sales",
  IDLE: "sales",
  KIT_AVAILABLE: "ship",
  SHIPPED: "ship",
  SHIPMENT_DELIVERED: "ship",
  RECEIPT_CHECK: "ship",
  CAMPAIGN_NEW: "campaign",
  TEAM_MESSAGE: "team",
  PARTNERSHIP_ACTIVE: "account",
  CONTRACT_ENDING: "account",
};

export const noticeTopic = (kind: string): NoticeTopic => NOTICE_TOPIC[kind as NoticeKind] ?? "account";

/** Grupo do aviso pelo dia (no fuso da marca): Hoje, Ontem, Esta semana (últimos 7 dias), Este mês (30 dias), Antes. */
export function noticeGroup(day: string, today: string): "Hoje" | "Ontem" | "Esta semana" | "Últimos 30 dias" | "Antes" {
  if (day === today) return "Hoje";
  if (day === addDaysKey(today, -1)) return "Ontem";
  if (day > addDaysKey(today, -7)) return "Esta semana";
  if (day > addDaysKey(today, -30)) return "Últimos 30 dias";
  return "Antes";
}

/** Resumo do mês pelos avisos: "2 comissões liberadas, 1 saque pago e 1 envio entregue" (só o que aconteceu). */
export function noticeMonthSummary(kinds: readonly string[]): string | null {
  const n = (k: string) => kinds.filter((x) => x === k).length;
  const parts: string[] = [];
  const add = (c: number, one: string, many: string) => c && parts.push(`${c} ${c === 1 ? one : many}`);
  add(n("COMMISSION_RELEASED"), "comissão liberada", "comissões liberadas");
  add(n("WITHDRAWAL_PAID"), "saque pago", "saques pagos");
  add(n("SHIPPED"), "envio a caminho", "envios a caminho");
  add(n("SHIPMENT_DELIVERED"), "envio entregue", "envios entregues");
  add(n("CAMPAIGN_NEW"), "campanha nova", "campanhas novas");
  add(n("TEAM_MESSAGE"), "recado da equipe", "recados da equipe");
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/** Celular mascarado: "(11) 9····-1234". */
export function maskPhone(phone: string): string | null {
  const d = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length < 10) return null;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)}····-${d.slice(-4)}`;
}

/** E-mail mascarado: "ju····@gmail.com". */
export function maskEmail(email: string): string | null {
  const [user, host] = email.split("@");
  if (!user || !host) return null;
  return `${user.slice(0, 2)}····@${host}`;
}
