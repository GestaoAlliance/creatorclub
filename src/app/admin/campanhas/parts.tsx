"use client";

import { Copy, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/components/ui/styles";
import { fillMessage, TEAM_MESSAGE_MAX } from "@/domain";
import { campaignMessageAction, duplicateCampaignAction } from "./actions";

/** Barra do tempo da campanha: dia N de M (em andamento), cheia depois de encerrada. */
export function ClockBar({ day, total, light = false }: { day: number; total: number; light?: boolean }) {
  const pct = Math.min(100, Math.max(0, (day / total) * 100));
  return (
    <span className={`block h-1.5 overflow-hidden rounded-full ${light ? "bg-white/25" : "bg-stone-500/12"}`}>
      <span className={`block h-full rounded-full transition-[width] duration-700 ${light ? "bg-white" : "bg-brand dark:bg-brand-2"}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

type Person = { id: string; name: string; hasPhone: boolean };

/**
 * Recados da campanha (D-CAMPAIGNBOARD): convidar quem do público ainda não se inscreveu ou lembrar as inscritas, pelo
 * WhatsApp da marca (e portal). Marca quem recebe; texto editável com {nome} e {cupom}.
 */
export function CampaignMessages({ campaignId, campaignName, invitees, entrants, whatsappOn, open }: { campaignId: string; campaignName: string; invitees: Person[]; entrants: Person[]; whatsappOn: boolean; open: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState<"invite" | "entrants">(invitees.length ? "invite" : "entrants");
  const people = to === "invite" ? invitees : entrants;
  const [picked, setPicked] = useState<Set<string>>(new Set(people.map((p) => p.id)));
  const defaults = {
    invite: { title: `Campanha: ${campaignName}`, body: `Oi, {nome}! A campanha "${campaignName}" está no ar e você ainda não entrou. Toque em "Quero participar" na aba Campanhas do portal e divulgue o {cupom}!` },
    entrants: { title: `${campaignName}: bora!`, body: `Oi, {nome}! Passando para lembrar da campanha "${campaignName}". Divulgue o {cupom} e acompanhe o placar na aba Campanhas do portal.` },
  };
  const [title, setTitle] = useState(defaults[to].title);
  const [body, setBody] = useState(defaults[to].body);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const switchTo = (t: "invite" | "entrants") => {
    setTo(t);
    setPicked(new Set((t === "invite" ? invitees : entrants).map((p) => p.id)));
    setTitle(defaults[t].title);
    setBody(defaults[t].body);
    setRes(null);
  };
  if (!open) return <p className="text-sm text-stone-500">Recados ficam disponíveis com a campanha publicada e em andamento (ou prestes a começar).</p>;
  const sample = people.find((p) => picked.has(p.id));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-full bg-stone-500/10 p-1 text-sm">
        {([["invite", `Convidar (${invitees.length})`], ["entrants", `Lembrar inscritas (${entrants.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => switchTo(k)} className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${to === k ? "bg-white shadow-sm dark:bg-stone-800" : "text-stone-500"}`}>{l}</button>
        ))}
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-stone-500">{to === "invite" ? "Todo o público já se inscreveu. 🎉" : "Ninguém se inscreveu ainda."}</p>
      ) : (
        <>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-2xl bg-white/50 p-2 dark:bg-white/5">
            <label className="flex items-center gap-2 px-1 py-0.5 text-xs font-semibold text-stone-500">
              <input type="checkbox" checked={picked.size === people.length} onChange={() => setPicked(picked.size === people.length ? new Set() : new Set(people.map((p) => p.id)))} className="size-4 accent-[var(--brand)]" />
              Todas ({people.length})
            </label>
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-stone-500/5">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="size-4 accent-[var(--brand)]" />
                <span className="flex-1 truncate">{p.name}</span>
                {!p.hasPhone && <span className="text-[10px] text-stone-400">sem WhatsApp</span>}
              </label>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TEAM_MESSAGE_MAX.title} aria-label="Título" className={ui.inputSm} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TEAM_MESSAGE_MAX.body} rows={4} aria-label="Mensagem" className={`${ui.input} resize-y text-sm`} />
          {sample && (
            <div className="rounded-2xl bg-emerald-500/8 p-3 text-sm">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Como chega para {sample.name.split(/\s+/)[0]}</p>
              <p className="font-semibold">{fillMessage(title, { name: sample.name, coupon: null })}</p>
              <p className="whitespace-pre-wrap">{fillMessage(body, { name: sample.name, coupon: null }).replace("seu cupom", "{cupom dela}")}</p>
            </div>
          )}
          <button
            type="button"
            disabled={busy || !picked.size || !title.trim() || !body.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await campaignMessageAction(campaignId, to, [...picked], title, body);
              setBusy(false);
              setRes(r);
              if (r.ok) router.refresh();
            }}
            className={`${ui.btnSm} self-start`}
          >
            <Send className="size-3.5" /> {busy ? "Mandando…" : `Mandar para ${picked.size} ${whatsappOn ? "pelo WhatsApp da marca" : "pelo portal e e-mail"}`}
          </button>
        </>
      )}
      {res && <p role={res.error ? "alert" : "status"} className={`text-sm ${res.error ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}>{res.error ?? res.ok}</p>}
    </div>
  );
}

/** Duplicar a campanha como rascunho (abre a cópia). */
export function DuplicateButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await duplicateCampaignAction(id); setBusy(false); if (r?.error) setErr(r.error); }} className="peek-chip">
        <Copy className="size-3.5" /> {busy ? "Duplicando…" : "Duplicar"}
      </button>
      {err && <span className="text-xs text-white/90"><X className="inline size-3" /> {err}</span>}
    </span>
  );
}

