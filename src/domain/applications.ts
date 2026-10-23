/**
 * Organização das candidatas (F2): leitura do número de seguidores, busca, filtros, ordem e repetidas. Tudo puro; a
 * tela só exibe. Sem critério automático de aprovação (D-SIGNUP): a equipe decide uma por uma; a prioridade (M2.3)
 * só ordena a fila.
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

export type ApplicationSort = "prioridade" | "antigas" | "novas" | "seguidores";

/**
 * Prioridade da candidata (M2.3, D-PRIORITY): sinais a favor somam pontos; repetida (mesmo e-mail, CPF ou @) vai para o
 * fim. Alta = 6 pontos ou mais; Média = 3 a 5; Baixa = até 2. Só ordena: quem decide é a Ana.
 */
export type PriorityLevel = "ALTA" | "MEDIA" | "BAIXA" | "REPETIDA";
export type Priority = { level: PriorityLevel; score: number; reasons: string[] };

export type PriorityInput = {
  hunter: unknown;
  instagram: string | null;
  tiktok: string | null;
  followersCount: number | null;
  storiesViews: string | null;
  complete: boolean;
  niche: string | null;
  categoryProposal: string;
  collabInterest: string | null;
  duplicate: boolean;
};

/** Nicho que combina com a marca: Revita Derma vende dermocosméticos; Botanika e VermeFree, suplementos naturais. */
const NICHE_WORDS = {
  beauty: ["beleza", "skin", "pele", "estetic", "dermato", "maquiag", "make", "autocuidado", "cosmet", "cabelo"],
  health: ["saude", "bem-estar", "bem estar", "fitness", "academia", "treino", "nutri", "natural", "matern", "mae", "emagrec", "vida saudavel", "esporte"],
} as const;

export function nicheMatches(niche: string | null, brandSlug: string): boolean {
  const n = fold(niche ?? "");
  if (!n) return false;
  const words = brandSlug.startsWith("revita") ? NICHE_WORDS.beauty : NICHE_WORDS.health;
  return words.some((w) => n.includes(w));
}

export function applicationPriority(a: PriorityInput, brandSlug: string): Priority {
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, why: string) => {
    score += pts;
    reasons.push(why);
  };
  if (a.hunter) add(3, "veio de hunter");
  if (a.categoryProposal === "PRESCRITOR") add(2, "prescritora");
  const f = a.followersCount ?? 0;
  if (f >= 100_000) add(3, "100 mil+ seguidores");
  else if (f >= 50_000) add(2, "50 mil+ seguidores");
  else if (f >= 10_000) add(1, "10 mil+ seguidores");
  const views = parseFollowers(a.storiesViews) ?? 0;
  if (views >= 5_000) add(2, "5 mil+ views nos stories");
  else if (views >= 1_000) add(1, "1 mil+ views nos stories");
  if (a.instagram?.trim() || a.tiktok?.trim()) add(1, "tem @");
  if (a.complete) add(1, "cadastro completo");
  if (nicheMatches(a.niche, brandSlug)) add(1, "nicho combina com a marca");
  if (/^s(im)?\b/.test(fold(a.collabInterest ?? ""))) add(1, "topa collab");
  if (a.duplicate) return { level: "REPETIDA", score, reasons: ["cadastro repetido", ...reasons] };
  return { level: score >= 6 ? "ALTA" : score >= 3 ? "MEDIA" : "BAIXA", score, reasons };
}

export const PRIORITY_LABEL: Record<PriorityLevel, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa", REPETIDA: "Repetida" };
export type ApplicationFilters = { q?: string; kind?: string; source?: string; hunter?: string; brand?: string; sort?: ApplicationSort };

type Filterable = {
  fullName: string; email: string | null; instagram: string | null; categoryProposal: string; source: string;
  hunter: { code: string } | null; brands: readonly string[]; submittedAt: Date; followersCount: number | null;
  priority?: Priority;
};

/** Aplica busca e filtros e ordena (padrão: prioridade, M2.3; empate: quem espera há mais tempo; repetidas no fim). */
export function filterApplications<T extends Filterable>(rows: readonly T[], f: ApplicationFilters): T[] {
  const q = fold(f.q ?? "");
  const qIg = normalizeInstagram(f.q);
  const out = rows.filter((r) => {
    if (q && !(fold(r.fullName).includes(q) || fold(r.email ?? "").includes(q) || (qIg && normalizeInstagram(r.instagram).includes(qIg)))) return false;
    if (f.kind && r.categoryProposal !== f.kind) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.hunter === "nenhum" ? r.hunter !== null : f.hunter && r.hunter?.code !== f.hunter) return false;
    if (f.brand && !r.brands.includes(f.brand)) return false;
    return true;
  });
  const sort = f.sort ?? "prioridade";
  const rank = (r: T) => (r.priority ? (r.priority.level === "REPETIDA" ? -1 : r.priority.score) : 0);
  return out.sort((a, b) =>
    sort === "prioridade"
      ? rank(b) - rank(a) || a.submittedAt.getTime() - b.submittedAt.getTime()
      : sort === "seguidores"
      ? (b.followersCount ?? -1) - (a.followersCount ?? -1)
      : sort === "novas"
        ? b.submittedAt.getTime() - a.submittedAt.getTime()
        : a.submittedAt.getTime() - b.submittedAt.getTime(),
  );
}
