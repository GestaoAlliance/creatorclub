import { SALE_STATUSES } from "@/domain";
import type { SalesFilters } from "@/lib/sales/list";
import { dashPeriod, type DashPeriod } from "@/lib/staff/dashboard";

export type Search = { creator?: string; p?: string; q?: string; situacao?: string; dona?: string; de?: string; ate?: string; periodo?: string; pagina?: string; motivo?: string };

/** Período da tela (o mesmo do gráfico e da lista): o seletor (D-PERIODPICK) ou o guardado; padrão o mês atual. */
export function salesPeriod(sp: Search, timeZone: string, now = new Date(), saved: string | null = null): DashPeriod {
  return dashPeriod({ ...(sp.p ? { p: sp.p } : {}), ...(sp.periodo ? { periodo: sp.periodo } : {}), ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) }, timeZone, now, { saved });
}

/** Busca sem período escolhido procura em todas as vendas (achar um pedido antigo pelo número). */
export const searchesAllTime = (sp: Search) => !!(sp.q ?? "").trim() && !sp.p && !sp.periodo && !sp.de && !sp.ate;

/** Filtros da lista a partir do endereço (os mesmos no CSV). */
export function filtersOf(sp: Search, period?: { from: string; to: string }): SalesFilters {
  const status = SALE_STATUSES.find((s) => s === sp.situacao) ?? "";
  const owner = sp.dona === "creator" ? "creator" : sp.dona === "sem" ? "none" : "";
  const dates = period && !searchesAllTime(sp) ? { from: period.from, to: period.to } : { from: sp.de ?? "", to: sp.ate ?? "" };
  const creatorId = sp.creator && /^[0-9a-f-]{36}$/i.test(sp.creator) ? sp.creator : undefined;
  return { q: (sp.q ?? "").slice(0, 80), status, owner, ...dates, ...(creatorId ? { creatorId } : {}) };
}
