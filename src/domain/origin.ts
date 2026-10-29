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
};

export const UNKNOWN_ORIGIN: Origin = { kind: "UNKNOWN", hunter: null, day: null, manual: false, note: null };

/** Origem pela candidatura: hunter (link ou código) manda; senão, o formulário. */
export function originFromApplication(app: { source: string; hunter: { id: string; name: string } | null; submittedAt: Date; prospected: boolean }): Origin {
  const day = app.submittedAt.toISOString().slice(0, 10);
  const base = { hunter: app.hunter, day, manual: false, note: null };
  if (app.hunter || app.source === "hunter_form") return { kind: "HUNTER", ...base };
  if (app.source === "captacao_form") return { kind: "CAPTACAO", ...base };
  if (app.source === "site_form") return { kind: "SITE", ...base };
  if (app.prospected) return { kind: "PROSPECCAO", ...base };
  if (app.source === "staff_form") return { kind: "EQUIPE", ...base };
  return { kind: "OUTRO", ...base };
}

/** Chave de agrupamento (origem + hunter) para filtro e resumo. */
export const originKey = (o: Pick<Origin, "kind" | "hunter">) => (o.hunter ? `${o.kind}:${o.hunter.id}` : o.kind);

/** Texto curto: "Hunter · Fulana" / "Cadastro do site". */
export const originText = (o: Pick<Origin, "kind" | "hunter">) => (o.hunter ? `${ORIGIN_LABEL[o.kind]} · ${o.hunter.name}` : ORIGIN_LABEL[o.kind]);
