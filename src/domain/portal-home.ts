/**
 * Início do portal (D-PORTALHOME, pedido do responsável em 2026-11-12): regras puras das conquistas, da faixa de
 * posição no mês (sem expor as outras) e da dica do dia.
 */

export type Achievement = { id: "first-sale" | "ten-sales" | "min-reached" | "three-months"; label: string; done: boolean };

/** Meses AAAA-MM seguidos (sem buraco) mais longos na lista. */
export function longestMonthStreak(months: readonly string[]): number {
  const idx = [...new Set(months)].map((m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < idx.length; i++) {
    run = i > 0 && idx[i] === idx[i - 1]! + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** As quatro conquistas: 1ª venda, 10 vendas, 1ª comissão liberada (bateu o mínimo num fechamento) e 3 meses seguidos vendendo. */
export function achievements(input: { paidOrders: number; releases: number; salesMonths: readonly string[] }): Achievement[] {
  return [
    { id: "first-sale", label: "1ª venda", done: input.paidOrders >= 1 },
    { id: "ten-sales", label: "10 vendas", done: input.paidOrders >= 10 },
    { id: "min-reached", label: "1ª comissão liberada", done: input.releases >= 1 },
    { id: "three-months", label: "3 meses seguidos vendendo", done: longestMonthStreak(input.salesMonths) >= 3 },
  ];
}

/**
 * Faixa de posição no mês (só para quem vendeu): entre as 10 que mais venderam; senão entre as 25%; senão na metade de
 * cima. Abaixo da metade (ou sem venda), nada: o Início mostra só a meta, para não desanimar.
 */
export function rankBand(mySales: number, allSales: readonly number[]): string | null {
  if (mySales <= 0) return null;
  const n = allSales.length;
  const pos = allSales.filter((s) => s > mySales).length + 1;
  if (pos <= 10 && n > 10) return "Você está entre as 10 que mais venderam no mês";
  if (pos <= Math.max(1, Math.ceil(n * 0.25))) return n <= 10 ? "Você está entre as que mais venderam no mês" : "Você está entre as 25% que mais venderam no mês";
  if (pos <= Math.ceil(n / 2)) return "Você está na metade de cima das vendas do mês";
  return null;
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const FORMAT = { REELS: "Reels", CAROUSEL: "carrosséis", IMAGE: "fotos", VIDEO: "vídeos" } as const;

/** Dica do dia a partir dos dados dela (formato que mais engaja, dia que mais vende, último post); troca a cada dia. */
export function dailyTip(input: { bestFormat: keyof typeof FORMAT | null; bestWeekday: number | null; daysSincePost: number | null; dayOfYear: number }): string {
  const tips: string[] = [];
  if (input.bestFormat) tips.push(`Seus ${FORMAT[input.bestFormat]} engajam mais que os outros formatos: aposte neles para mostrar o produto.`);
  if (input.bestWeekday !== null) tips.push(`Suas vendas saem mais na ${WEEKDAY[input.bestWeekday]}${input.bestWeekday === 0 || input.bestWeekday === 6 ? "" : "-feira"}: é um bom dia para lembrar do seu cupom.`);
  if (input.daysSincePost !== null && input.daysSincePost >= 7) tips.push(`Seu último post foi há ${input.daysSincePost} dias. Que tal um stories hoje com o seu cupom?`);
  tips.push("Cupom na legenda e no stories, com o link: quem vê consegue comprar na hora.");
  tips.push("Mostre o produto no seu dia a dia: rotina real vende mais que foto pronta.");
  return tips[input.dayOfYear % tips.length]!;
}
