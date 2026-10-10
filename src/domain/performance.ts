import type { KitTier } from "./kit";

/**
 * Painel do mês da Gestão (U4, D-PERFORMANCE). Regras puras: faixa do kit e quanto falta para a próxima, variação
 * contra o mês anterior, ordenação do ranking e os meses que dá para escolher.
 */

export type KitProgress = { products: number; nextFromCents: number | null; nextProducts: number | null; missingCents: number | null };

/** Faixa do kit alcançada com as vendas do mês e a próxima faixa (D-KIT: vale a mais alta alcançada). */
export function kitProgress(tiers: readonly KitTier[], salesCents: number): KitProgress {
  const sorted = [...tiers].sort((a, b) => a.fromCents - b.fromCents);
  let products = 0;
  for (const t of sorted) if (salesCents >= t.fromCents && (t.toCents == null || salesCents <= t.toCents)) products = Math.max(products, t.products);
  const next = sorted.find((t) => t.fromCents > salesCents && t.products > products) ?? null;
  return { products, nextFromCents: next?.fromCents ?? null, nextProducts: next?.products ?? null, missingCents: next ? next.fromCents - salesCents : null };
}

/** Variação em pontos-base (10000 = +100%); null quando o mês anterior foi zero. */
export function changeBps(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) * 10_000) / previous);
}

export type PerformanceSort = "vendas" | "minimo" | "nome";

type Sortable = { name: string; salesCents: number; release: { accumulatedCents: number; minCents: number } | null };

/** Ranking: mais vendas; mais perto do mínimo (quem ainda não chegou, do mais perto ao mais longe); ou nome. */
export function sortPerformance<T extends Sortable>(rows: readonly T[], sort: PerformanceSort): T[] {
  const missing = (r: T) => (r.release && r.release.minCents > 0 ? Math.max(0, r.release.minCents - r.release.accumulatedCents) : Infinity);
  return [...rows].sort((a, b) => {
    if (sort === "nome") return a.name.localeCompare(b.name, "pt-BR");
    if (sort === "minimo") {
      const ma = missing(a) || Infinity; // quem já chegou (0) vai para o fim
      const mb = missing(b) || Infinity;
      return ma - mb || b.salesCents - a.salesCents;
    }
    return b.salesCents - a.salesCents || a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Os últimos `n` meses ("AAAA-MM"), do atual para trás. */
export function lastMonths(current: string, n: number): string[] {
  const [y, m] = current.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) - i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}
