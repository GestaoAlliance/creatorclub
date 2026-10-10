import { ArrowDownRight, ArrowUpRight, Gift, Trophy, Video } from "lucide-react";
import Link from "next/link";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import type { monthPerformance } from "@/lib/creators/performance";

type Data = Awaited<ReturnType<typeof monthPerformance>>;
type Row = Data["partners"][number];
export type Search = { mes?: string; ordem?: string; tipo?: string; aba?: string; semvenda?: string };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;
const brl = (c: number) => formatBRL(c).replace(/,00$/, "");
const KIND: Record<string, string> = { INFLUENCER: "Influencer", PRESCRITOR: "Prescritor", UGC: "UGC" };

function Change({ bps }: { bps: number | null }) {
  if (bps === null) return <span className="text-xs text-stone-500">sem venda no mês anterior</span>;
  const up = bps >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-400"}`}>
      <Icon className="size-3.5" />
      {up ? "+" : ""}
      {(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}% vs mês anterior
    </span>
  );
}

function MinBar({ r }: { r: NonNullable<Row["release"]> }) {
  const pct = r.minCents > 0 ? Math.min(100, Math.round((r.accumulatedCents / r.minCents) * 100)) : 100;
  const done = r.accumulatedCents >= r.minCents;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-300/60 dark:bg-white/10">
        <div className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-brand dark:bg-brand-2"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-stone-600 dark:text-stone-400">
        {done ? `mínimo atingido (${brl(r.accumulatedCents)} de ${brl(r.minCents)})` : `${brl(r.accumulatedCents)} de ${brl(r.minCents)} · faltam ${brl(r.minCents - r.accumulatedCents)}`}
      </span>
    </div>
  );
}

