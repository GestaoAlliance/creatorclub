"use client";

import { Download, FileText, History, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatBRL, shortBRL } from "@/domain";
import { ui } from "@/components/ui/styles";
import type { paidList, PaidRow } from "@/lib/withdrawals/paid";
import { Avatar } from "../../creators/list-parts";

type Data = Awaited<ReturnType<typeof paidList>>;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const reqDay = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
type Kind = "" | "CNPJ" | "CPF";

/** Aba Pagos (D-PAIDLIST): faixa com o total do mês e a lista em dois blocos (CNPJ e CPF). */
export function PaidBoard({ brandName, data }: { brandName: string; data: Data }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("pt-BR");
    return data.rows.filter((r) => (!kind || r.kind === kind) && (!t || r.name.toLocaleLowerCase("pt-BR").includes(t)));
  }, [data.rows, kind, q]);
  const tiles = [
    { k: "" as Kind, label: "Pago no mês", t: data.totals.all, hint: `${data.totals.all.count} ${data.totals.all.count === 1 ? "pagamento" : "pagamentos"}` },
    { k: "CNPJ" as Kind, label: "CNPJ · nota fiscal", t: data.totals.cnpj, hint: `${data.totals.cnpj.count} ${data.totals.cnpj.count === 1 ? "pagamento" : "pagamentos"}` },
    { k: "CPF" as Kind, label: "CPF · recibo", t: data.totals.cpf, hint: `${data.totals.cpf.count} ${data.totals.cpf.count === 1 ? "pagamento" : "pagamentos"}` },
  ];
  return (
    <>
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pagos</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">Tudo o que foi pago no mês (pela data do pagamento): para quem, quando, por quem e com qual Pix.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={data.month} onChange={(e) => router.push(`/admin/saques/pagos?mes=${e.target.value}`)} aria-label="Mês do pagamento" className="rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-semibold text-white outline-none [&>option]:text-stone-900">
                {data.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              </select>
              <a href={`/admin/saques/pagos/planilha?mes=${data.month}`} className="peek-chip"><Download className="size-3.5" />Baixar planilha</a>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-3">
            {tiles.map((t) => (
              <button key={t.label} type="button" aria-pressed={kind === t.k} onClick={() => setKind(kind === t.k ? "" : t.k)} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${kind === t.k && t.k ? "is-on" : ""}`}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className="text-2xl font-semibold tabular-nums leading-tight"><M>{shortBRL(t.t.cents)}</M></span>
                <span className="text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </button>
            ))}
          </div>
          {data.totals.legacy.count > 0 && (
            <p className="flex items-center gap-2 text-xs text-white/80"><History className="size-3.5" />Inclui {data.totals.legacy.count} {data.totals.legacy.count === 1 ? "pagamento feito" : "pagamentos feitos"} antes do Creator Club ({formatBRL(data.totals.legacy.cents)}), já abatidos do saldo.</p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <label className="glass flex min-w-[14rem] flex-1 items-center gap-2 rounded-full px-4 py-2 text-sm md:max-w-sm">
          <Search className="size-4 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar creator" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        {(["", "CNPJ", "CPF"] as Kind[]).map((k) => (
          <button key={k || "todos"} type="button" onClick={() => setKind(k)} className={kind === k ? ui.pillOn : ui.pill}>{k === "" ? "Todos" : k === "CNPJ" ? "CNPJ" : "CPF"}</button>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Nenhum pagamento em {monthName(data.month)}.</section>
      ) : shown.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Nada com esse filtro.</section>
      ) : (
        (["CNPJ", "CPF"] as const).filter((k) => !kind || kind === k).map((k) => {
          const list = shown.filter((r) => r.kind === k);
          if (!list.length) return null;
          return (
            <section key={k} className="glass overflow-hidden rounded-3xl !p-0">
              <header className="flex items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5">
                <h2 className="text-sm font-semibold">{k === "CNPJ" ? "CNPJ · nota fiscal" : "CPF · recibo"} <span className="font-normal text-stone-500">· {list.length}</span></h2>
                <span className="text-sm font-semibold tabular-nums"><M>{formatBRL(list.reduce((s, r) => s + r.amountCents, 0))}</M></span>
              </header>
              <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
                {list.map((r) => <Row key={r.key} r={r} />)}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}

function Row({ r }: { r: PaidRow }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
      <Avatar name={r.name} id={r.creatorId} />
      <div className="min-w-[12rem] flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <a href={`/admin/creators/${r.creatorId}`} className="font-medium hover:underline">{r.name}</a>
          {r.legacy && <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:text-violet-300">antes do Creator Club</span>}
        </p>
        <p className="text-xs text-stone-500">
          Pago em {br(r.paidDay)}
          {r.requestedAt && ` · pedido em ${reqDay(r.requestedAt)}`}
          {r.paidBy && ` · por ${r.paidBy}`}
          {r.document && ` · ${r.document}`}
        </p>
        {r.pixReference && <p className="font-mono text-[11px] text-stone-500">ID do Pix: {r.pixReference}</p>}
        {r.note && <p className="text-xs text-stone-500">{r.note}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {r.withdrawalId && r.hasNf && <a href={`/admin/saques/nf/${r.withdrawalId}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}><FileText className="size-3.5" />Nota</a>}
        {r.withdrawalId && r.kind === "CPF" && <a href={`/admin/saques/recibo/${r.withdrawalId}`} target="_blank" rel="noopener noreferrer" className={ui.ghostSm}><FileText className="size-3.5" />Recibo</a>}
        <span className="w-28 text-right font-semibold tabular-nums"><M>{formatBRL(r.amountCents)}</M></span>
      </div>
    </li>
  );
}
