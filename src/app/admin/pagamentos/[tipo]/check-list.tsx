"use client";

import { AlertTriangle, CheckCircle2, ClipboardCopy, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatBRL, monthNamePt } from "@/domain";
import { ui } from "@/components/ui/styles";
import type { payCheckBoard, CheckRow } from "@/lib/payouts/check";
import type { PayKind } from "@/lib/payouts/month-board";
import { Avatar } from "../../creators/list-parts";
import { MessageSheet } from "../../desempenho/parts";
import { payCheckAction } from "./actions";

type Data = Awaited<ReturnType<typeof payCheckBoard>>;
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;
const pct = (bps: number | null) => (bps === null ? "sem taxa" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const when = (d: Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** A mensagem da Vanessa para quem foi conferida e ainda não pediu (WhatsApp). */
function releaseMessage(kind: PayKind, month: string, cents: number) {
  const doc = kind === "CNPJ" ? "a nota fiscal, que tem que ser *exatamente*" : "o recibo, que tem que ser *exatamente*";
  return `Oi, {nome}! Tudo bem? 💛\n\nConferimos seu Creator Club e está tudo certo! Agora o pagamento é feito por lá: entre com seu login e senha e peça o saque da sua comissão de *${monthNamePt(month)}*.\n\nNo saque você envia ${doc} de *${formatBRL(cents)}* (a sua comissão de ${monthNamePt(month)}), para o financeiro aprovar.\n\nQualquer dúvida, me chama!`;
}

/** D-PAYCHECK: etapa "0. Conferir" de Pagamentos (vendas do mês × % = valor no Creator Club). */
export function CheckList({ data, kind, brandName, canCheck, canMessage }: { data: Data; kind: PayKind; brandName: string; canCheck: boolean; canMessage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; name: string; body: string } | null>(null);
  const [res, setRes] = useState<{ id: string; ok?: string; error?: string } | null>(null);
  // Trava o clique duplo antes de a tela atualizar (o estado só muda no próximo desenho).
  const sending = useRef(false);

  const act = async (r: CheckRow, status: "CHECKED" | "REVIEW") => {
    if (sending.current) return;
    sending.current = true;
    setBusy(r.creatorId);
    const out = await payCheckAction(r.creatorId, status, brandName);
    sending.current = false;
    setBusy(null);
    if (out.error) return setRes({ id: r.creatorId, error: out.error });
    if (out.text) {
      try {
        await navigator.clipboard.writeText(out.text);
      } catch {}
      setRes({ id: r.creatorId, ok: out.ok! });
    } else if (out.amountCents !== undefined && !out.requested && canMessage) {
      setMsg({ id: r.creatorId, name: r.name, body: releaseMessage(kind, out.month!, out.amountCents) });
      setRes({ id: r.creatorId, ok: "Conferido. Mande a mensagem para ela pedir o saque." });
    } else {
      setRes({ id: r.creatorId, ok: out.requested ? "Conferido: o saque dela já pode ser aprovado em NF para aprovar." : "Conferido." });
    }
    router.refresh();
  };

  return (
    <section className="@container glass overflow-hidden rounded-3xl !p-0">
      <header className="flex flex-col gap-1 border-b border-stone-200/70 px-4 py-3 dark:border-white/10 md:px-5">
        <h2 className="text-sm font-semibold">
          Conferir · comissão de {monthNamePt(data.month)} <span className="font-normal text-stone-500">· {data.rows.length} com valor a receber · <M>{formatBRL(data.counts.cents)}</M></span>
        </h2>
        <p className="text-xs text-stone-500">
          Vendas de {monthNamePt(data.month)} × % de comissão tem de dar o valor no Creator Club (diferença de até R$ 1,00 por causa dos arredondamentos). Bateu: <strong>Conferido</strong> e mande a mensagem para ela pedir o saque. Não bateu: <strong>Mandar para o Pedro</strong>. Saque só é aprovado depois de conferido.
        </p>
      </header>
      {data.rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-stone-500">Ninguém com valor a receber agora.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
          {data.rows.map((r) => {
            const done = r.check?.status === "CHECKED" && !r.check.stale;
            const review = r.check?.status === "REVIEW" && !r.check.stale;
            const diff = r.expectedCents === null ? null : r.systemCents - r.expectedCents;
            return (
              <li key={r.creatorId} className={`flex flex-col gap-2 px-4 py-3 md:px-5 ${done ? "opacity-70" : ""}`}>
                <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 @3xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_minmax(0,1.4fr)]">
                  <Link href={`/admin/creators/${r.creatorId}`} className="col-span-2 flex min-w-0 items-center gap-2.5 hover:underline @3xl:col-span-1">
                    <Avatar name={r.name} id={r.creatorId} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block text-[11px] text-stone-500">
                        {r.withdrawal ? (r.withdrawal.status === "REQUESTED" ? "saque pedido" : "saque aprovado") : "ainda não pediu"}
                        {!r.hasPix && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-900 dark:text-amber-200" title="Ela informa a chave na aba Saque do portal (o pedido não sai sem ela)">sem chave Pix</span>}
                      </span>
                    </span>
                  </Link>
                  <Num label={`Vendas ${monthNamePt(r.month).slice(0, 3)}`} v={<M>{formatBRL(r.salesCents)}</M>} />
                  <Num label="Comissão" v={pct(r.rateBps)} />
                  <Num label="Esperado" v={r.expectedCents === null ? "—" : <M>{formatBRL(r.expectedCents)}</M>} />
                  <Num label="No Creator Club" v={<strong><M>{formatBRL(r.systemCents)}</M></strong>} />
                  <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 @3xl:col-span-1">
                    {done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-3.5" />Conferido{r.check?.by ? ` · ${r.check.by.split(" ")[0]}` : ""} {when(r.check!.at)}</span>
                    ) : review ? (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200">Em análise desde {when(r.check!.at)}</span>
                    ) : r.matches ? (
                      <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">Bate</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2.5 py-1 text-xs font-semibold text-red-800 dark:text-red-300"><AlertTriangle className="size-3.5" />Não bate{diff !== null ? <>: {diff > 0 ? "+" : "−"} <M>{formatBRL(Math.abs(diff))}</M></> : ""}</span>
                    )}
                    {r.check?.stale && <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">valor mudou desde a conferência</span>}
                    {canCheck && !done && (
                      <>
                        <button type="button" disabled={busy !== null} onClick={() => act(r, "CHECKED")} className={r.matches ? ui.btnSm : ui.ghostSm}>Conferido</button>
                        {!r.matches && !review && <button type="button" disabled={busy !== null} onClick={() => act(r, "REVIEW")} className={ui.btnSm}><ClipboardCopy className="size-3.5" />Mandar para o Pedro</button>}
                      </>
                    )}
                  </div>
                </div>
                {!r.matches && r.reasons.length > 0 && (
                  <ul className="ml-11 flex flex-col gap-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                    {r.reasons.map((x) => <li key={x.label}><Search className="mr-1 inline size-3" />{x.cents < 0 ? "−" : "+"} <M>{formatBRL(Math.abs(x.cents))}</M> {x.label}</li>)}
                  </ul>
                )}
                {res?.id === r.creatorId && (res.ok || res.error) && <p role="status" className={`ml-11 text-xs ${res.error ? "text-red-700" : "text-emerald-700 dark:text-emerald-300"}`}>{res.error ?? res.ok}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {msg && <MessageSheet ids={[msg.id]} names={[msg.name]} title="Seu saque está liberado" body={msg.body} onClose={() => setMsg(null)} />}
    </section>
  );
}

function Num({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col @3xl:items-end">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</span>
      <span className="tabular-nums">{v}</span>
    </span>
  );
}
