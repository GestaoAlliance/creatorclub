"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Msg } from "@/components/ui/msg";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { badge, ui } from "@/components/ui/styles";
import { instagramUrl, rejectionMessage, whatsappChatUrl, whatsappLink } from "@/domain";
import type { ApplicationsPace } from "@/lib/onboarding/pace";
import { rejectAction, rejectManyAction } from "./actions";

/** O essencial de cada candidata para a tabela (o cartão completo vem pronto do servidor em `detail`). */
export type CandidateRow = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  followers: string | null;
  kind: string;
  kindTone: "neutral" | "sky" | "amber";
  origin: string;
  hunter: string | null;
  /** D-ORIGIN: código digitado sem link correspondente, e se veio do formulário de hunter. */
  hunterCode: string | null;
  viaHunterForm: boolean;
  /** D-ORIGIN: campanha do link e "Como conheceu a marca?". */
  campaign: string | null;
  heardFrom: string | null;
  brands: string[];
  duplicate: boolean;
  /** M2.3 (D-PRIORITY): selo e os motivos (aparecem ao passar o mouse e no celular). */
  priority: { level: "ALTA" | "MEDIA" | "BAIXA" | "REPETIDA"; label: string; reasons: string };
  days: number;
  canDecide: boolean;
  brandName: string;
  /** D-AUTENTIQUE2: selo do contrato (null = marca sem Autentique) e se já dá para aprovar. */
  contract: { label: string; tone: "neutral" | "sky" | "amber" | "green" | "red" } | null;
  approvable: boolean;
  creatorId: string | null;
  detail: ReactNode;
};

type Chip = "" | "dup" | "hunter" | "old" | "high";
type Open = { id: string; mode: "view" | "reject" } | null;

const ext = { target: "_blank", rel: "noopener noreferrer", onClick: (e: React.MouseEvent) => e.stopPropagation() } as const;
const handle = (h: string) => h.replace(/^@/, "");
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const ago = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);

/** Recusar direto na linha: motivo opcional (só a equipe vê), confirmar e abrir o WhatsApp com a recusa (D-AUTENTIQUE2). */
function QuickReject({ id, name, phone, brand, onCancel }: { id: string; name: string; phone: string | null; brand: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  const router = useRouter();
  if (state?.ok) {
    const wa = whatsappLink(phone, rejectionMessage({ name, brand }));
    return (
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-3 text-sm text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-100">
        <p>{name}: {state.ok.charAt(0).toLowerCase() + state.ok.slice(1)}</p>
        <div className="flex flex-wrap gap-2">
          {wa ? <a href={wa} {...ext} className={`${ui.btnSm} inline-flex items-center gap-1.5`}><WhatsAppIcon className="size-4" /> Abrir WhatsApp com a recusa</a> : <span className={ui.hint}>WhatsApp não reconhecido ({phone || "sem número"}).</span>}
          <button type="button" onClick={() => router.refresh()} className={ui.ghostSm}>Concluir</button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} onClick={(e) => e.stopPropagation()} className="flex flex-col gap-2 rounded-2xl border border-red-300/60 bg-red-50/70 p-3 dark:border-red-400/30 dark:bg-red-950/30">
      <input type="hidden" name="applicationId" value={id} />
      <p className="text-sm">Recusar <strong>{name}</strong>?</p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="note" maxLength={300} placeholder="Motivo (opcional, só a equipe vê)" className={`${ui.inputSm} min-w-0 basis-full sm:basis-0 sm:flex-1`} autoFocus />
        <button className={ui.dangerSm} disabled={pending}>{pending ? "Recusando…" : "Confirmar recusa"}</button>
        <button type="button" onClick={onCancel} className={ui.ghostSm}>Cancelar</button>
      </div>
      <Msg state={state?.error ? { error: state.error } : undefined} />
    </form>
  );
}

/** M4.1 (D-MANUALAPP): recusar as marcadas de uma vez, com um motivo opcional para todas (aprovar segue uma a uma). */
function BulkReject({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
  const [state, action, pending] = useActionState(rejectManyAction, undefined);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      setConfirm(false);
      onDone();
      router.refresh();
    }
  }, [state, router, onDone]);
  if (ids.length === 0) return state?.ok ? <Msg state={state} /> : null;
  return (
    <form action={action} className="sticky top-2 z-10 flex flex-col gap-2 rounded-2xl border border-stone-200/80 bg-white/90 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-stone-900/90">
      {ids.map((id) => <input key={id} type="hidden" name="applicationId" value={id} />)}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{ids.length === 1 ? "1 marcada" : `${ids.length} marcadas`}</p>
        {confirm ? (
          <>
            <input name="note" maxLength={300} placeholder="Motivo (opcional, só a equipe vê)" className={`${ui.inputSm} min-w-0 basis-full sm:basis-0 sm:flex-1`} autoFocus />
            <button className={ui.dangerSm} disabled={pending}>{pending ? "Recusando…" : `Confirmar recusa de ${ids.length}`}</button>
            <button type="button" onClick={() => setConfirm(false)} className={ui.ghostSm}>Cancelar</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setConfirm(true)} className={ui.dangerSm}>Recusar marcadas</button>
            <button type="button" onClick={onClear} className={ui.ghostSm}>Desmarcar</button>
          </>
        )}
      </div>
      <Msg state={state?.error ? state : undefined} />
    </form>
  );
}

