/**
 * Resumo semanal da gestão (M3.4, D-WEEKLY): texto do WhatsApp com a semana anterior (segunda a domingo) comparada com
 * a semana de antes. Regra pura (testada); quem monta os números é `src/lib/notifications/weekly.ts`.
 */

export type WeeklyData = {
  brand: string;
  from: string; // AAAA-MM-DD
  to: string;
  sales: { cents: number; change: number | null; orders: number; storeShare: number };
  commissionCents: number;
  top: { name: string; cents: number }[];
  profit: { cents: number; revenueCents: number } | null;
  pending: { applications: number; toApprove: number; toPay: number; actions: number };
  alerts: { idle: number; contracts: number; nearMin: number; kits: number; igDrops?: number };
  link: string | null;
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const changeText = (c: number | null) => (c === null ? "sem base na semana anterior" : `${c > 0 ? "+" : ""}${c.toLocaleString("pt-BR")}% vs semana anterior`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function weeklySummaryText(d: WeeklyData): string {
  const lines: string[] = [];
  lines.push(`*Resumo semanal · ${d.brand}*\n${dm(d.from)} a ${dm(d.to)}`);
  lines.push(
    [
      `💰 *Vendas com cupom:* ${brl(d.sales.cents)} (${changeText(d.sales.change)})`,
      `${plural(d.sales.orders, "pedido", "pedidos")} · ${pct(d.sales.storeShare)} da loja · comissão ${brl(d.commissionCents)}`,
      ...(d.profit ? [`Lucro do programa: ${brl(d.profit.cents)}${d.profit.revenueCents ? ` (${pct(d.profit.cents / d.profit.revenueCents)} da receita)` : ""}`] : []),
    ].join("\n"),
  );
  if (d.top.length) lines.push(["🏆 *Quem mais vendeu*", ...d.top.map((t, i) => `${i + 1}. ${t.name} · ${brl(t.cents)}`)].join("\n"));
  const p = d.pending;
  const pend = [
    p.applications && `${plural(p.applications, "candidata esperando", "candidatas esperando")}`,
    p.toApprove && `${plural(p.toApprove, "saque para aprovar", "saques para aprovar")}`,
    p.toPay && `${plural(p.toPay, "saque aprovado para pagar", "saques aprovados para pagar")}`,
    p.actions && `${plural(p.actions, "ação na fila", "ações na fila")}`,
  ].filter(Boolean) as string[];
  lines.push(pend.length ? ["📌 *Pendências*", ...pend.map((x) => `• ${x}`)].join("\n") : "📌 *Pendências:* nada pendente 🎉");
  const a = d.alerts;
  const alerts = [
    a.idle && `${plural(a.idle, "creator parada", "creators paradas")} há 60 dias ou mais`,
    a.nearMin && `${plural(a.nearMin, "creator perto", "creators perto")} do mínimo do mês (vale um empurrão)`,
    a.contracts && `${plural(a.contracts, "contrato vencendo", "contratos vencendo")} ou vencido${a.contracts === 1 ? "" : "s"}`,
    a.kits && `${plural(a.kits, "kit parado", "kits parados")}`,
    a.igDrops && `${plural(a.igDrops, "creator com", "creators com")} engajamento no Instagram 40% menor em 30 dias`,
  ].filter(Boolean) as string[];
  if (alerts.length) lines.push(["🚨 *Alertas*", ...alerts.map((x) => `• ${x}`)].join("\n"));
  if (d.link) lines.push(`Painel: ${d.link}`);
  return lines.join("\n\n");
}
