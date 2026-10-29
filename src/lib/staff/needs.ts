import type { StaffHome } from "./home";

/**
 * "Precisa de você" do Início: só o que esta pessoa resolve (Gestão: creators, kits a aprovar e cupons; Envio: envios;
 * Pagamento: saques e aberturas). Quem só lê (Leitura) vê tudo como "Pendências da equipe", para acompanhar.
 */
export function needsFor(h: StaffHome): { readOnly: boolean; items: { href: string; label: string; n: number }[] } {
  const items: { href: string; label: string; n: number }[] = [];
  const w = h.withdrawals;
  const readOnly = !h.mine?.creators && !h.mine?.shipping && !w?.mine.approve && !w?.mine.pay;
  const creators = readOnly || h.mine?.creators;
  if (h.creators && creators) {
    items.push({ href: "/admin/candidatas", label: "cadastros para aprovar", n: h.creators.applications });
    items.push({ href: "/admin/creators?contrato=1", label: "contratos vencendo ou vencidos", n: h.creators.contractsExpiring + h.creators.contractsExpired });
    items.push({ href: "/admin/creators?semvenda=1", label: "sem vender há 60 dias", n: h.creators.idle });
    items.push({ href: "/admin/creators?pendencia=1", label: "a conferir pela Ana", n: h.creators.toReview });
  }
  if (h.actions) {
    if (h.creators && h.mine?.creators) items.push({ href: "/admin/creators/acoes", label: "ações com creators", n: h.actions.open });
    else items.push({ href: "/admin/envios", label: "envios parados há 3 dias", n: h.actions.shipStuck });
  }
  if (w) {
    if (w.mine.approve || readOnly) items.push({ href: "/admin/saques", label: "saques para aprovar", n: w.toApprove });
    if (w.mine.pay || readOnly) items.push({ href: "/admin/saques?ver=aprovados", label: "saques aprovados para pagar", n: w.toPay });
    if (w.openingsPending !== null) items.push({ href: "/admin/abertura", label: "aberturas a aprovar", n: w.openingsPending });
  }
  if (h.shipments) {
    if (creators) items.push({ href: "/admin/envios?situacao=AWAITING_APPROVAL", label: "kits a aprovar", n: h.shipments.awaiting });
    if (readOnly || h.mine?.shipping) items.push({ href: "/admin/envios?situacao=PREPARING", label: "envios a preparar", n: h.shipments.preparing });
  }
  if (h.coupons) items.push({ href: "/admin/cupons", label: "cupons sem tipo ou dona", n: h.coupons.unclassified + h.coupons.ownerPending });
  return { readOnly, items };
}
