/**
 * Perfil opcional da creator (M4.3, D-PROFILEFIELDS): registro profissional (CRN, CRM…), nichos, YouTube, Kwai,
 * alergias e restrições (para montar o kit) e link do mídia kit. Tudo opcional, no cadastro do site e na ficha.
 */

export const NICHES = ["Fitness", "Saúde e bem-estar", "Nutrição", "Beleza e skincare", "Maternidade", "Lifestyle", "Moda", "Outro"] as const;

export const PROFILE_KEYS = ["professionalId", "niches", "youtube", "kwai", "allergies", "mediaKitUrl"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type ProfileFields = {
  professionalId: string | null;
  niches: string[];
  youtube: string | null;
  kwai: string | null;
  allergies: string | null;
  mediaKitUrl: string | null;
};

/** Títulos usados nas respostas da candidatura (a equipe lê igual às outras perguntas). */
export const PROFILE_TITLES: Record<ProfileKey, string> = {
  professionalId: "Registro profissional (CRN, CRM…):",
  niches: "Nicho do seu conteúdo:",
  youtube: "Canal do YouTube:",
  kwai: "@ do seu Kwai:",
  allergies: "Alergias ou restrições:",
  mediaKitUrl: "Link do mídia kit:",
};

const one = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;

/** @ ou canal sem o endereço do site e sem o @ ("https://youtube.com/@maria" → "maria"). */
export function channelHandle(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^.*(youtube\.com|youtu\.be|kwai\.com|kwai\.app)\/(c\/|channel\/|user\/)?@?/i, "").replace(/[/?#].*$/, "").replace(/^@+/, "").replace(/\s+/g, "").slice(0, 60);
}

/**
 * Confere e limpa os campos do perfil. Nichos chegam como lista ou "A|B"; só valem os da lista. Mídia kit vira
 * https (sem esquema, ganha "https://"); outro esquema é recusado. Vazio = sem valor.
 */
export function cleanProfile(input: Partial<Record<ProfileKey, string | readonly string[] | undefined>>): { ok: true; value: ProfileFields } | { ok: false; errors: Partial<Record<ProfileKey, string>> } {
  const errors: Partial<Record<ProfileKey, string>> = {};
  const str = (k: ProfileKey) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const rawNiches = Array.isArray(input.niches) ? input.niches : (str("niches") ?? "").split("|");
  const niches = NICHES.filter((n) => rawNiches.map((x) => x.trim()).includes(n));
  const handle = (k: "youtube" | "kwai") => {
    const v = channelHandle(str(k));
    if (v && !/^[A-Za-z0-9._-]{2,60}$/.test(v)) errors[k] = "Informe o seu @ ou o nome do canal.";
    return v || null;
  };
  const youtube = handle("youtube");
  const kwai = handle("kwai");
  let mediaKitUrl = one(str("mediaKitUrl"), 500)?.replace(/\s/g, "") ?? null;
  if (mediaKitUrl) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(mediaKitUrl)) mediaKitUrl = `https://${mediaKitUrl}`;
    let ok = false;
    try {
      const u = new URL(mediaKitUrl);
      ok = u.protocol === "https:" && u.hostname.includes(".");
    } catch {}
    if (!ok) errors.mediaKitUrl = "Cole o link completo (https://…).";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { professionalId: one(str("professionalId"), 40), niches, youtube, kwai, allergies: one(str("allergies"), 300), mediaKitUrl } };
}

/** Respostas da candidatura com os campos preenchidos (no formato { título: resposta }). */
export function profileAnswers(p: ProfileFields): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.professionalId) out[PROFILE_TITLES.professionalId] = p.professionalId;
  if (p.niches.length) out[PROFILE_TITLES.niches] = p.niches.join(", ");
  if (p.youtube) out[PROFILE_TITLES.youtube] = `@${p.youtube}`;
  if (p.kwai) out[PROFILE_TITLES.kwai] = `@${p.kwai}`;
  if (p.allergies) out[PROFILE_TITLES.allergies] = p.allergies;
  if (p.mediaKitUrl) out[PROFILE_TITLES.mediaKitUrl] = p.mediaKitUrl;
  return out;
}
