/**
 * Planilha "Pagamentos influencers" (D-SHEETREADONLY, S3): só conferência. Cada aba é um período de vendas; cada linha
 * traz cupom, valor em vendas, % e total a pagar. O sistema compara com o que ele mesmo calculou e mostra as diferenças.
 */

const MONTHS = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Período de uma aba: "VENDAS AGOSTO/26" → agosto de 2026; "... DO DIA 23/06 AO DIA 31/07" → 23/06 a 31/07. */
export function paymentPeriod(tab: string, now = new Date()): { from: string; to: string } | null {
  const t = plain(tab);
  const range = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\D+?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (range) {
    const toMonth = Number(range[5]);
    const fromMonth = Number(range[2]);
    const year = (y: string | undefined, fallback: number) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : fallback);
    // Sem ano: o mais recente que não passa de hoje.
    let toYear = year(range[6], now.getUTCFullYear());
    if (!range[6] && Date.UTC(toYear, toMonth - 1, Number(range[4])) > now.getTime()) toYear -= 1;
    const fromYear = year(range[3], fromMonth > toMonth ? toYear - 1 : toYear);
    return { from: `${fromYear}-${pad(fromMonth)}-${pad(Number(range[1]))}`, to: `${toYear}-${pad(toMonth)}-${pad(Number(range[4]))}` };
  }
  const m = MONTHS.findIndex((name) => t.includes(name));
  if (m < 0) return null;
  const y = t.match(/\/(\d{2,4})\b/)?.[1];
  let year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : now.getUTCFullYear();
  if (!y && Date.UTC(year, m, 1) > now.getTime()) year -= 1;
  return { from: `${year}-${pad(m + 1)}-01`, to: `${year}-${pad(m + 1)}-${pad(lastDay(year, m + 1))}` };
}

/** "R$ 3.520,58", "3.520,58", "3520.58" → centavos; vazio ou texto → nulo. */
export function moneyToCents(v: unknown): number | null {
  const t = String(v ?? "").replace(/R\$|\s/g, "");
  if (!/\d/.test(t)) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "15,00%" → 1500 pontos-base. */
export function percentToBpsText(v: unknown): number | null {
  const t = String(v ?? "").replace(/[%\s]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Diferença que vale olhar: mais de R$ 1,00. */
export const PAYMENT_TOLERANCE_CENTS = 100;
