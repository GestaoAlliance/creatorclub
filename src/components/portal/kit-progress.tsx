import { Target } from "lucide-react";
import { formatBRL, kitNoun, TIER_REGULAR, TIER_TRIAL } from "@/domain";
import type { KitProgress } from "@/lib/shipments/kits";
import { monthLabel } from "@/lib/shipments/kits";

const brl = (c: number) => formatBRL(c);
const date = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

/** D-KITPROGRESS: "Seu próximo produto" na aba Pedidos: quanto vender e até quando para liberar o próximo. */
export function KitProgressCard({ progress, brandSlug }: { progress: KitProgress; brandSlug: string }) {
  const p = progress;
  const bar = (value: number, goal: number) => (
    <div className="h-2 overflow-hidden rounded-full bg-stone-300/60 dark:bg-white/10">
      <div className="h-full rounded-full bg-brand dark:bg-brand-2" style={{ width: `${Math.min(100, Math.round((value / Math.max(goal, 1)) * 100))}%` }} />
    </div>
  );
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Target className="size-4" /> Seu próximo produto</h2>
      {p.kind === "TIER" ? (
        <>
          <p className="text-sm">
            Vendas com o seu cupom em {monthLabel(p.month)}: <strong>{brl(p.salesCents)}</strong>.{" "}
            {p.next
              ? <>Faltam <strong>{brl(p.next.fromCents - p.salesCents)}</strong> para liberar {p.next.total - p.total > 1 ? `mais ${p.next.total - p.total} ${kitNoun(brandSlug, 2)}` : `mais 1 ${kitNoun(brandSlug, 1)}`} este mês.</>
              : <>Você chegou à faixa mais alta do mês.</>}
          </p>
          {p.next && bar(p.salesCents, p.next.fromCents)}
          <ul className="grid gap-1 text-xs text-stone-600 sm:grid-cols-2 dark:text-stone-400">
            {(p.trial ? TIER_TRIAL : []).map((t) => <li key={`t${t.fromCents}`}>{brl(t.fromCents)} no mês: {t.products} {kitNoun(brandSlug, t.products)} (seus 3 primeiros meses)</li>)}
            {TIER_REGULAR.map((t) => <li key={t.fromCents}>{brl(t.fromCents)} no mês: {t.products} {kitNoun(brandSlug, t.products)}</li>)}
          </ul>
        </>
      ) : p.granted ? (
        <p className="text-sm">Você já liberou o produto desta fase (até {date(p.to)}). A próxima fase começa no dia seguinte.</p>
      ) : (
        <>
          <p className="text-sm">
            Venda <strong>{brl(p.goalCents)}</strong> com o seu cupom de {date(p.from)} até {date(p.to)} e ganhe 1 {kitNoun(brandSlug, 1)}. Já foram{" "}
            <strong>{brl(p.salesCents)}</strong>: faltam <strong>{brl(Math.max(0, p.goalCents - p.salesCents))}</strong>.
          </p>
          {bar(p.salesCents, p.goalCents)}
        </>
      )}
    </section>
  );
}
