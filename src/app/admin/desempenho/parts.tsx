"use client";

import { Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ui } from "@/components/ui/styles";
import { TEAM_MESSAGE_MAX } from "@/domain";
import { bulkMessageAction } from "../creators/actions";

/** Cores da marca copiadas para o portal (o vidro com backdrop-filter prende elementos fixos). */
export function brandVars(): React.CSSProperties | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector(".dash");
  if (!el) return undefined;
  const cs = getComputedStyle(el);
  return { "--brand": cs.getPropertyValue("--brand"), "--brand-2": cs.getPropertyValue("--brand-2") } as React.CSSProperties;
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
}

/** Painel lateral (padrão da lista de Creators), fora do vidro. */
export function SidePanel({ label, header, onClose, children }: { label: string; header: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEsc(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="dash" style={brandVars()}>
      <button type="button" aria-label="Fechar o painel" onClick={onClose} className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[2px] lg:hidden" />
      <aside aria-label={label} className="peek-panel glass fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:w-[420px]">
        <header className="relative isolate overflow-hidden px-5 pb-4 pt-5 text-white">
          <div aria-hidden className="brand-art absolute inset-0 -z-10" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">{header}</div>
            <button type="button" onClick={onClose} aria-label="Fechar (Esc)" className="peek-btn shrink-0"><X className="size-4" /></button>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/**
 * Mensagem da equipe para várias creators de uma vez (D-BULKMSG): texto sugerido e editável, portal + WhatsApp da
 * marca (ou e-mail). `{nome}` e `{cupom}` viram os de cada uma.
 */
export function MessageSheet({ ids, names, title: t0, body: b0, onClose }: { ids: string[]; names: string[]; title: string; body: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(t0);
  const [body, setBody] = useState(b0);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  useEsc(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="dash" style={brandVars()}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="fixed inset-0 z-40 bg-stone-950/30 backdrop-blur-[2px]" />
      <div role="dialog" aria-label="Mensagem" className="glass fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-3xl p-5 md:bottom-auto md:top-24">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Mensagem para {ids.length} creator{ids.length === 1 ? "" : "s"}</p>
            <p className="truncate text-xs text-stone-500">{names.join(", ")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className={ui.ghostSm}><X className="size-4" /></button>
        </div>
        {res?.ok ? (
          <p role="status" className="rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">{res.ok}</p>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await bulkMessageAction(ids, title, body);
              setBusy(false);
              setRes(r);
              if (r.ok) router.refresh();
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TEAM_MESSAGE_MAX.title} aria-label="Título" className={ui.input} required />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TEAM_MESSAGE_MAX.body} rows={6} aria-label="Texto da mensagem" className={`${ui.input} resize-y`} required />
            <p className={ui.hint}>Chega no portal e, com o WhatsApp da marca ligado, no WhatsApp dela (das 9h às 20h, aos poucos); sem WhatsApp, por e-mail. {"{nome}"} e {"{cupom}"} viram os de cada uma.</p>
            {res?.error && <p role="alert" className="text-sm text-red-700">{res.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={ui.ghostSm}>Cancelar</button>
              <button type="submit" disabled={busy || !title.trim() || !body.trim()} className={ui.btnSm}><Send className="size-3.5" />{busy ? "Enviando…" : `Enviar para ${ids.length}`}</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Anel de progresso pequeno (vídeos do ciclo). */
export function MiniRing({ value, total, tone = "brand", size = 52 }: { value: number; total: number; tone?: "brand" | "good" | "bad"; size?: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const p = total ? Math.min(1, value / total) : 0;
  const stroke = tone === "good" ? "#10b981" : tone === "bad" ? "#ef4444" : "var(--brand)";
  return (
    <span className="relative inline-grid shrink-0 place-content-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <span className="text-xs font-semibold tabular-nums">{value}/{total}</span>
    </span>
  );
}