function KitText({ k }: { k: NonNullable<Row["kit"]> }) {
  const n = (p: number) => `${p} ${p === 1 ? "suplemento" : "suplementos"}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-600 dark:text-stone-400">
      <Gift className="size-3.5" />
      {k.products > 0 ? `kit de ${n(k.products)}` : "sem kit no mês"}
      {k.missingCents !== null && k.nextProducts !== null && ` · faltam ${brl(k.missingCents)} para ${n(k.nextProducts)}`}
    </span>
  );
}

/** Desempenho do mês (U4): resumo, ranking de influencers e prescritores, e UGC à parte. Só exibe. */
export function DesempenhoView({ data, sp }: { data: Data; sp: Search }) {
  const { summary: s } = data;
  const ugcTab = sp.aba === "ugc";
  const partners = data.partners.filter((r) => (!sp.tipo || (r.categories as string[]).includes(sp.tipo)) && (sp.semvenda !== "1" || r.orders === 0));
  const isCurrent = data.month === data.current;
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ mes: sp.mes, ordem: sp.ordem, tipo: sp.tipo, semvenda: sp.semvenda, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/admin/desempenho${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <PageHeader title="Desempenho">
        Vendas pelo cupom no mês (pela data do pagamento), quanto falta para o mínimo do contrato e a faixa do kit de cada
        creator ativa. Toque no nome para abrir a ficha.
      </PageHeader>

      <form className="glass flex flex-wrap items-center gap-2 rounded-3xl p-4" role="search">
        {ugcTab && <input type="hidden" name="aba" value="ugc" />}
        <select name="mes" defaultValue={data.month} aria-label="Mês" className={ui.inputSm}>
          {data.months.map((m) => <option key={m} value={m}>{monthName(m)}{m === data.current ? " (atual)" : ""}</option>)}
        </select>
        {!ugcTab && (
          <>
            <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className={ui.inputSm}>
              <option value="">Influencers e prescritores</option>
              <option value="INFLUENCER">Só influencers</option>
              <option value="PRESCRITOR">Só prescritores</option>
            </select>
            <select name="ordem" defaultValue={sp.ordem} aria-label="Ordem" className={ui.inputSm}>
              <option value="vendas">Mais vendas</option>
              <option value="minimo">Mais perto do mínimo</option>
              <option value="nome">Nome</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="semvenda" value="1" defaultChecked={sp.semvenda === "1"} className="size-4 accent-[var(--brand)]" /> só quem não vendeu no mês
            </label>
          </>
        )}
        <button className={ui.btnSm}>Ver</button>
      </form>

      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label={`Vendas de ${monthName(data.month)}`} value={brl(s.salesCents)} hint={<Change bps={s.changeBps} />} />
          <Kpi label="Pedidos" value={s.orders} />
          <Kpi label="Venderam no mês" value={`${s.sellers} de ${s.active}`} hint="influencers e prescritores" />
          <Kpi label="Mínimo atingido hoje" value={s.reachedMin} hint={s.idle ? `${s.idle} sem vender há 60 dias ou mais` : "ninguém parado há 60 dias"} tone={s.idle ? "amber" : undefined} />
        </div>
      </Card>

      <nav aria-label="Grupo" className="flex flex-wrap gap-2">
        <Link href={q({ aba: undefined })} className={ugcTab ? ui.pill : ui.pillOn}>Influencers e prescritores <span className="opacity-80">{data.partners.length}</span></Link>
        <Link href={q({ aba: "ugc", tipo: undefined, semvenda: undefined, ordem: undefined })} className={ugcTab ? ui.pillOn : ui.pill}>UGC <span className="opacity-80">{data.ugc.length}</span></Link>
      </nav>

      {!ugcTab ? (
        <Card title={`Ranking de ${monthName(data.month)}`} icon={<Trophy className="size-4" />}>
          {!isCurrent && <p className={ui.hint}>O mínimo mostra o acumulado de hoje; vendas, pedidos e kit são do mês escolhido.</p>}
          {partners.length === 0 ? (
            <p className={ui.muted}>Ninguém com esses filtros.</p>
          ) : (
            <ol className={ui.list}>
              {partners.map((r, i) => (
                <li key={r.id} className="grid gap-3 py-4 md:grid-cols-[2.5rem_1fr_11rem_15rem] md:items-center">
                  <span className={`text-lg font-semibold tabular-nums ${sp.ordem === "vendas" && i < 3 && r.salesCents > 0 ? "text-brand dark:text-brand-2" : "text-stone-400"}`}>{i + 1}º</span>
                  <span className="min-w-0">
                    <Link href={`/admin/creators/${r.id}`} className="block truncate font-medium hover:underline">{r.name}</Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.categories.map((c) => <span key={c} className={badge.neutral}>{KIND[c] ?? c}</span>)}
                      {r.idle && <span className={badge.amber}>{r.idle.neverSold ? `nunca vendeu · ${r.idle.days} dias` : `sem vender há ${r.idle.days} dias`}</span>}
                      {r.kit && <KitText k={r.kit} />}
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold tabular-nums">{brl(r.salesCents)}</span>
                    <span className="text-xs text-stone-500">{r.orders} {r.orders === 1 ? "pedido" : "pedidos"}</span>
                    <Change bps={r.changeBps} />
                  </span>
                  {r.release ? <MinBar r={r.release} /> : <span className="text-xs text-stone-500">sem mínimo</span>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : (
        <Card title="UGC (permuta)" icon={<Video className="size-4" />}>
          <p className={ui.hint}>Sem comissão: o que conta são os vídeos do ciclo. As vendas do cupom aparecem para acompanhar.</p>
          {data.ugc.length === 0 ? (
            <p className={ui.muted}>Nenhuma UGC ativa.</p>
          ) : (
            <ul className={ui.list}>
              {data.ugc.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <Link href={`/admin/creators/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    {r.cycle?.status === "NO_CONTRACT" ? (
                      <span className={badge.amber}>sem datas do contrato</span>
                    ) : r.cycle ? (
                      <span className={r.cycle.status === "DONE" ? badge.green : r.cycle.status === "MISSED" ? badge.red : badge.neutral}>
                        vídeos {r.cycle.count}/{r.cycle.goal}{r.cycle.status === "MISSED" ? " · meta não batida" : ""}
                      </span>
                    ) : null}
                    <span className="tabular-nums text-stone-600 dark:text-stone-400">{brl(r.salesCents)} · {r.orders} {r.orders === 1 ? "pedido" : "pedidos"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
