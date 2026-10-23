/**
 * Posts das creators (M4.6, D-POSTS). Regras puras:
 * - a creator (ou a equipe) registra o link e o dia do post; a plataforma sai do endereço;
 * - "vendas depois do post": vendas com o cupom dela pagas do dia do post até 2 dias depois (3 dias, São Paulo),
 *   comparadas com a média diária dos 14 dias antes (× 3);
 * - fila de ações: creator ativa sem post registrado há 15 dias (contando desde que os posts começaram a ser
 *   registrados, para não acusar todas no primeiro dia).
 */

import { addDaysKey } from "./time";

export type PostPlatform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "KWAI" | "OUTRO";
export const POST_PLATFORM_LABEL: Record<PostPlatform, string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", KWAI: "Kwai", OUTRO: "Outro" };

export const POST_WINDOW_DAYS = 3;
export const POST_BASELINE_DAYS = 14;
export const NO_POST_DAYS = 15;
/** Dia em que o registro de posts começou (M4.6): antes disso ninguém "deixou de postar". */
export const POSTS_SINCE = "2026-10-24";

/** Confere o link (https, endereço completo) e diz a plataforma. */
export function parsePostUrl(raw: string): { ok: true; url: string; platform: PostPlatform } | { ok: false; error: string } {
  let t = raw.trim().replace(/\s/g, "");
  if (!t) return { ok: false, error: "Cole o link do post." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = `https://${t}`;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, error: "Link inválido. Copie o link do post no app e cole aqui." };
  }
  if (u.protocol !== "https:" || !u.hostname.includes(".") || t.length > 500) return { ok: false, error: "Link inválido. Copie o link do post no app e cole aqui." };
  const h = u.hostname.toLowerCase().replace(/^(www|m|vm|vt)\./, "");
  const platform: PostPlatform =
    h === "instagram.com" || h === "instagr.am" ? "INSTAGRAM"
    : h.endsWith("tiktok.com") ? "TIKTOK"
    : h === "youtube.com" || h === "youtu.be" ? "YOUTUBE"
    : h.endsWith("kwai.com") || h.endsWith("kwai.app") ? "KWAI"
    : "OUTRO";
  return { ok: true, url: u.toString(), platform };
}

/** Dias da janela de vendas do post: [dia do post, dia do post + 3) e a base dos 14 dias antes. */
export function postWindow(postedDay: string) {
  return {
    from: postedDay,
    to: addDaysKey(postedDay, POST_WINDOW_DAYS),
    baseFrom: addDaysKey(postedDay, -POST_BASELINE_DAYS),
  };
}

/** Vendas da janela e quanto ficou acima (ou abaixo) do normal: base = média diária dos 14 dias antes × 3. */
export function postLift(windowCents: number, baselineCents: number): { windowCents: number; normalCents: number; aboveCents: number } {
  const normalCents = Math.round((baselineCents / POST_BASELINE_DAYS) * POST_WINDOW_DAYS);
  return { windowCents, normalCents, aboveCents: windowCents - normalCents };
}

/** Posts a menos de 3 dias um do outro (`others` sem o próprio post): as janelas se sobrepõem (a venda aparece nos dois). */
export function overlapsAnother(postedDay: string, others: readonly string[]): boolean {
  return others.some((d) => d < addDaysKey(postedDay, POST_WINDOW_DAYS) && postedDay < addDaysKey(d, POST_WINDOW_DAYS));
}
