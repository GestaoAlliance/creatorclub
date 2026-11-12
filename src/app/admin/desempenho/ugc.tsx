"use client";

import { ExternalLink, MessageCircle, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ui } from "@/components/ui/styles";
import { shortBRL } from "@/domain";
import type { UgcCard } from "@/lib/performance/board";
import { Avatar } from "../creators/list-parts";
import { MessageSheet, MiniRing, SidePanel } from "./parts";

const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

const CHARGE = {
  title: "Vídeos do ciclo",
  body: "Oi, {nome}! Passando para lembrar dos vídeos do seu ciclo de UGC 🎬\n\nConsegue enviar os próximos esta semana? Se tiver alguma dúvida sobre o roteiro ou o produto, é só me chamar!",
};

function status(c: UgcCard): { text: string; tone: "good" | "bad" | "warn" | "neutral" } {
  if (c.cycle.status === "NO_CONTRACT") return { text: "sem datas do contrato", tone: "warn" };
  if (c.cycle.status === "DONE") return { text: "meta batida", tone: "good" };
  if (c.cycle.status === "MISSED") return { text: "ciclo encerrado sem a meta", tone: "bad" };
  if (c.late) return { text: `atrasada · esperado ${c.expected} até hoje`, tone: "bad" };
  return { text: "no ritmo", tone: "neutral" };
}
const TONE = { good: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300", bad: "bg-red-500/12 text-red-800 dark:text-red-300", warn: "bg-amber-500/15 text-amber-900 dark:text-amber-200", neutral: "bg-stone-500/10 text-stone-600 dark:text-stone-300" };

/** Aba UGC (D-UGCVIDEOS; D-PERFBOARD): anel de vídeos do ciclo, prazo, atrasadas no topo, cobrar em grupo e os vídeos no painel. */
export function UgcView({ cards, canEdit }: { cards: UgcCard[]; canEdit: boolean }) {
  const lateIds = cards.filter((c) => c.late).map((c) => c.id);
  const [picked, setPicked] = useState<Set<string>>(new Set(lateIds));
  const [open, setOpen] = useState<UgcCard | null>(null);
  const [msg, setMsg] = useState(false);
  if (cards.length === 0) return <section className="glass rounded-3xl p-8 text-center text-sm text-stone-500">Nenhuma UGC ativa nesta marca.</section>;
  const sel = cards.filter((c) => picked.has(c.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
        <p className="text-sm text-stone-600 dark:text-stone-300">
          UGC é permuta: o que conta são os vídeos do ciclo (período do contrato). <strong>{lateIds.length}</strong> {lateIds.length === 1 ? "atrasada" : "atrasadas"}, já marcadas.
        </p>
        {canEdit && (
          <button type="button" disabled={!sel.length} onClick={() => setMsg(true)} className={`${ui.btnSm} ml-auto`}>
            <MessageCircle className="size-3.5" />Cobrar {sel.length || ""}
          </button>
        )}
      </section>
      <div className="@container">
        <ul data-tour="de-cartoes" className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {cards.map((c) => {
            const st = status(c);
            return (
              <li key={c.id} className={`liquid-tile relative flex flex-col gap-3 rounded-3xl p-4 ${c.late ? "ring-1 ring-red-400/40" : ""}`}>
                {canEdit && <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Marcar ${c.name}`} className="absolute right-4 top-4 size-4 accent-[var(--brand)]" />}
                <button type="button" onClick={() => setOpen(c)} className="flex items-center gap-3 pr-6 text-left">
                  <MiniRing value={c.cycle.count} total={c.cycle.goal} tone={c.cycle.status === "DONE" ? "good" : c.late ? "bad" : "brand"} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold hover:underline">{c.name}</span>
                    <span className="block text-xs text-stone-500">
                      {c.cycle.start ? `${br(c.cycle.start)} → ${br(c.cycle.end)}` : "ciclo sem datas"}
                      {c.daysLeft !== null && c.cycle.status === "OPEN" && ` · ${c.daysLeft === 0 ? "termina hoje" : `${c.daysLeft} ${c.daysLeft === 1 ? "dia" : "dias"}`}`}
                    </span>
                  </span>
                </button>
                <span className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${TONE[st.tone]}`}>{st.text}</span>
                  <span className="text-stone-500">cupom no mês: <span className="money font-semibold text-stone-700 dark:text-stone-200">{shortBRL(c.salesCents)}</span></span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {open && (
        <SidePanel
          label={`Vídeos de ${open.name}`}
          onClose={() => setOpen(null)}
          header={
            <span className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-white/60"><Avatar name={open.name} id={open.id} size="lg" /></span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">{open.name}</span>
                <span className="block text-xs text-white/80">{open.cycle.count} de {open.cycle.goal} vídeos · {status(open).text}</span>
              </span>
            </span>
          }
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Vídeos do ciclo</p>
          {open.videos.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum vídeo registrado neste ciclo. Registre na ficha (aba UGC).</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {open.videos.map((v, i) => (
                <li key={`${v.url}-${i}`}>
                  <a href={v.url} target="_blank" rel="noreferrer" className="liquid-tile flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm hover:underline">
                    <Video className="size-4 shrink-0 text-stone-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block">{br(v.day)}</span>
                      {v.product && <span className="block truncate text-xs text-stone-500">{v.product}</span>}
                    </span>
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/admin/creators/${open.id}`} className={`${ui.btnSm} self-start`}>Abrir a ficha</Link>
        </SidePanel>
      )}
      {msg && <MessageSheet ids={sel.map((c) => c.id)} names={sel.map((c) => c.name)} {...CHARGE} onClose={() => setMsg(false)} />}
    </div>
  );
}