function Pick({ c, picked, onPick }: { c: CandidateRow; picked: boolean; onPick: (id: string) => void }) {
  if (!c.canDecide) return null;
  return (
    <input
      type="checkbox"
      checked={picked}
      onChange={() => onPick(c.id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Marcar ${c.name}`}
      className="size-4 accent-current"
    />
  );
}

function Actions({ c, onApprove, onReject }: { c: CandidateRow; onApprove: () => void; onReject: () => void }) {
  if (c.creatorId) return <Link href={`/admin/creators/${c.creatorId}`} onClick={(e) => e.stopPropagation()} className={ui.ghostSm}>Abrir a ficha</Link>;
  if (!c.canDecide) return null;
  return (
    <span className="flex items-center justify-end gap-1.5">
      {c.approvable ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onApprove(); }} className={ui.btnSm}>Aprovar</button>
      ) : (
        <button type="button" onClick={(e) => { e.stopPropagation(); onApprove(); }} className={ui.ghostSm} title="Aprovar libera depois que ela assinar o contrato">Ver contrato</button>
      )}
      <button type="button" onClick={(e) => { e.stopPropagation(); onReject(); }} className={ui.ghostSm} aria-label={`Recusar ${c.name}`}>
        <X className="size-3.5" /> Recusar
      </button>
    </span>
  );
}

function Socials({ c }: { c: CandidateRow }) {
  const ig = c.instagram ? instagramUrl(c.instagram) : null;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {c.instagram ? (
        ig ? <a href={ig} {...ext} className="inline-flex items-center gap-1.5 hover:underline"><InstagramIcon className="size-3.5 text-pink-600" />{handle(c.instagram)}</a> : <span>@{handle(c.instagram)}</span>
      ) : (
        <span className="text-stone-400">—</span>
      )}
      {c.tiktok && <a href={`https://www.tiktok.com/@${handle(c.tiktok)}`} {...ext} className="inline-flex items-center gap-1.5 hover:underline"><TikTokIcon className="size-3.5" />{handle(c.tiktok)}</a>}
      {c.followers && <span className="text-stone-500">{c.followers} seguidores</span>}
    </div>
  );
}

const PRIORITY_TONE = { ALTA: badge.green, MEDIA: badge.amber, BAIXA: badge.neutral, REPETIDA: badge.red } as const;

function PriorityBadge({ c }: { c: CandidateRow }) {
  return <span title={c.priority.reasons} className={PRIORITY_TONE[c.priority.level]}>{c.priority.label}</span>;
}

function Who({ c }: { c: CandidateRow }) {
  const wa = c.phone ? whatsappChatUrl(c.phone) : null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-10 shrink-0 place-content-center rounded-full bg-gradient-to-br from-brand to-brand/60 text-sm font-semibold text-white shadow-sm dark:from-brand-2 dark:to-brand-2/60">{initials(c.name)}</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{c.name}</p>
        {wa ? (
          <a href={wa} {...ext} className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-emerald-700 dark:text-stone-300"><WhatsAppIcon className="size-3.5 text-emerald-600" />{c.phone}</a>
        ) : (
          <span className="text-xs text-stone-500">{c.phone ?? "sem WhatsApp"}</span>
        )}
        {(c.brands.length > 0 || c.contract) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {c.contract && <span className={badge[c.contract.tone]}>{c.contract.label}</span>}
            {c.brands.map((b) => <span key={b} className={badge.green}>{b}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}


/** D-ORIGIN: de onde a candidata veio, em destaque (a Gestão decide sabendo qual hunter trouxe). */
function CameFrom({ c }: { c: CandidateRow }) {
  const extra = (
    <>
      {c.campaign && <span className="text-[11px] text-stone-500">campanha {c.campaign}</span>}
      {c.heardFrom && <span className="text-[11px] text-stone-500">conheceu por: {c.heardFrom}</span>}
    </>
  );
  if (c.hunter)
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="rounded-xl bg-brand px-2.5 py-1 text-xs font-semibold leading-tight text-white dark:bg-brand-2">Hunter: {c.hunter}</span>
        <span className="text-[11px] text-stone-500">{c.origin}</span>
        {extra}
      </span>
    );
  if (c.hunterCode || c.viaHunterForm)
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="rounded-xl bg-amber-500/15 px-2.5 py-1 text-xs font-medium leading-tight text-amber-800 dark:text-amber-300">{c.hunterCode ? `Hunter: código "${c.hunterCode}" não encontrado` : "Hunter não informado"}</span>
        <span className="text-[11px] text-stone-500">{c.origin}</span>
        {extra}
      </span>
    );
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="text-xs">{c.origin}</span>
      {extra}
    </span>
  );
}

const PRIORITY_BAR = { ALTA: "#10b981", MEDIA: "#f59e0b", BAIXA: "#a8a29e", REPETIDA: "#ef4444" } as const;

/** Painel lateral da candidata (D-CANDBOARD): tudo o que ela respondeu e aprovar/recusar; ↑/↓ passa, Esc fecha. */
function CandidatePanel({ c, mode, onMode, onClose, onPrev, onNext, pending }: { c: CandidateRow; mode: "view" | "reject"; onMode: (m: "view" | "reject") => void; onClose: () => void; onPrev: (() => void) | null; onNext: (() => void) | null; pending: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [c.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "Escape") onClose();
      else if ((e.key === "ArrowDown" || e.key === "j") && onNext) { e.preventDefault(); onNext(); }
      else if ((e.key === "ArrowUp" || e.key === "k") && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onNext, onPrev]);
  const wa = c.phone ? whatsappChatUrl(c.phone) : null;
  const ig = c.instagram ? instagramUrl(c.instagram) : null;
  return (
    <>
      <button type="button" aria-label="Fechar o painel" onClick={onClose} className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[2px] lg:hidden" />
      <aside aria-label={`Candidata ${c.name}`} className="peek-panel glass fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:w-[520px]">
        <header className="relative overflow-hidden px-5 pb-4 pt-5 text-white">
          <div aria-hidden className="brand-art absolute inset-0 -z-10" />
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-1">
              <button type="button" disabled={!onPrev} onClick={() => onPrev?.()} aria-label="Candidata anterior (↑)" className="peek-btn"><ChevronUp className="size-4" /></button>
              <button type="button" disabled={!onNext} onClick={() => onNext?.()} aria-label="Próxima candidata (↓)" className="peek-btn"><ChevronDown className="size-4" /></button>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar (Esc)" className="peek-btn"><X className="size-4" /></button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-content-center rounded-[18px] bg-white/18 text-lg font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.5),inset_0_0_0_1px_rgb(255_255_255/0.25)]">{initials(c.name)}</span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight">{c.name}</h2>
              <p className="truncate text-xs text-white/80">{c.kind} · chegou {ago(c.days)}{c.followers ? ` · ${c.followers} seguidores` : ""}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: PRIORITY_BAR[c.priority.level] }}>{c.priority.label}</span>
                {c.priority.reasons && <span className="text-[11px] text-white/80">{c.priority.reasons}</span>}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {wa && <a href={wa} {...ext} className="peek-chip"><WhatsAppIcon className="size-3.5" />WhatsApp</a>}
            {ig && <a href={ig} {...ext} className="peek-chip"><InstagramIcon className="size-3.5" />{handle(c.instagram!)}</a>}
            {c.tiktok && <a href={`https://www.tiktok.com/@${handle(c.tiktok)}`} {...ext} className="peek-chip"><TikTokIcon className="size-3.5" />{handle(c.tiktok)}</a>}
          </div>
        </header>
        <div ref={body} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 [&_article.glass]:!bg-transparent [&_article.glass]:!p-1 [&_article.glass]:!shadow-none" id={`cand-${c.id}`}>
          {mode === "reject" ? <QuickReject id={c.id} name={c.name} phone={c.phone} brand={c.brandName} onCancel={() => onMode("view")} /> : c.detail}
        </div>
        {pending && c.canDecide && mode === "view" && (
          <footer className="flex items-center gap-2 border-t border-stone-200/70 p-3 dark:border-white/10">
            <span className="flex-1 text-[11px] leading-tight text-stone-500">Ao concluir, abre a próxima da fila.</span>
            <button type="button" onClick={() => onMode("reject")} className={ui.ghostSm}><X className="size-3.5" /> Recusar</button>
            <button type="button" onClick={() => body.current?.querySelector("form input[name=coupon]")?.scrollIntoView({ block: "center", behavior: "smooth" })} className={ui.btnSm}>{c.approvable ? "Aprovar" : "Ver contrato"}</button>
          </footer>
        )}
        {c.creatorId && (
          <footer className="border-t border-stone-200/70 p-3 dark:border-white/10">
            <Link href={`/admin/creators/${c.creatorId}`} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white">Abrir a ficha</Link>
          </footer>
        )}
      </aside>
    </>
  );
}

