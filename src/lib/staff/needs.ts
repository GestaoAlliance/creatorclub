import { ACTION_LABEL, type ActionKind } from "@/domain";
import { URGENT_DAYS, type StaffHome } from "./home";

/**
 * "Precisa de você" do Início (D-NEEDSAREA, respostas do responsável em 2026-11-11): cada pessoa vê só o que resolve,
 * separado por área (Gestão, Pagamento, Envios; o super admin vê as três). Em cada área, o urgente vem primeiro
 * (prazo passou: candidata há mais de 3 dias, kit esperando aprovação há mais de 2, envio aprovado e parado há mais
 * de 3, contrato vencido, janela de saque ou prazo de pagamento acabando). As ações com creators aparecem por tipo.
 * Quem só lê (Leitura) vê tudo como "Pendências da equipe", para acompanhar.
 */
export type NeedItem = { href: string; label: string; n: number; urgent: boolean; note?: string | undefined };
export type NeedArea = { area: "Gestão" | "Pagamento" | "Envios"; items: NeedItem[] };

/** Ações da fila (D-ACTIONS) que entram por tipo; envio parado e contrato já aparecem como itens próprios. */
const ACTION_KINDS: ActionKind[] = ["UNSIGNED", "ACCESS", "KIT_PENDING", "NEAR_MIN", "IDLE", "NO_POST", "BIRTHDAY"];

export function needsFor(h: StaffHome): { readOnly: boolean; areas: NeedArea[]; items: NeedItem[] } {
  const w = h.withdrawals;
  const readOnly = !h.mine?.creators && !h.mine?.shipping && !w?.mine.approve && !w?.mine.pay;
  const creators = readOnly || !!h.mine?.creators;
  const shipping = readOnly || !!h.mine?.shipping;
  const gestao: NeedItem[] = [];
  const pagamento: NeedItem[] = [];
  const envios: NeedItem[] = [];

  if (h.creators && creators) {
    const old = h.creators.applicationsOld ?? 0;
    gestao.push({ href: "/admin/candidatas", label: "cadastros para aprovar", n: h.creators.applications, urgent: old > 0, note: old > 0 ? `${old} há mais de ${URGENT_DAYS.application} dias` : undefined });
    gestao.push({ href: "/admin/creators?contrato=1", label: "contratos vencidos", n: h.creators.contractsExpired, urgent: true });
    gestao.push({ href: "/admin/creators?contrato=1", label: "contratos vencendo em 30 dias", n: h.creators.contractsExpiring, urgent: false });
  }
  if (h.shipments && creators) {
    const old = h.shipments.awaitingOld ?? 0;
    gestao.push({ href: "/admin/envios?situacao=AWAITING_APPROVAL", label: "kits a aprovar", n: h.shipments.awaiting, urgent: old > 0, note: old > 0 ? `${old} há mais de ${URGENT_DAYS.kitApproval} dias` : undefined });
  }
  if (h.actions && creators) {
    for (const kind of ACTION_KINDS) {
      const n = h.actions.byKind?.[kind] ?? 0;
      gestao.push({ href: `/admin/creators/acoes?tipo=${kind}`, label: ACTION_LABEL[kind].toLowerCase(), n, urgent: false });
    }
  }
  if (h.coupons && creators) gestao.push({ href: "/admin/cupons", label: "cupons sem tipo ou dona", n: h.coupons.unclassified + h.coupons.ownerPending, urgent: false });

  if (w) {
    if (w.mine.approve || readOnly)
      pagamento.push({ href: "/admin/saques", label: "saques para aprovar", n: w.toApprove, urgent: !!w.approveClosing, note: w.approveClosing ? "a janela de pedidos está fechando" : undefined });
    if (w.mine.pay || readOnly)
      pagamento.push({ href: "/admin/saques?ver=aprovados", label: "saques aprovados para pagar", n: w.toPay, urgent: !!w.payClosing, note: w.payClosing ? "o prazo de pagamento está chegando" : undefined });
    if (w.openingsPending !== null) pagamento.push({ href: "/admin/abertura", label: "aberturas a aprovar", n: w.openingsPending, urgent: false });
  }

  if (h.shipments && shipping) {
    const stuck = h.shipments.preparingOld ?? h.actions?.shipStuck ?? 0;
    envios.push({ href: "/admin/envios?situacao=PREPARING", label: "envios a preparar", n: h.shipments.preparing, urgent: stuck > 0, note: stuck > 0 ? `${stuck} parados há mais de ${URGENT_DAYS.shipping} dias` : undefined });
  }

  const order = (items: NeedItem[]) => items.filter((i) => i.n > 0).sort((a, b) => Number(b.urgent) - Number(a.urgent));
  const areas = (
    [
      { area: "Gestão", items: order(gestao) },
      { area: "Pagamento", items: order(pagamento) },
      { area: "Envios", items: order(envios) },
    ] satisfies NeedArea[]
  ).filter((a) => a.items.length > 0);
  return { readOnly, areas, items: areas.flatMap((a) => a.items) };
}
