/**
 * Campanhas e desafios (M4.5, D-CAMPAIGN). Regras puras:
 * - período em dias de São Paulo; venda conta pela data do **pagamento** (D-MONTH), pela régua da comissão;
 * - ranking de vendas entre as inscritas: empate desempata por quem chegou antes ao total (hora da última venda);
 * - meta individual: quem chega ao valor ganha o prêmio da meta (todas podem ganhar); uma campanha pode ter os dois;
 * - prêmios confirmados pela Gestão a partir de 7 dias depois do fim; depois disso não mudam.
 */

export const CAMPAIGN_SETTLE_DAYS = 7;
export const CAMPAIGN_TOP = 10;

export type CampaignRow = { creatorId: string; name: string; salesCents: number; reachedAt: Date | null };
export type Standing = CampaignRow & { position: number; rankPrizeCents: number; goalPrizeCents: number };

/** Ordena as inscritas e diz quanto cada uma leva. Sem venda (0) não ganha prêmio de posição. */
export function campaignStandings(rows: readonly CampaignRow[], rankingPrizes: readonly number[], goal: { cents: number; prizeCents: number } | null): Standing[] {
  const sorted = [...rows].sort(
    (a, b) => b.salesCents - a.salesCents || (a.reachedAt?.getTime() ?? Infinity) - (b.reachedAt?.getTime() ?? Infinity) || a.name.localeCompare(b.name, "pt-BR"),
  );
  return sorted.map((r, i) => ({
    ...r,
    position: i + 1,
    rankPrizeCents: r.salesCents > 0 ? (rankingPrizes[i] ?? 0) : 0,
    goalPrizeCents: goal && r.salesCents >= goal.cents ? goal.prizeCents : 0,
  }));
}

export type CampaignPhase = "DRAFT" | "SOON" | "RUNNING" | "WAITING" | "SETTLE" | "SETTLED";

export const CAMPAIGN_PHASE_LABEL: Record<CampaignPhase, string> = {
  DRAFT: "rascunho",
  SOON: "em breve",
  RUNNING: "em andamento",
  WAITING: "encerrada · aguardando 7 dias",
  SETTLE: "pronta para confirmar",
  SETTLED: "prêmios confirmados",
};

export function campaignPhase(c: { publishedAt: Date | null; settledAt: Date | null; startsAt: Date; endsAt: Date }, now: Date): CampaignPhase {
  if (c.settledAt) return "SETTLED";
  if (!c.publishedAt) return "DRAFT";
  if (now < c.startsAt) return "SOON";
  if (now < c.endsAt) return "RUNNING";
  return now.getTime() >= settleFrom(c.endsAt).getTime() ? "SETTLE" : "WAITING";
}

/** A partir de quando a Gestão pode confirmar as ganhadoras. */
export const settleFrom = (endsAt: Date) => new Date(endsAt.getTime() + CAMPAIGN_SETTLE_DAYS * 86_400_000);

/** Público: sem tipos e sem tags = todas; com tipos, precisa ter um deles; com tags, precisa ter uma delas. */
export function inCampaignAudience(c: { categories: readonly string[]; tagIds: readonly string[] }, creator: { categories: readonly string[]; tagIds: readonly string[] }): boolean {
  const byType = c.categories.length === 0 || c.categories.some((k) => creator.categories.includes(k));
  const byTag = c.tagIds.length === 0 || c.tagIds.some((t) => creator.tagIds.includes(t));
  return byType && byTag;
}

/** "R$ 500,00" a partir de texto ("500", "1.200,50"); null se vazio; erro se inválido. */
export function parseMoneyCents(raw: string): number | null {
  const t = raw.trim().replace(/^R\$\s*/, "");
  if (!t) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) throw new Error("valor");
  return Math.round(Number(t.replace(/\./g, "").replace(",", ".")) * 100);
}

/** Primeiro nome (o placar do portal mostra só ele, D-CAMPAIGN). */
export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * Contagem regressiva do portal (D-PORTALCAMPAIGN): "começa em 3 dias", "começa amanhã", "termina em 2 dias e 5 h",
 * "termina em 5 h", "termina em menos de 1 h"; null depois do fim.
 */
export function campaignCountdown(now: Date, startsAt: Date, endsAt: Date): string | null {
  const H = 3_600_000;
  if (now < startsAt) {
    const h = Math.ceil((startsAt.getTime() - now.getTime()) / H);
    if (h <= 24) return h <= 1 ? "começa em menos de 1 h" : `começa em ${h} h`;
    const d = Math.max(1, Math.round(h / 24));
    return d === 1 ? "começa amanhã" : `começa em ${d} dias`;
  }
  if (now >= endsAt) return null;
  const h = Math.floor((endsAt.getTime() - now.getTime()) / H);
  if (h < 1) return "termina em menos de 1 h";
  const d = Math.floor(h / 24);
  const rest = h % 24;
  if (!d) return `termina em ${h} h`;
  return `termina em ${d} ${d === 1 ? "dia" : "dias"}${rest ? ` e ${rest} h` : ""}`;
}

/** Briefing do portal: cada link vira o nome do site no texto (o link vai para os botões, sem repetir). */
export function briefingParts(text: string): { text: string; links: { url: string; label: string }[] } {
  const links: { url: string; label: string }[] = [];
  const clean = text.replace(/https?:\/\/[^\s)]+/g, (raw) => {
    const url = raw.replace(/[.,;:!?]+$/, "");
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    if (!links.some((l) => l.url === url)) links.push({ url, label });
    return label + raw.slice(url.length);
  });
  return { text: clean.trim(), links };
}

/** Subiu (positivo) ou caiu (negativo) no placar desde ontem; null sem comparação. */
export const placeMove = (before: number | null, now: number): number | null => (before === null ? null : before - now);

/** Texto dos prêmios para o aviso de campanha nova: "Prêmios: 1º R$ 500,00, 2º R$ 300,00. Meta: R$ 3.000,00 = R$ 100,00." */
export function campaignPrizeText(rankingPrizes: readonly number[], goalCents: number | null, goalPrizeCents: number | null, fmt: (c: number) => string): string {
  const parts: string[] = [];
  if (rankingPrizes.length) parts.push(`Prêmios: ${rankingPrizes.map((p, i) => `${i + 1}º ${fmt(p)}`).join(", ")}.`);
  if (goalCents && goalPrizeCents) parts.push(`Vendeu ${fmt(goalCents)}? Ganha ${fmt(goalPrizeCents)}.`);
  return parts.join(" ");
}