export type BoardTab = { href: string; label: string; n: number; on: boolean };
type Tile = { id: Chip; label: string; n: number; hint: string; tone: "good" | "warn" | "bad" | "info"; test: (c: CandidateRow) => boolean };

/**
 * Candidatas (D-CANDBOARD, pedido do responsável em 2026-11-11): faixa da marca com a situação e os quadros (os de
 * Pendentes filtram a lista), a lista com a cor da prioridade, e o painel lateral em modo triagem: decidiu, aparece o
 * WhatsApp da decisão; ao concluir, abre a próxima da fila. Recusar várias de uma vez continua (marcar na lista).
 */
export function CandidateBoard(p: { rows: CandidateRow[]; pending: boolean; tabs: BoardTab[]; brandName: string; newHref: string | null; pace: ApplicationsPace | null; waitingHref: string; toolbar: ReactNode; summary: ReactNode }) {
  const { rows, pending } = p;
  const [open, setOpen] = useState<Open>(null);
  const [chip, setChip] = useState<Chip>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = useCallback(() => setPicked(new Set()), []);
  const hunterCodeMissing = rows.filter((c) => c.hunterCode !== null || (c.viaHunterForm && !c.hunter)).length;
  const oldest = rows.reduce((m, c) => Math.max(m, c.days), 0);
  const tiles: Tile[] = pending
    ? [
        { id: "high", label: "Prioridade alta", n: rows.filter((c) => c.priority.level === "ALTA").length, hint: "decidir primeiro", tone: "good", test: (c) => c.priority.level === "ALTA" },
        { id: "old", label: "Esperando 7+ dias", n: rows.filter((c) => c.days > 7).length, hint: rows.length ? `a mais antiga há ${oldest} dias` : "nenhuma", tone: "bad", test: (c) => c.days > 7 },
        { id: "hunter", label: "Por hunter", n: rows.filter((c) => c.hunter !== null || c.hunterCode !== null || c.viaHunterForm).length, hint: hunterCodeMissing ? `${hunterCodeMissing} com código não achado` : "vieram por indicação", tone: "info", test: (c) => c.hunter !== null || c.hunterCode !== null || c.viaHunterForm },
        { id: "dup", label: "Repetidas", n: rows.filter((c) => c.duplicate).length, hint: "podem ser a mesma pessoa", tone: "warn", test: (c) => c.duplicate },
      ]
    : [];
  const active = tiles.find((x) => x.id === chip);
  const shown = active ? rows.filter(active.test) : rows;
  const pickable = pending ? shown.filter((c) => c.canDecide) : [];
  const allPicked = pickable.length > 0 && pickable.every((c) => picked.has(c.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(pickable.map((c) => c.id)));

  // Triagem: a linha decidida some ao concluir (a tela atualiza); abre a que ficou no mesmo lugar da fila.
  const lastIndex = useRef(0);
  const openIndex = open ? shown.findIndex((c) => c.id === open.id) : -1;
  if (openIndex >= 0) lastIndex.current = openIndex;
  useEffect(() => {
    if (!open || rows.some((c) => c.id === open.id)) return;
    const next = shown[Math.min(lastIndex.current, shown.length - 1)];
    setOpen(next ? { id: next.id, mode: "view" } : null);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) document.getElementById(`row-${open.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const openRow = open ? (rows.find((c) => c.id === open.id) ?? null) : null;
  const close = useCallback(() => setOpen(null), []);
  const prev = openIndex > 0 ? () => setOpen({ id: shown[openIndex - 1]!.id, mode: "view" }) : null;
  const next = openIndex >= 0 && openIndex < shown.length - 1 ? () => setOpen({ id: shown[openIndex + 1]!.id, mode: "view" }) : null;
  const show = (id: string, mode: "view" | "reject" = "view") => setOpen({ id, mode });
  const tabIndex = Math.max(0, p.tabs.findIndex((t) => t.on));

  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{p.brandName}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Candidatas</h1>
              <p className="mt-1 max-w-xl text-sm text-white/80">Site, formulários do Google e cadastros da equipe. Toque numa candidata para ver tudo e decidir.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {p.newHref && <Link href={p.newHref} className="peek-chip"><Plus className="size-3.5" /> Nova candidata</Link>}
            </div>
          </div>
          <nav aria-label="Situação" data-tour="cand-abas" className="liquid-pill self-start max-w-full overflow-x-auto" style={{ "--n": p.tabs.length, "--i": tabIndex } as React.CSSProperties}>
            <span aria-hidden className="drop" />
            {p.tabs.map((t) => (
              <Link key={t.href} href={t.href} aria-current={t.on ? "true" : undefined}>
                {t.label} <span className="tabular-nums opacity-70">{t.n}</span>
              </Link>
            ))}
          </nav>
          <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-6">
            {tiles.map((t) => {
              const on = chip === t.id;
              return (
                <button key={t.id} type="button" aria-pressed={on} onClick={() => setChip(on ? "" : t.id)} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${on ? "is-on" : ""}`}>
                  <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot seg-${t.tone}`} /></span>
                  <span className="text-2xl font-semibold tabular-nums leading-tight">{t.n}</span>
                  <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
                </button>
              );
            })}
            {p.pace && (
              <Link href={p.waitingHref} className="seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white">
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">Sem assinar</span><span className="seg-dot seg-warn" /></span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{p.pace.waiting}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{p.pace.waitingSlow ? `${p.pace.waitingSlow} há 3+ dias` : "aprovadas sem assinar"}</span>
              </Link>
            )}
            {p.pace && (
              <div className="frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">Ritmo · 30 dias</span><span className="seg-dot seg-good" /></span>
                <span className="text-2xl font-semibold tabular-nums leading-tight" title="Tempo médio entre a inscrição e a decisão">{p.pace.avgDecisionDays !== null ? p.pace.avgDecisionDays.toLocaleString("pt-BR") : "—"}<span className="ml-1 text-xs font-medium text-stone-500">dias p/ decidir</span></span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{p.pace.approved30} aprovadas · {p.pace.rejected30} recusadas</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="glass flex flex-col gap-3 rounded-3xl p-3 md:p-4">
        {p.toolbar}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          {p.summary}
          {active && <button type="button" onClick={() => setChip("")} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand dark:text-brand-2">{active.label} <X className="size-3" /></button>}
        </div>
      </section>

      {pending && <BulkReject ids={[...picked].filter((id) => rows.some((r) => r.id === id))} onDone={clear} onClear={clear} />}

      <section className="@container glass overflow-hidden rounded-3xl !p-0" data-tour="cand-lista">
        {shown.length === 0 ? (
          <p className="p-10 text-center text-sm text-stone-500">{rows.length ? "Nenhuma candidata nesse quadro." : pending ? "Nenhuma candidata esperando. 🎉" : "Nenhuma aqui."}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-stone-200/70 @3xl:hidden dark:divide-white/10">
              {shown.map((c) => (
                <li key={c.id} id={`row-${c.id}`} onClick={() => show(c.id)} style={{ boxShadow: `inset 3px 0 0 ${PRIORITY_BAR[c.priority.level]}` }} className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${open?.id === c.id ? "bg-brand/8" : ""}`}>
                  {pending && <span className="pt-3"><Pick c={c} picked={picked.has(c.id)} onPick={pick} /></span>}
                  <div className="min-w-0 flex-1">
                    <Who c={c} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-12 text-xs">
                      <PriorityBadge c={c} />
                      <span className={badge[c.kindTone]}>{c.kind}</span>
                      <span className={pending && c.days > 7 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-stone-500"}>{ago(c.days)}</span>
                      {c.hunter && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">Hunter: {c.hunter}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden @3xl:block">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500 [&>th]:border-b [&>th]:border-stone-200/70 [&>th]:px-3 [&>th]:py-3 dark:[&>th]:border-white/10">
                    {pending && <th className="w-10 !pl-5">{pickable.length > 0 && <input type="checkbox" checked={allPicked} onChange={pickAll} aria-label="Marcar todas" className="size-4 accent-[var(--brand)]" />}</th>}
                    <th className={pending ? "" : "!pl-5"}>Candidata</th>
                    <th className="hidden @5xl:table-cell">Redes</th>
                    <th>Veio de</th>
                    <th>Chegou</th>
                    <th className="!pr-5 text-right">{pending ? "Decidir" : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id} id={`row-${c.id}`} onClick={() => show(c.id)} className={`cr-row group cursor-pointer align-middle transition-colors [&>td]:border-b [&>td]:border-stone-200/60 [&>td]:px-3 [&>td]:py-3 dark:[&>td]:border-white/8 ${open?.id === c.id ? "is-open" : picked.has(c.id) ? "bg-brand/5" : "hover:bg-white/50 dark:hover:bg-white/5"}`}>
                      {pending && <td className="!pl-5" style={{ boxShadow: `inset 3px 0 0 ${PRIORITY_BAR[c.priority.level]}` }}><Pick c={c} picked={picked.has(c.id)} onPick={pick} /></td>}
                      <td className={pending ? "" : "!pl-5"}>
                        <Who c={c} />
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-12">
                          <PriorityBadge c={c} />
                          <span className={badge[c.kindTone]}>{c.kind}</span>
                          {c.priority.reasons && <span className="hidden max-w-64 truncate text-[11px] text-stone-500 @6xl:inline">{c.priority.reasons}</span>}
                        </div>
                      </td>
                      <td className="hidden @5xl:table-cell"><Socials c={c} /></td>
                      <td className="max-w-52"><CameFrom c={c} /></td>
                      <td className={`whitespace-nowrap text-xs ${pending && c.days > 7 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-stone-500"}`}>{ago(c.days)}</td>
                      <td className="!pr-5"><Actions c={c} onApprove={() => show(c.id)} onReject={() => show(c.id, "reject")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {openRow && open && <CandidatePanel c={openRow} mode={open.mode} onMode={(m) => setOpen({ id: openRow.id, mode: m })} onClose={close} onPrev={prev} onNext={next} pending={pending} />}
    </div>
  );
}
