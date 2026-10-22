import { SALE_STATUSES } from "@/domain";
import type { SalesFilters } from "@/lib/sales/list";
import { dashPeriod, type DashPeriod } from "@/lib/staff/dashboard";

export type Search = { q?: string; situacao?: string; dona?: string; de?: string; ate?: string; periodo?: string; pagina?: string };

/** Período da tela (o mesmo do gráfico e da lista): 7, 30 ou 90 dias, este mês ou de–até. Padrão: 30 dias. */
export function salesPeriod(sp: Search, timeZone: string, now = new Date()): DashPeriod {
  return dashPeriod({ ...(sp.periodo ? { periodo: sp.periodo } : {}), ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) }, timeZone, now);
}

/** Busca sem período escolhido procura em todas as vendas (achar um pedido antigo pelo número). */
export const searchesAllTime = (sp: Search) => !!(sp.q ?? "").trim() && !sp.periodo && !sp.de && !sp.ate;

/** Filtros da lista a partir do endereço (os mesmos no CSV). */
export function filtersOf(sp: Search, period?: { from: string; to: string }): SalesFilters {
  const status = SALE_STATUSES.find((s) => s === sp.situacao) ?? "";
  const owner = sp.dona === "creator" ? "creator" : sp.dona === "sem" ? "none" : "";
  const dates = period && !searchesAllTime(sp) ? { from: period.from, to: period.to } : { from: sp.de ?? "", to: sp.ate ?? "" };
  return { q: (sp.q ?? "").slice(0, 80), status, owner, ...dates };
}
