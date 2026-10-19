/**
 * Cadastros a revisar (limpeza pedida pelo responsável em 2026-10-19): sinais de que o nome da creator está errado ou
 * de que a mesma pessoa foi cadastrada duas vezes. Só aponta; quem corrige é a equipe, na ficha.
 */

export type NameProblem = "dados-no-nome" | "parece-cupom";

/** Nome com telefone, link, @ ou número longo (linha de planilha colada no nome) ou com cara de código de cupom. */
export function nameProblems(name: string): NameProblem[] {
  const t = name.trim();
  const out: NameProblem[] = [];
  if (/https?:\/\/|www\.|\.com\b|@|\d{4,}|\(\d{2}\)/i.test(t)) out.push("dados-no-nome");
  else if (/^[A-Z0-9]{3,20}$/.test(t)) out.push("parece-cupom");
  return out;
}

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Nome para comparar repetidas: sem acento, minúsculo, sem "de/da/do" e com espaços simples. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !PARTICLES.has(w))
    .join(" ");
}

export const DATA_REVIEW_LABEL: Record<NameProblem | "repetida" | "planilha", string> = {
  "dados-no-nome": "dados no nome",
  "parece-cupom": "nome de cupom",
  repetida: "possível repetida",
  planilha: "criada pela planilha",
};
