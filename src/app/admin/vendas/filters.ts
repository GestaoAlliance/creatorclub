import { SALE_STATUSES } from "@/domain";
import type { SalesFilters } from "@/lib/sales/list";

export type Search = { q?: string; situacao?: string; dona?: string; de?: string; ate?: string; pagina?: string };

/** Filtros da tela de vendas a partir do endereço (os mesmos no CSV). */
export function filtersOf(sp: Search): SalesFilters {
  const status = SALE_STATUSES.find((s) => s === sp.situacao) ?? "";
  const owner = sp.dona === "creator" ? "creator" : sp.dona === "sem" ? "none" : "";
  return { q: (sp.q ?? "").slice(0, 80), status, owner, from: sp.de ?? "", to: sp.ate ?? "" };
}
