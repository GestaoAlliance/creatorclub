import type { WithdrawalDays } from "./withdrawal-days";

/**
 * Tela de Pagamentos (D-PAYBOARD): regras pequenas e puras da janela de saque, do pedido parado, dos motivos de recusa e
 * do resumo para o WhatsApp da equipe.
 */

/** Janela de pedido do mês (dias no fuso da marca): aberta (e quantos dias faltam, contando hoje) ou quando abre. */
export function withdrawalWindow(today: string, d: WithdrawalDays): { open: boolean; daysLeft: number | null; opensIn: number | null } {
  const [y, m, day] = today.split("-").map(Number) as [number, number, number];
  if (day >= d.start && day <= d.end) return { open: true, daysLeft: d.end - day + 1, opensIn: null };
  const next = day < d.start ? Date.UTC(y, m - 1, d.start) : Date.UTC(y, m, d.start);
  return { open: false, daysLeft: null, opensIn: Math.round((next - Date.UTC(y, m - 1, day)) / 86_400_000) };
}

/** Pedido parado: dias desde que entrou na etapa atual; 3+ dias pede atenção, 7+ é urgente. */
export function waitingTone(days: number): "ok" | "warn" | "late" {
  return days >= 7 ? "late" : days >= 3 ? "warn" : "ok";
}

/** Motivos de recusa agrupados (sem diferença de maiúsculas, espaços e pontuação final), os mais comuns primeiro. */
export function rejectReasons(notes: readonly (string | null)[], top = 5): { reason: string; count: number }[] {
  const by = new Map<string, { reason: string; count: number }>();
  for (const n of notes) {
    const reason = (n ?? "").trim().replace(/\s+/g, " ").replace(/[.!;]+$/, "");
    if (!reason) continue;
    const key = reason.toLocaleLowerCase("pt-BR");
    const cur = by.get(key);
    if (cur) cur.count++;
    else by.set(key, { reason: reason[0]!.toLocaleUpperCase("pt-BR") + reason.slice(1), count: 1 });
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "pt-BR")).slice(0, top);
}

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Resumo para colar no WhatsApp da equipe (D-BRANDCOMMS: só a marca escolhida; formato do WhatsApp, sem tabelas). */
export function payoutWhatsapp(input: {
  brand: string;
  today: string;
  requested: { name: string; cents: number }[];
  approved: { name: string; cents: number }[];
  window: { open: boolean; daysLeft: number | null; opensIn: number | null };
  endDay: number;
}): string {
  const sum = (l: { cents: number }[]) => brl(l.reduce((s, x) => s + x.cents, 0));
  const lines = [`*Saques · ${input.brand}* (${input.today.slice(8, 10)}/${input.today.slice(5, 7)})`, ""];
  const block = (title: string, l: { name: string; cents: number }[]) => {
    if (!l.length) return;
    lines.push(`*${title}:* ${l.length} · ${sum(l)}`);
    for (const x of l) lines.push(`- ${x.name}: ${brl(x.cents)}`);
    lines.push("");
  };
  block("Em análise (falta aprovar)", input.requested);
  block("Aprovados (falta o Pix)", input.approved);
  if (!input.requested.length && !input.approved.length) lines.push("Nenhum saque esperando. ✅", "");
  lines.push(input.window.open ? `Janela de pedido aberta até o dia ${input.endDay}.` : `Janela de pedido fechada; abre em ${input.window.opensIn} ${input.window.opensIn === 1 ? "dia" : "dias"}.`);
  return lines.join("\n");
}

type CheckLine = { coupon: string; name: string; creatorId: string | null; creatorName: string | null; payCents: number | null; system: { commissionCents: number } | null; issues: string[] };

/**
 * Conferência da planilha por creator (D-PAYBOARD): linhas da mesma creator (ou do mesmo cupom sem creator) juntas, com
 * a diferença em R$ (planilha − sistema, só nas linhas em que os dois têm valor). Maior diferença primeiro.
 */
export function groupPaymentCheck<T extends CheckLine>(rows: readonly T[]) {
  const by = new Map<string, { key: string; creatorId: string | null; name: string; coupons: string[]; lines: T[]; diffCents: number; absDiffCents: number; issues: number }>();
  for (const r of rows) {
    const key = r.creatorId ?? `cupom:${r.coupon}`;
    const g = by.get(key) ?? { key, creatorId: r.creatorId, name: r.creatorName ?? r.name, coupons: [], lines: [], diffCents: 0, absDiffCents: 0, issues: 0 };
    if (!g.coupons.includes(r.coupon)) g.coupons.push(r.coupon);
    g.lines.push(r);
    if (r.payCents !== null && r.system) {
      const d = r.payCents - r.system.commissionCents;
      g.diffCents += d;
      g.absDiffCents += Math.abs(d);
    }
    if (r.issues.length) g.issues++;
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.absDiffCents - a.absDiffCents || b.issues - a.issues || a.name.localeCompare(b.name, "pt-BR"));
}
