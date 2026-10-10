/**
 * Organização das candidatas (F2): leitura do número de seguidores, busca, filtros, ordem e repetidas. Tudo puro; a
 * tela só exibe. Sem critério automático de aprovação (D-SIGNUP): a equipe decide uma por uma.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "12 mil", "12k", "1.500", "1,5 mil", "15000 seguidores", "Média de 300" → número (ou null se não der). */
export function parseFollowers(text: string | null | undefined): number | null {
  const t = fold(text ?? "");
  const m = t.match(/(\d+(?:[.,]\d+)*)\s*(milh|mil|k|mi\b|m\b)?/);
  if (!m) return null;
  let raw = m[1]!;
  const unit = m[2];
  // "1.500" e "15.000" são milhar; "1,5" e "1.5" com unidade são decimal.
  if (unit) raw = raw.replace(",", ".");
  else raw = raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const mult = unit === "mil" || unit === "k" ? 1_000 : unit ? 1_000_000 : 1;
  return Math.round(n * mult);
}

export const normalizeInstagram = (v: string | null | undefined) =>
  fold(v ?? "").replace(/^.*instagram\.com\//, "").replace(/[/?#].*$/, "").replace(/^@+/, "").replace(/\s+/g, "");
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export type DupSource = { id: string; kind: "candidata" | "creator"; name: string; status?: string; email: string | null; cpf: string | null; instagram: string | null };
export type Duplicate = { id: string; kind: "candidata" | "creator"; name: string; status?: string; by: ("e-mail" | "CPF" | "@")[] };

/** Outras candidatas ou creators com o mesmo e-mail, CPF ou @ (ignorando a própria candidata). */
export function findDuplicates(me: { id: string; email: string | null; cpf: string | null; instagram: string | null }, pool: readonly DupSource[]): Duplicate[] {
  const email = fold(me.email ?? "");
  const cpf = digits(me.cpf);
  const ig = normalizeInstagram(me.instagram);
  const out: Duplicate[] = [];
  for (const o of pool) {
    if (o.kind === "candidata" && o.id === me.id) continue;
    const by: Duplicate["by"] = [];
    if (email && fold(o.email ?? "") === email) by.push("e-mail");
    if (cpf.length === 11 && digits(o.cpf) === cpf) by.push("CPF");
    if (ig.length >= 3 && normalizeInstagram(o.instagram) === ig) by.push("@");
    if (by.length) out.push({ id: o.id, kind: o.kind, name: o.name, ...(o.status ? { status: o.status } : {}), by });
  }
  return out;
}

export type ApplicationSort = "antigas" | "novas" | "seguidores";
export type ApplicationFilters = { q?: string; kind?: string; source?: string; hunter?: string; vermefree?: boolean; sort?: ApplicationSort };

type Filterable = {
  fullName: string; email: string | null; instagram: string | null; categoryProposal: string; source: string;
  hunter: { code: string } | null; alsoVermeFree: boolean; submittedAt: Date; followersCount: number | null;
};

/** Aplica busca e filtros e ordena (padrão: mais antigas primeiro, quem espera há mais tempo). */
export function filterApplications<T extends Filterable>(rows: readonly T[], f: ApplicationFilters): T[] {
  const q = fold(f.q ?? "");
  const qIg = normalizeInstagram(f.q);
  const out = rows.filter((r) => {
    if (q && !(fold(r.fullName).includes(q) || fold(r.email ?? "").includes(q) || (qIg && normalizeInstagram(r.instagram).includes(qIg)))) return false;
    if (f.kind && r.categoryProposal !== f.kind) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.hunter === "nenhum" ? r.hunter !== null : f.hunter && r.hunter?.code !== f.hunter) return false;
    if (f.vermefree && !r.alsoVermeFree) return false;
    return true;
  });
  const sort = f.sort ?? "antigas";
  return out.sort((a, b) =>
    sort === "seguidores"
      ? (b.followersCount ?? -1) - (a.followersCount ?? -1)
      : sort === "novas"
        ? b.submittedAt.getTime() - a.submittedAt.getTime()
        : a.submittedAt.getTime() - b.submittedAt.getTime(),
  );
}
