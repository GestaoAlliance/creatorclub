/**
 * De onde a creator veio (D-ORIGIN): pela candidatura aprovada (formulário Hunter, Captação, cadastro do site,
 * cadastrada pela equipe ou prospecção) ou, para quem não tem candidatura (importadas), a origem que a Gestão marca
 * na ficha.
 */

export const ORIGIN_KINDS = ["HUNTER", "CAPTACAO", "SITE", "EQUIPE", "INDICACAO", "PROSPECCAO", "OUTRO"] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

/** O que a Gestão pode marcar à mão (cadastrada pela equipe só vem da candidatura). */
export const MANUAL_ORIGIN_KINDS: readonly OriginKind[] = ["HUNTER", "CAPTACAO", "SITE", "INDICACAO", "PROSPECCAO", "OUTRO"];

export const ORIGIN_LABEL: Record<OriginKind | "UNKNOWN", string> = {
  HUNTER: "Hunter",
  CAPTACAO: "Formulário de captação",
  SITE: "Cadastro do site",
  EQUIPE: "Cadastrada pela equipe",
  INDICACAO: "Indicação de creator",
  PROSPECCAO: "Prospecção",
  OUTRO: "Outro",
  UNKNOWN: "Não informada",
};

export type Origin = {
  kind: OriginKind | "UNKNOWN";
  hunter: { id: string; name: string } | null;
  /** Dia da inscrição (AAAA-MM-DD), quando veio de candidatura. */
  day: string | null;
  /** Marcada à mão na ficha (sem candidatura). */
  manual: boolean;
  note: string | null;
  /** Etiqueta de campanha do link do cadastro (`?origem=`), quando houver. */
  campaign?: string | null;
  /** Resposta de "Como conheceu a marca?" no cadastro do site. */
  heardFrom?: string | null;
};

export const UNKNOWN_ORIGIN: Origin = { kind: "UNKNOWN", hunter: null, day: null, manual: false, note: null };

/** Origem pela candidatura: hunter (link ou código) manda; senão, o formulário. */
export function originFromApplication(app: { source: string; hunter: { id: string; name: string } | null; submittedAt: Date; prospected: boolean; campaign?: string | null; heardFrom?: string | null }): Origin {
  const day = app.submittedAt.toISOString().slice(0, 10);
  const base = { hunter: app.hunter, day, manual: false, note: null, campaign: app.campaign ?? null, heardFrom: app.heardFrom ?? null };
  if (app.hunter || app.source === "hunter_form") return { kind: "HUNTER", ...base };
  if (app.source === "captacao_form") return { kind: "CAPTACAO", ...base };
  if (app.source === "site_form") return { kind: "SITE", ...base };
  if (app.prospected) return { kind: "PROSPECCAO", ...base };
  if (app.source === "staff_form") return { kind: "EQUIPE", ...base };
  return { kind: "OUTRO", ...base };
}

/** Chave de agrupamento (origem + hunter) para filtro e resumo. */
export const originKey = (o: Pick<Origin, "kind" | "hunter" | "campaign">) => (o.hunter ? `${o.kind}:${o.hunter.id}` : o.campaign ? `${o.kind}:c:${o.campaign}` : o.kind);

/** Texto curto: "Hunter · Fulana" / "Cadastro do site". */
export const originText = (o: Pick<Origin, "kind" | "hunter" | "campaign">) =>
  `${o.hunter ? `${ORIGIN_LABEL[o.kind]} · ${o.hunter.name}` : ORIGIN_LABEL[o.kind]}${o.campaign ? ` · campanha ${o.campaign}` : ""}`;

/** Etiqueta de campanha do link (`?origem=stories-outubro`): minúsculas, letras, números, - e _, até 40. */
export function normalizeCampaignTag(raw: string | null | undefined): string | null {
  const t = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  return t || null;
}

/** "Como conheceu a marca?" no cadastro do site (opcional). */
export const HEARD_FROM_OPTIONS = ["Instagram da marca", "TikTok", "Indicação de uma creator", "Indicação de amiga/conhecida", "Anúncio", "Google", "Outro"] as const;

/** Resposta guardada: a opção, ou "Outro: texto". Fora da lista ou vazia: null. */
export function heardFromValue(choice: string | null | undefined, other: string | null | undefined): string | null {
  const c = (choice ?? "").trim();
  if (!(HEARD_FROM_OPTIONS as readonly string[]).includes(c)) return null;
  if (c !== "Outro") return c;
  const o = (other ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return o ? `Outro: ${o}` : "Outro";
}
