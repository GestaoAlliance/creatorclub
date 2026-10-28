import { parseCnpjLookup, type CnpjInfo } from "@/domain";

/** Resultado da consulta: os dados, "notfound" (a Receita não conhece) ou "unavailable" (fora do ar). */
export type CnpjLookupResult = CnpjInfo | "notfound" | "unavailable";
export type CnpjLookup = (cnpj: string) => Promise<CnpjLookupResult>;

/** D-PJADDR: dados públicos do CNPJ pela BrasilAPI (gratuita, sem chave). Só no servidor. */
export function brasilApiLookup(fetchImpl: typeof fetch = fetch): CnpjLookup {
  return async (cnpj) => {
    const d = cnpj.replace(/\D/g, "");
    if (d.length !== 14) return "notfound";
    try {
      const res = await fetchImpl(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
      if (res.status === 404 || res.status === 400) return "notfound";
      if (!res.ok) return "unavailable";
      return parseCnpjLookup(await res.json()) ?? "unavailable";
    } catch {
      return "unavailable";
    }
  };
}

export const lookupCnpj: CnpjLookup = brasilApiLookup();
