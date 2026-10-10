import { DEFAULT_TIMEZONE, startOfLocalDay } from "./time";

/**
 * Liberação mensal da comissão (D-CONTRACT, contratos de influencer e prescritor).
 *
 * A comissão de um mês fica "a liberar" e é liberada no fechamento (dia 1 do mês seguinte) só quando as vendas
 * elegíveis acumuladas desde a última liberação atingem o mínimo do contrato. Sem atingir, as vendas acumulam para o
 * mês seguinte, até chegar lá. Uma liberação do mês M libera a comissão de todos os meses até M.
 */

export function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Instante em que fecha o mês (início do dia 1 do mês seguinte, no fuso da marca). */
export function monthClosesAt(month: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  return startOfLocalDay(`${nextMonthKey(month)}-01`, timeZone);
}

export type PlannedRelease = { month: string; salesCents: number };

/**
 * Liberações que o fechamento deve gravar, do mês seguinte à última liberação até `lastClosedMonth`.
 * `salesByMonth`: vendas elegíveis da creator por mês do pagamento (D-MONTH).
 */
export function planReleases(input: {
  salesByMonth: ReadonlyMap<string, number>;
  releasedThrough: string | null;
  lastClosedMonth: string;
  minCents: number;
}): PlannedRelease[] {
  const { salesByMonth, releasedThrough, lastClosedMonth, minCents } = input;
  if (!Number.isSafeInteger(minCents) || minCents <= 0) throw new RangeError(`mínimo inválido: ${minCents}`);
  const pending = [...salesByMonth.keys()].filter((m) => releasedThrough === null || m > releasedThrough).sort();
  if (pending.length === 0) return [];
  const out: PlannedRelease[] = [];
  let acc = 0;
  for (let m = pending[0]!; m <= lastClosedMonth; m = nextMonthKey(m)) {
    acc += salesByMonth.get(m) ?? 0;
    if (acc >= minCents) {
      out.push({ month: m, salesCents: acc });
      acc = 0;
    }
  }
  return out;
}

/** Vendas acumuladas ainda não liberadas: depois da última liberação até `throughMonth` (o mês corrente). */
export function accumulatedSales(salesByMonth: ReadonlyMap<string, number>, releasedThrough: string | null, throughMonth: string): number {
  let acc = 0;
  for (const [m, cents] of salesByMonth) if ((releasedThrough === null || m > releasedThrough) && m <= throughMonth) acc += cents;
  return acc;
}

/** Mínimo de vendas do contrato: prescritor tem o próprio; influencer e UGC usam o padrão. */
export function releaseMinFor(
  categories: readonly string[],
  brand: { releaseMinCents: number; releaseMinPrescriberCents: number },
): number {
  return categories.includes("PRESCRITOR") ? brand.releaseMinPrescriberCents : brand.releaseMinCents;
}
