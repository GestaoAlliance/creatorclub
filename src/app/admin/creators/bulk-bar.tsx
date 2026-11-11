"use client";

import { Download, KeyRound, MessageCircle, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/components/ui/styles";
import { CREATOR_CATEGORY_LABEL, creatorsCsv, dayKey, fillMessage, TEAM_MESSAGE_MAX } from "@/domain";
import { bulkInviteAction, bulkMessageAction, bulkTagAction, type BulkInviteState, type BulkResult } from "./actions";
import type { Row } from "./list";

type Panel = "" | "message" | "tag" | "invite";

/** Baixa as marcadas em planilha (dados que a pessoa já vê na lista). */
function download(rows: Row[], brandSlug: string) {
  const csv = creatorsCsv(
    rows.map((r) => ({
      name: r.name,
      status: r.statusLabel,
      categories: r.categories.map((k) => CREATOR_CATEGORY_LABEL[k]),
      coupon: r.coupon,
      instagram: r.instagram,
      tiktok: r.tiktok,
      phone: r.phone,
      email: r.email,
      city: r.city,
      state: r.state,
      tags: r.tags.map((t) => t.name),
      stats: r.stats,
      lastSaleDay: r.lastOrder?.day ?? null,
      joinedDay: dayKey(new Date(r.joinedAt), "America/Sao_Paulo"),
    })),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `creators-${brandSlug}-${dayKey(new Date(), "America/Sao_Paulo")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Barra das ações em grupo (D-CREATORLIST): aparece embaixo quando há creators marcadas. Mensagem (D-BULKMSG), tag,
 * convite de acesso ao portal (só para quem ainda não tem) e planilha.
 */
export function BulkBar({ picked, onClear, tags, brandSlug, onInvites }: { picked: Row[]; onClear: () => void; tags: { id: string; name: string }[]; brandSlug: string; onInvites: (s: BulkInviteState) => void }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagText, setTagText] = useState("");
  const ids = picked.map((r) => r.id);
  const invitable = picked.filter((r) => !r.hasLogin && !r.fakeEmail);
  const withoutPhone = picked.filter((r) => !r.phone).length;
  const pickedTags = tags.filter((t) => picked.some((r) => r.tags.some((x) => x.id === t.id)));
  const sample = picked[0];

  async function run(fn: () => Promise<BulkResult>) {
    setBusy(true);
    setResult(null);
    const r = await fn();
    setResult(r);
    setBusy(false);
    if (r.ok) {
      setPanel("");
      router.refresh();
    }
  }

  const tab = (id: Panel, label: string, Icon: typeof Tag, disabled = false) => (
    <button type="button" disabled={disabled} onClick={() => { setResult(null); setPanel(panel === id ? "" : id); }} aria-expanded={panel === id} aria-label={label} title={label} className={`bulk-btn ${panel === id ? "is-on" : ""}`}>
      <Icon className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[5.5rem] z-40 md:bottom-3 flex justify-center px-3">
      <div className="bulk-bar pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-[28px] p-2">
        {panel === "message" && (
          <form
            className="flex flex-col gap-2 px-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => bulkMessageAction(ids, title, body));
            }}
          >
            <p className="text-sm font-semibold">Mensagem para {picked.length} creator{picked.length === 1 ? "" : "s"}</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TEAM_MESSAGE_MAX.title} placeholder="Título (ex.: Campanha nova no ar)" aria-label="Título" className={ui.input} required />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TEAM_MESSAGE_MAX.body} rows={4} placeholder="Escreva a mensagem. Use {nome} e {cupom} para personalizar." aria-label="Texto da mensagem" className={`${ui.input} resize-y`} required />
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-stone-500">Inserir:</span>
              {["{nome}", "{cupom}"].map((v) => (
                <button key={v} type="button" onClick={() => setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}${v}`)} className="rounded-full bg-stone-500/10 px-2 py-0.5 font-mono">{v}</button>
              ))}
              <span className="ml-auto tabular-nums text-stone-400">{body.length}/{TEAM_MESSAGE_MAX.body}</span>
            </div>
            {sample && body.trim() && (
              <div className="rounded-2xl bg-emerald-500/8 p-3 text-sm">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Como chega para {sample.name.split(/\s+/)[0]}</p>
                <p className="font-semibold">{fillMessage(title, sample)}</p>
                <p className="whitespace-pre-wrap">{fillMessage(body, sample)}</p>
              </div>
            )}
            <p className={ui.hint}>
              Chega no portal (sininho) e, com o WhatsApp da marca ligado, no WhatsApp dela (das 9h às 20h, aos poucos); sem WhatsApp, vai por e-mail.
              {withoutPhone > 0 && ` ${withoutPhone} sem WhatsApp no cadastro: só portal.`}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPanel("")} className={ui.ghostSm}>Cancelar</button>
              <button type="submit" disabled={busy || !title.trim() || !body.trim()} className={ui.btnSm}>{busy ? "Enviando…" : `Enviar para ${picked.length}`}</button>
            </div>
          </form>
        )}
        {panel === "tag" && (
          <div className="flex flex-col gap-2 px-2 pt-2">
            <p className="text-sm font-semibold">Tag nas {picked.length} marcadas</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => bulkTagAction(ids, { add: tagText }));
              }}
            >
              <input list="bulk-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} maxLength={30} placeholder="Nome da tag (nova ou existente)" aria-label="Tag" className={`${ui.input} flex-1`} />
              <datalist id="bulk-tags">{tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
              <button type="submit" disabled={busy || !tagText.trim()} className={ui.btnSm}>Pôr</button>
            </form>
            {pickedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-stone-500">Tirar:</span>
                {pickedTags.map((t) => (
                  <button key={t.id} type="button" disabled={busy} onClick={() => void run(() => bulkTagAction(ids, { remove: t.id }))} className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 font-medium text-brand dark:text-brand-2">
                    {t.name} <X className="size-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {panel === "invite" && (
          <div className="flex flex-col gap-2 px-2 pt-2 text-sm">
            <p className="font-semibold">Convite de acesso ao portal</p>
            <p className={ui.hint}>
              {invitable.length} das {picked.length} marcadas ainda não têm acesso e podem receber o link (vale 7 dias, uma vez).
              {picked.length - invitable.length > 0 && " As outras já entram no portal ou estão com e-mail a confirmar na ficha."}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPanel("")} className={ui.ghostSm}>Cancelar</button>
              <button
                type="button"
                disabled={busy || !invitable.length}
                onClick={async () => {
                  setBusy(true);
                  onInvites(await bulkInviteAction(invitable.map((r) => r.id)));
                  setBusy(false);
                  setPanel("");
                  onClear();
                  router.refresh();
                }}
                className={ui.btnSm}
              >
                {busy ? "Gerando…" : `Gerar ${invitable.length} convite${invitable.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
        {result && <p role={result.error ? "alert" : "status"} className={`px-3 text-sm ${result.error ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}>{result.error ?? result.ok}</p>}
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-2 pl-3 pr-2 text-sm">
            <span className="grid min-w-7 place-content-center rounded-full bg-brand px-2 py-0.5 text-xs font-bold tabular-nums text-white">{picked.length}</span>
            <span className="hidden font-medium md:inline">marcada{picked.length === 1 ? "" : "s"}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            {tab("message", "Mensagem", MessageCircle)}
            {tab("tag", "Tag", Tag)}
            {tab("invite", "Convite", KeyRound)}
            <button type="button" onClick={() => download(picked, brandSlug)} aria-label="Planilha" title="Baixar planilha das marcadas" className="bulk-btn">
              <Download className="size-4" />
              <span className="hidden sm:inline">Planilha</span>
            </button>
            <button type="button" onClick={onClear} aria-label="Desmarcar todas" className="bulk-btn"><X className="size-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
