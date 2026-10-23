/**
 * Aniversário e tags das creators (M4.2, D-TAGS). Regras puras: a data de nascimento é só o dia ("AAAA-MM-DD"), sem
 * hora; "hoje" é o dia em São Paulo, calculado por quem chama.
 */

/** A aniversariante entra na fila de ações 3 dias antes e fica até o dia (pedido do responsável em 2026-10-23). */
export const BIRTHDAY_WARN_DAYS = 3;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

/**
 * Lê a data de nascimento ("AAAA-MM-DD" do campo de data ou "DD/MM/AAAA" digitado). Vazio = sem data. Recusa data
 * que não existe, antes de 1900 ou depois de hoje.
 */
export function parseBirthDate(raw: string | null | undefined, today: string): { ok: true; day: string | null } | { ok: false; error: string } {
  const v = (raw ?? "").trim();
  if (!v) return { ok: true, day: null };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : br ? [Number(br[3]), Number(br[2]), Number(br[1])] : [0, 0, 0];
  if (!y || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return { ok: false, error: "Data de nascimento inválida." };
  const day = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (y < 1900 || day > today) return { ok: false, error: "Data de nascimento inválida." };
  return { ok: true, day };
}

/** Próximo aniversário a partir de hoje (o próprio dia conta): o dia e quantos dias faltam. 29/02 vira 28/02 fora do bissexto. */
export function nextBirthday(birth: string, today: string): { day: string; days: number } {
  const m = Number(birth.slice(5, 7));
  const d = Number(birth.slice(8, 10));
  const at = (y: number) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, daysIn(y, m))).padStart(2, "0")}`;
  const year = Number(today.slice(0, 4));
  const day = at(year) >= today ? at(year) : at(year + 1);
  return { day, days: Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) };
}

/** "15/03" para mostrar; com o ano, "15/03/1995". */
export const birthdayLabel = (birth: string, withYear = false) => `${birth.slice(8, 10)}/${birth.slice(5, 7)}${withYear ? `/${birth.slice(0, 4)}` : ""}`;

/** Nome da tag limpo (espaços, até 30) e a chave que não repete na marca (minúsculas, sem acento). */
export function tagName(raw: string): { name: string; key: string } | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 30);
  if (!name) return null;
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return { name, key };
}
