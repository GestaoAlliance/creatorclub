"use client";

import { Check, KeyRound, MessageCircle, Package, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WhatsAppIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";
import { ACTION_LABEL, ACTION_TITLE, TEAM_MESSAGE_MAX, type ActionKind } from "@/domain";
import type { ActionTask } from "@/lib/actions/queue";
import { Avatar } from "../list-parts";
import { sendAction, type SendState } from "./actions";
import { DoneButton } from "./done";

const TONE_BAR = { urgent: "#ef4444", warn: "#f59e0b", info: "#a8a29e" } as const;
const TONE_DOT = { urgent: "seg-bad", warn: "seg-warn", info: "seg-info" } as const;
const OWNER = { GESTAO: "Gestão", ENVIO: "Envio" } as const;
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const chatOf = (url: string | null) => (url ? url.split("?")[0]! : null);

/** Anel do progresso do dia. */
function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-20 -rotate-90" role="img" aria-label={`${pct}% das tarefas de hoje`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
    </svg>
  );
}

/** Prévia editável da mensagem: abre no WhatsApp de quem usa ou sai pelo WhatsApp da marca. */
function Composer({ t, canSend, whatsappOn, onClose }: { t: ActionTask; canSend: boolean; whatsappOn: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(ACTION_TITLE[t.kind]);
  const [text, setText] = useState(t.message ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SendState | null>(null);
  const [opened, setOpened] = useState(false);
  const chat = chatOf(t.whatsappUrl);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white/60 p-3 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)] dark:bg-white/5" onClick={(e) => e.stopPropagation()}>
      {canSend && <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TEAM_MESSAGE_MAX.title} aria-label="Título (portal e WhatsApp da marca)" className={ui.inputSm} />}
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={TEAM_MESSAGE_MAX.body} rows={4} aria-label="Mensagem" className={`${ui.input} resize-y text-sm`} />
      <p className="text-[11px] text-stone-500">O texto ajustado vale só para esta mensagem.{t.hasPhone ? "" : " Sem celular válido no cadastro: pelo WhatsApp da marca vai só para o portal."}</p>
      <div className="flex flex-wrap items-center gap-2">
        {chat && (
          <a href={`${chat}?text=${encodeURIComponent(text)}`} {...ext} onClick={() => setOpened(true)} className={`${ui.btnSm} !bg-emerald-600`}>
            <WhatsAppIcon className="size-3.5" /> Abrir no meu WhatsApp
          </a>
        )}
        {canSend && (
          <button
            type="button"
            disabled={busy || !text.trim() || !title.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await sendAction([{ key: t.key, title, text }]);
              setBusy(false);
              setRes(r);
              if (r.ok) router.refresh();
            }}
            className={ui.btnSm}
          >
            <Send className="size-3.5" /> {busy ? "Mandando…" : whatsappOn ? "Mandar pelo WhatsApp da marca" : "Mandar pelo portal e e-mail"}
          </button>
        )}
        <button type="button" onClick={onClose} className={ui.ghostSm}>Fechar</button>
      </div>
      {opened && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
          Mandou? <DoneButton taskKey={t.key} />
        </div>
      )}
      {res && <p role={res.error ? "alert" : "status"} className={`text-sm ${res.error ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}>{res.error ?? res.ok}</p>}
    </div>
  );
}

/** Mandar para todas as tarefas do tipo escolhido, cada uma com a mensagem dela (sem editar). */
function BulkSend({ tasks, kind, whatsappOn }: { tasks: ActionTask[]; kind: ActionKind; whatsappOn: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SendState | null>(null);
  const sample = tasks[0]!;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-brand/20 bg-brand/5 p-3 text-sm dark:border-brand-2/30">
      {!confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">
            <strong>{tasks.length}</strong> de &quot;{ACTION_LABEL[kind]}&quot; podem receber a mensagem pelo {whatsappOn ? "WhatsApp da marca" : "portal e e-mail"} agora.
          </span>
          <button type="button" onClick={() => setConfirm(true)} className={ui.btnSm}><Send className="size-3.5" /> Mandar para as {tasks.length}</button>
        </div>
      ) : (
        <>
          <p className="font-semibold">Cada uma recebe a mensagem com os dados dela. Exemplo ({sample.name.split(/\s+/)[0]}):</p>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-white/5">
            <p className="font-semibold">{ACTION_TITLE[kind]}</p>
            <p className="whitespace-pre-wrap">{sample.message}</p>
          </div>
          <p className="text-[11px] text-stone-500">As tarefas viram &quot;feitas&quot;. Para ajustar o texto de alguma, mande uma a uma.{whatsappOn ? " O WhatsApp sai aos poucos, das 9h às 20h." : ""}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await sendAction(tasks.map((t) => ({ key: t.key, title: ACTION_TITLE[t.kind], text: t.message! })));
                setBusy(false);
                setRes(r);
                if (r.ok) {
                  setConfirm(false);
                  router.refresh();
                }
              }}
              className={ui.btnSm}
            >
              {busy ? "Mandando…" : `Confirmar envio para ${tasks.length}`}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className={ui.ghostSm}>Cancelar</button>
          </div>
        </>
      )}
      {res && <p role={res.error ? "alert" : "status"} className={res.error ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}>{res.error ?? res.ok}</p>}
    </div>
  );
}

/**
 * Ações (D-ACTIONSBOARD, pedido do responsável em 2026-11-11): fila por urgência com o progresso do dia, quadros por tipo
 * que filtram, mensagem com prévia editável (WhatsApp de quem usa ou da marca) e envio para todas de um tipo.
 */
export function ActionsBoard({ tasks, doneToday, brandName, canSend, whatsappOn }: { tasks: ActionTask[]; doneToday: number; brandName: string; canSend: boolean; whatsappOn: boolean }) {
  const [kind, setKind] = useState<ActionKind | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const kinds = [...new Set(tasks.map((t) => t.kind))].sort((a, b) => Math.min(...tasks.filter((t) => t.kind === a).map((t) => t.rank)) - Math.min(...tasks.filter((t) => t.kind === b).map((t) => t.rank)));
  const shown = kind ? tasks.filter((t) => t.kind === kind) : tasks;
  const total = tasks.length + doneToday;
  const pct = total ? Math.round((doneToday / total) * 100) : 100;
  const urgent = tasks.filter((t) => t.tone === "urgent").length;
  const sendable = kind && canSend ? shown.filter((t) => t.message && t.owner === "GESTAO") : [];

  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Ações</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">
                {tasks.length === 0 ? "Nada pendente agora. 🎉" : <>{tasks.length} na fila{urgent > 0 && <> · <strong className="text-white">{urgent} urgente{urgent === 1 ? "" : "s"}</strong></>}. Quando o motivo se resolve (vendeu, renovou, escolheu o kit), a tarefa some sozinha.</>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative grid place-content-center">
                <Ring pct={pct} />
                <span className="absolute inset-0 grid place-content-center text-sm font-semibold tabular-nums">{pct}%</span>
              </div>
              <div className="text-sm leading-tight">
                <p className="text-2xl font-semibold tabular-nums">{doneToday}</p>
                <p className="text-white/80">feitas hoje</p>
              </div>
            </div>
          </div>
          {kinds.length > 0 && (
            <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-5">
              {kinds.map((k) => {
                const list = tasks.filter((t) => t.kind === k);
                const tone = list.some((t) => t.tone === "urgent") ? "urgent" : list.some((t) => t.tone === "warn") ? "warn" : "info";
                const on = kind === k;
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => setKind(on ? "" : k)} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${on ? "is-on" : ""}`}>
                    <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{ACTION_LABEL[k]}</span><span className={`seg-dot ${TONE_DOT[tone]}`} /></span>
                    <span className="text-2xl font-semibold tabular-nums leading-tight">{list.length}</span>
                    <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{k === "ACCESS" ? "gerar o convite na ficha" : k === "SHIP_STUCK" ? "para quem envia" : "com mensagem pronta"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {kind && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <span><strong className="text-stone-800 dark:text-stone-100">{shown.length}</strong> de {tasks.length}</span>
          <button type="button" onClick={() => setKind("")} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand dark:text-brand-2">{ACTION_LABEL[kind]} <X className="size-3" /></button>
        </div>
      )}
      {kind && sendable.length > 0 && <BulkSend key={kind} tasks={sendable} kind={kind} whatsappOn={whatsappOn} />}

      <section className="glass overflow-hidden rounded-3xl !p-0">
        {shown.length === 0 ? (
          <p className="p-10 text-center text-sm text-stone-500">Nenhuma tarefa aqui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
            {shown.map((t) => (
              <li key={t.key} style={{ boxShadow: `inset 3px 0 0 ${TONE_BAR[t.tone]}` }} className={`flex flex-col gap-3 px-4 py-3.5 md:px-5 ${open === t.key ? "bg-brand/5" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={t.name} id={t.creatorId} />
                  <div className="min-w-[12rem] flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/admin/creators/${t.creatorId}`} className="font-medium hover:underline">{t.name}</Link>
                      <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-semibold text-stone-700 dark:text-stone-200">{ACTION_LABEL[t.kind]}</span>
                      {t.owner === "ENVIO" && <span className="text-[11px] text-stone-500">· {OWNER[t.owner]}</span>}
                    </p>
                    <p className="text-sm text-stone-600 dark:text-stone-300">{t.detail}</p>
                  </div>
                  <div className="ml-12 flex shrink-0 flex-wrap items-center gap-2 sm:ml-0">
                    {t.message ? (
                      <button type="button" onClick={() => setOpen(open === t.key ? null : t.key)} aria-expanded={open === t.key} className={`${ui.btnSm} ${t.whatsappUrl || canSend ? "" : "opacity-60"}`}>
                        <MessageCircle className="size-3.5" /> Mensagem
                      </button>
                    ) : t.kind === "ACCESS" ? (
                      <Link href={`/admin/creators/${t.creatorId}#cadastro`} className={ui.btnSm}><KeyRound className="size-3.5" /> Gerar o convite</Link>
                    ) : t.kind === "SHIP_STUCK" ? (
                      <Link href="/admin/envios" className={ui.btnSm}><Package className="size-3.5" /> Ver envio</Link>
                    ) : null}
                    <DoneButton taskKey={t.key} />
                  </div>
                </div>
                {open === t.key && t.message && <Composer t={t} canSend={canSend} whatsappOn={whatsappOn} onClose={() => setOpen(null)} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      {!canSend && tasks.some((t) => t.message) && <p className="flex items-center gap-1.5 text-xs text-stone-500"><Check className="size-3.5" /> Mandar pelo WhatsApp da marca é da Gestão.</p>}
    </div>
  );
}
