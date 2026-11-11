"use client";

import { AlertTriangle, ChevronRight, FileWarning, KeyRound, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/portal/copy-button";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { HelpTip } from "@/components/ui/tour";
import { ui } from "@/components/ui/styles";
import { CREATOR_CATEGORIES, CREATOR_CATEGORY_LABEL, formatBRL, matchesCategory, originKey, originText, shortBRL, type CategoryFilter, type CreatorCategoryValue, type Origin } from "@/domain";
import type { BulkInviteState } from "./actions";
import { BulkBar } from "./bulk-bar";
import { Avatar, CopyChip, LastSale, Sparkline, TrendChip } from "./list-parts";
import { PeekPanel } from "./peek-panel";

export type Row = {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  categories: CreatorCategoryValue[];
  fakeEmail: boolean;
  hasLogin: boolean;
  reviewed: boolean;
  contract: { status: "NONE" | "ACTIVE" | "EXPIRING" | "EXPIRED"; daysLeft: number | null };
  idle: { days: number; idle: boolean; lastSaleDay: string | null } | null;
  ugcCycle: { count: number; goal: number; outside: number; status: "NO_CONTRACT" | "OPEN" | "DONE" | "MISSED" } | null;
  lastOrder: { name: string; day: string } | null;
  pendings: string[];
  joinedAt: Date;
  /** D-ORIGIN: só para quem vê a origem. */
  origin: Origin | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  cpf: string | null;
  coupon: string | null;
  /** D-CREATORLIST: 30 dias, os 30 anteriores e as 12 semanas (só para quem vê dinheiro). */
  stats: { salesCents: number; orders: number; sales30Cents: number; prev30Cents: number; weeks: number[] } | null;
  /** M4.2 (D-TAGS). */
  tags: { id: string; name: string }[];
  /** M4.3 (D-PROFILEFIELDS). */
  city: string | null;
  state: string | null;
};

type Situation = "ACTIVE" | "INACTIVE" | "DEACTIVATED";
/** Quadros do topo (D-CREATORLIST); "idle60" só vem de link antigo (`?semvenda=1`). */
type Segment = "" | "selling" | "stopped" | "never" | "noPortal" | "pending" | "contract" | "idle60";
type Sort = "sales30" | "sales" | "last" | "name" | "joined";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const daysSince = (day: string) => Math.max(0, Math.floor((Date.now() - Date.parse(`${day}T12:00:00Z`)) / 86_400_000));
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

const SITUATIONS: { id: Situation; label: string; param: string }[] = [
  { id: "ACTIVE", label: "Ativas", param: "ativas" },
  { id: "INACTIVE", label: "Pausadas", param: "pausadas" },
  { id: "DEACTIVATED", label: "Encerradas", param: "encerradas" },
];
const SORTS: { id: Sort; label: string; money?: boolean }[] = [
  { id: "sales30", label: "Vendas em 30 dias", money: true },
  { id: "sales", label: "Vendas no total", money: true },
  { id: "last", label: "Última venda" },
  { id: "name", label: "Nome" },
  { id: "joined", label: "Entrada" },
];

const SEGMENTS: { id: Exclude<Segment, "" | "idle60">; label: string; hint: string; tone: "good" | "warn" | "bad" | "info"; param: string; test: (r: Row) => boolean }[] = [
  { id: "selling", label: "Vendendo", hint: "nos últimos 30 dias", tone: "good", param: "vendendo", test: (r) => r.lastOrder !== null && daysSince(r.lastOrder.day) < 30 },
  { id: "stopped", label: "Pararam", hint: "sem venda há 30+ dias", tone: "warn", param: "pararam", test: (r) => r.lastOrder !== null && daysSince(r.lastOrder.day) >= 30 },
  { id: "never", label: "Nunca venderam", hint: "desde que entraram", tone: "bad", param: "nunca", test: (r) => !r.lastOrder },
  { id: "noPortal", label: "Sem acesso", hint: "não entram no portal", tone: "info", param: "semacesso", test: (r) => !r.hasLogin },
  { id: "pending", label: "Pendências", hint: "cadastro a acertar", tone: "warn", param: "pendencia", test: (r) => r.pendings.length > 0 },
  { id: "contract", label: "Contrato", hint: "vencendo ou vencido", tone: "bad", param: "contrato", test: (r) => r.contract.status === "EXPIRING" || r.contract.status === "EXPIRED" },
];
const IDLE60 = { label: "Sem vender há 60 dias", test: (r: Row) => r.idle?.idle === true };

export type ListInit = { q?: string; situation?: string; segment?: string; category?: CategoryFilter; tag?: string; origin?: string; uf?: string; sort?: string };

/** Lê o endereço (filtros guardados; links do Início e da aba Origem continuam funcionando). */
function initial(p: ListInit, money: boolean) {
  const seg = SEGMENTS.find((s) => s.param === p.segment)?.id ?? (p.segment === "semvenda" ? "idle60" : "");
  return {
    q: p.q ?? "",
    situation: SITUATIONS.find((s) => s.param === p.situation)?.id ?? "ACTIVE",
    segment: seg as Segment,
    category: p.category ?? "",
    tag: p.tag ?? "",
    origin: p.origin ?? "",
    uf: p.uf ?? "",
    sort: (SORTS.find((s) => s.id === p.sort && (money || !s.money))?.id ?? (money ? "sales30" : "name")) as Sort,
  };
}

/**
 * Lista de creators (D-CREATORLIST, pedido do responsável em 2026-11-11): faixa da marca com os quadros que filtram
 * (vendendo, pararam, nunca venderam, sem acesso, pendência, contrato), busca e filtros guardados no endereço, linha
 * com vendas de 30 dias + tendência + 12 semanas + última venda colorida, painel lateral com o resumo e ações em grupo.
 * Tudo no navegador: a lista já vem filtrada pela permissão (vendas só para quem vê dinheiro; CPF só com dado fiscal).
 */
export function CreatorList(p: { rows: Row[]; init: ListInit; brand: { name: string; slug: string }; pendingApplications: number; canEdit: boolean; archived: boolean; archivedCount: number; canReview: boolean }) {
  const { rows } = p;
  const money = rows.some((r) => r.stats !== null);
  const start = useMemo(() => initial(p.init, money), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState(start.q);
  const [situation, setSituation] = useState<Situation>(start.situation);
  const [segment, setSegment] = useState<Segment>(start.segment);
  const [category, setCategory] = useState<CategoryFilter>(start.category);
  const [tag, setTag] = useState(start.tag);
  const [uf, setUf] = useState(start.uf);
  const [origin, setOrigin] = useState(start.origin);
  const [sort, setSort] = useState<Sort>(start.sort);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [invites, setInvites] = useState<BulkInviteState>(undefined);
  const [moreFilters, setMoreFilters] = useState(Boolean(start.tag || start.uf || start.origin));
  const search = useRef<HTMLInputElement>(null);

  // Filtros no endereço: voltar funciona e o link pode ser mandado para outra pessoa da equipe.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (situation !== "ACTIVE") sp.set("situacao", SITUATIONS.find((s) => s.id === situation)!.param);
    if (segment) sp.set("filtro", segment === "idle60" ? "semvenda" : SEGMENTS.find((s) => s.id === segment)!.param);
    if (category) sp.set("categoria", category);
    if (tag) sp.set("tag", tag);
    if (uf) sp.set("uf", uf);
    if (origin) sp.set("origem", origin);
    if (sort !== (money ? "sales30" : "name")) sp.set("ordem", sort);
    if (p.archived) sp.set("arquivadas", "1");
    const next = `${window.location.pathname}${sp.size ? `?${sp}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [q, situation, segment, category, tag, uf, origin, sort, money, p.archived]);

  // "/" vai para a busca.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const originOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.origin) m.set(originKey(r.origin), originText(r.origin));
    return [...m].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [rows]);
  const ufs = useMemo(() => [...new Set(rows.map((r) => r.state).filter((x): x is string => Boolean(x)))].sort(), [rows]);
  const tagOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) for (const t of r.tags) m.set(t.id, t.name);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rows]);

  const inSituation = useMemo(() => rows.filter((r) => r.status === situation), [rows, situation]);
  const inCategory = useMemo(() => inSituation.filter((r) => matchesCategory(r.categories, category)), [inSituation, category]);

  const shown = useMemo(() => {
    const segTest = segment === "idle60" ? IDLE60.test : (SEGMENTS.find((s) => s.id === segment)?.test ?? (() => true));
    const words = norm(q).split(/\s+/).filter(Boolean);
    const digits = q.replace(/\D/g, "");
    const list = inCategory.filter((r) => {
      if (!segTest(r)) return false;
      if (tag && !r.tags.some((t) => t.id === tag)) return false;
      if (uf && r.state !== uf) return false;
      if (origin && (!r.origin || originKey(r.origin) !== origin)) return false;
      if (!words.length) return true;
      const hay = norm(`${r.name} ${r.coupon ?? ""} ${r.instagram ?? ""} ${r.tiktok ?? ""} ${r.email ?? ""}`);
      const nums = `${(r.phone ?? "").replace(/\D/g, "")} ${r.cpf ?? ""}`;
      return words.every((w) => hay.includes(w.replace(/^@/, ""))) || (digits.length >= 4 && nums.includes(digits));
    });
    const val = (r: Row): number | string =>
      sort === "sales30" ? (r.stats?.sales30Cents ?? 0) : sort === "sales" ? (r.stats?.salesCents ?? 0) : sort === "last" ? (r.lastOrder?.day ?? "") : sort === "joined" ? new Date(r.joinedAt).getTime() : norm(r.name);
    const desc = sort !== "name";
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return (desc ? -c : c) || norm(a.name).localeCompare(norm(b.name));
    });
  }, [q, inCategory, segment, sort, tag, uf, origin]);

  const openIndex = openId ? shown.findIndex((r) => r.id === openId) : -1;
  const openRow = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
  const close = useCallback(() => setOpenId(null), []);
  const prev = openIndex > 0 ? () => setOpenId(shown[openIndex - 1]!.id) : null;
  const next = openIndex >= 0 && openIndex < shown.length - 1 ? () => setOpenId(shown[openIndex + 1]!.id) : null;
  // A linha aberta acompanha a navegação por teclado no painel.
  useEffect(() => {
    if (openId) document.getElementById(`cr-${openId}`)?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const pickAll = () => setPicked((cur) => (allShownPicked ? new Set([...cur].filter((id) => !shown.some((r) => r.id === id))) : new Set([...cur, ...shown.map((r) => r.id)])));
  const pickedRows = rows.filter((r) => picked.has(r.id));

  // Linha: clique abre o painel; Ctrl/⌘ + clique no nome abre a ficha em outra aba (link normal).
  const rowClick = (id: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,label,select")) return;
    setOpenId(id === openId ? null : id);
  };
  const nameClick = (id: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setOpenId(id);
  };

  const sales30 = inCategory.reduce((s, r) => s + (r.stats?.sales30Cents ?? 0), 0);
  const prev30 = inCategory.reduce((s, r) => s + (r.stats?.prev30Cents ?? 0), 0);
  const total = inCategory.reduce((s, r) => s + (r.stats?.salesCents ?? 0), 0);
  const top = inCategory.map((r) => r.stats?.salesCents ?? 0).sort((a, b) => b - a);
  const share = (n: number) => (total ? Math.round((top.slice(0, n).reduce((s, v) => s + v, 0) / total) * 100) : 0);
  const filtersOn = Boolean(q.trim() || segment || category || tag || uf || origin);
  const clearAll = () => {
    setQ("");
    setSegment("");
    setCategory("");
    setTag("");
    setUf("");
    setOrigin("");
  };
  const sitIndex = SITUATIONS.findIndex((s) => s.id === situation);

  return (
    <div className={`flex flex-col gap-4 ${pickedRows.length ? "pb-44 md:pb-28" : ""}`}>
      {/* Faixa da marca: título, situação e os quadros que filtram. */}
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{p.brand.name}</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{p.archived ? "Creators arquivadas" : "Creators"}</h1>
              <p className="mt-1 text-sm text-white/80">
                {p.archived ? (
                  <>{rows.length} arquivadas. Abra a ficha para desarquivar. <Link href="/admin/creators" className="font-semibold underline underline-offset-2">Voltar</Link></>
                ) : (
                  <>
                    {rows.length} na base · {rows.filter((r) => r.status === "ACTIVE").length} ativas
                    {money && sales30 > 0 && <> · <strong className="font-semibold text-white">{formatBRL(sales30)}</strong> em 30 dias</>}
                  </>
                )}
              </p>
            </div>
            <div className="liquid-pill" style={{ "--n": SITUATIONS.length, "--i": sitIndex } as React.CSSProperties} role="tablist" aria-label="Situação">
              <span aria-hidden className="drop" />
              {SITUATIONS.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={situation === s.id} aria-current={situation === s.id ? "true" : undefined} onClick={() => { setSituation(s.id); setPicked(new Set()); }}>
                  {s.label} <span className="tabular-nums opacity-70">{rows.filter((r) => r.status === s.id).length}</span>
                </button>
              ))}
            </div>
          </div>
          {situation !== "DEACTIVATED" && (
            <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @5xl:grid-cols-6" role="group" aria-label="Filtrar pela situação de vendas e cadastro">
              {SEGMENTS.map((s) => {
                const n = inCategory.filter(s.test).length;
                const on = segment === s.id;
                const pct = inCategory.length ? Math.round((n / inCategory.length) * 100) : 0;
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setSegment(on ? "" : s.id)} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${on ? "is-on" : ""}`}>
                    <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">
                      <span className="truncate">{s.label}</span>
                      <span className={`seg-dot seg-${s.tone}`} />
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tabular-nums leading-tight">{n}</span>
                      {(s.id === "selling" || s.id === "stopped" || s.id === "never") && <span className="text-xs font-medium tabular-nums text-stone-500 dark:text-stone-300">{pct}%</span>}
                    </span>
                    <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{s.hint}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Busca e filtros. */}
      <section className="glass flex flex-col gap-3 rounded-3xl p-3 md:p-4" data-tour="cr-filtros">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-[1_1_16rem]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cupom, @, e-mail, WhatsApp ou CPF" aria-label="Buscar creator" className={`${ui.input} !rounded-full pl-10 pr-10`} />
            {q ? (
              <button type="button" onClick={() => setQ("")} aria-label="Limpar a busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"><X className="size-4" /></button>
            ) : (
              <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-stone-300/80 px-1.5 text-[11px] text-stone-400 md:block dark:border-white/15">/</kbd>
            )}
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar por" className={`${ui.inputSm} !rounded-full`}>
            {SORTS.filter((s) => money || !s.money).map((s) => <option key={s.id} value={s.id}>Ordenar: {s.label}</option>)}
          </select>
          {(ufs.length > 0 || tagOptions.length > 0 || originOptions.length > 0) && (
            <button type="button" onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters} className={`${ui.ghostSm} !py-2`}>
              <SlidersHorizontal className="size-3.5" /> Filtros{(tag || uf || origin) && <span className="grid size-4 place-content-center rounded-full bg-brand text-[10px] text-white">{[tag, uf, origin].filter(Boolean).length}</span>}
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {(["", ...CREATOR_CATEGORIES] as CategoryFilter[]).map((c) => (
            <button key={c || "todos"} type="button" onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${category === c ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>
              {c ? CREATOR_CATEGORY_LABEL[c as CreatorCategoryValue] : "Todos os tipos"} <span className="tabular-nums opacity-60">{inSituation.filter((r) => matchesCategory(r.categories, c)).length}</span>
            </button>
          ))}
        </div>
        {moreFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {ufs.length > 0 && (
              <select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado" className={ui.inputSm}>
                <option value="">Todos os estados</option>
                {ufs.map((x) => <option key={x} value={x}>{x} ({inCategory.filter((r) => r.state === x).length})</option>)}
              </select>
            )}
            {originOptions.length > 0 && (
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origem" className={ui.inputSm}>
                <option value="">Todas as origens</option>
                {originOptions.map((o) => <option key={o.key} value={o.key}>{o.label} ({inCategory.filter((r) => r.origin && originKey(r.origin) === o.key).length})</option>)}
              </select>
            )}
            {tagOptions.length > 0 && (
              <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" className={ui.inputSm}>
                <option value="">Todas as tags</option>
                {tagOptions.map((t) => <option key={t.id} value={t.id}>{t.name} ({inCategory.filter((r) => r.tags.some((x) => x.id === t.id)).length})</option>)}
              </select>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <HelpTip id="cr-filtros" />
          <span>
            <strong className="tabular-nums text-stone-800 dark:text-stone-100">{shown.length}</strong> de {inSituation.length} {SITUATIONS[sitIndex]!.label.toLowerCase()}
          </span>
          {segment === "idle60" && <button type="button" onClick={() => setSegment("")} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">{IDLE60.label} <X className="size-3" /></button>}
          {money && total > 0 && <span>Concentração: a maior faz {share(1)}% das vendas · as 3 maiores, {share(3)}%</span>}
          {money && sales30 + prev30 > 0 && <span className="inline-flex items-center gap-1">30 dias: {shortBRL(sales30)} <TrendChip current={sales30} previous={prev30} /></span>}
          {filtersOn && <button type="button" onClick={clearAll} className="font-semibold text-brand hover:underline dark:text-brand-2">Limpar filtros</button>}
          <span className="ml-auto flex flex-wrap gap-3">
            {p.canReview && <Link href="/admin/creators/revisar" className="hover:underline">Cadastros a revisar</Link>}
            {!p.archived && p.archivedCount > 0 && <Link href="/admin/creators?arquivadas=1" className="hover:underline">Arquivadas ({p.archivedCount})</Link>}
            {!p.archived && p.pendingApplications > 0 && <Link href="/admin/candidatas" className="font-semibold text-brand hover:underline dark:text-brand-2">{p.pendingApplications} candidatas esperando →</Link>}
          </span>
        </div>
        {invites && <BulkInvites state={invites} onClose={() => setInvites(undefined)} />}
      </section>

      {/* A lista. */}
      <section className="@container glass overflow-hidden rounded-3xl !p-0" data-tour="cr-lista">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-stone-500">
            <p>Nenhuma creator com esses filtros.</p>
            {filtersOn && <button type="button" onClick={clearAll} className={ui.ghostSm}>Limpar filtros</button>}
          </div>
        ) : (
          <>
            {/* Celular: um cartão por creator. */}
            <ul className="flex flex-col divide-y divide-stone-200/70 @3xl:hidden dark:divide-white/10">
              {shown.map((c) => {
                const d = c.lastOrder ? daysSince(c.lastOrder.day) : null;
                return (
                  <li key={c.id} id={`cr-${c.id}`} onClick={rowClick(c.id)} className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${openId === c.id ? "bg-brand/8" : ""}`}>
                    {p.canEdit && <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Marcar ${c.name}`} className="size-4 shrink-0 accent-[var(--brand)]" />}
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/admin/creators/${c.id}`} onClick={nameClick(c.id)} className="truncate font-medium">{c.name}</Link>
                        {c.stats && <span className="shrink-0 text-sm font-semibold tabular-nums">{shortBRL(c.stats.sales30Cents)}</span>}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <LastSale day={c.lastOrder?.day ?? null} daysAgo={d} />
                          {c.coupon && <span className="truncate font-mono text-[11px] text-stone-500">{c.coupon}</span>}
                        </span>
                        {c.stats && <TrendChip current={c.stats.sales30Cents} previous={c.stats.prev30Cents} />}
                      </div>
                      <Signals c={c} className="mt-1" />
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden @3xl:block">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500 [&>th]:border-b [&>th]:border-stone-200/70 [&>th]:px-3 [&>th]:py-3 dark:[&>th]:border-white/10">
                    {p.canEdit && (
                      <th className="w-10 !pl-5">
                        <input type="checkbox" checked={allShownPicked} onChange={pickAll} aria-label={allShownPicked ? "Desmarcar as da lista" : `Marcar as ${shown.length} da lista`} title={allShownPicked ? "Desmarcar as da lista" : `Marcar as ${shown.length} da lista`} className="size-4 accent-[var(--brand)]" />
                      </th>
                    )}
                    <th className={p.canEdit ? "" : "!pl-5"}>Creator</th>
                    <th className="hidden @5xl:table-cell">Cupom</th>
                    {money && <th className="text-right">30 dias</th>}
                    {money && <th className="hidden @6xl:table-cell">12 semanas</th>}
                    <th>Última venda</th>
                    {money && <th className="hidden text-right @4xl:table-cell">No total</th>}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const d = c.lastOrder ? daysSince(c.lastOrder.day) : null;
                    const on = openId === c.id;
                    return (
                      <tr
                        key={c.id}
                        id={`cr-${c.id}`}
                        onClick={rowClick(c.id)}
                        aria-selected={on}
                        className={`cr-row group cursor-pointer align-middle transition-colors [&>td]:border-b [&>td]:border-stone-200/60 [&>td]:px-3 [&>td]:py-2.5 dark:[&>td]:border-white/8 ${on ? "is-open" : picked.has(c.id) ? "bg-brand/5" : "hover:bg-white/50 dark:hover:bg-white/5"}`}
                      >
                        {p.canEdit && (
                          <td className="!pl-5">
                            <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Marcar ${c.name}`} className="size-4 accent-[var(--brand)]" />
                          </td>
                        )}
                        <td className={p.canEdit ? "" : "!pl-5"}>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={c.name} />
                            <div className="min-w-0">
                              <Link href={`/admin/creators/${c.id}`} onClick={nameClick(c.id)} className="block max-w-64 truncate font-medium hover:underline">{c.name}</Link>
                              <span className="flex items-center gap-2 text-xs text-stone-500">
                                {c.instagram && <span className="inline-flex min-w-0 max-w-40 items-center gap-1 truncate"><InstagramIcon className="size-3 shrink-0 text-pink-600" />{c.instagram.replace(/^@/, "")}</span>}
                                {c.tiktok && <TikTokIcon className="size-3 shrink-0" />}
                                {c.phone && <WhatsAppIcon className="size-3 shrink-0 text-emerald-600" />}
                                {c.coupon && <span className="font-mono text-[11px] @5xl:hidden">{c.coupon}</span>}
                              </span>
                              <Signals c={c} className="mt-1" />
                            </div>
                          </div>
                        </td>
                        <td className="hidden @5xl:table-cell">
                          {c.coupon ? (
                            <span className="flex items-center gap-1">
                              <span className="font-mono text-xs font-semibold">{c.coupon}</span>
                              <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"><CopyChip value={c.coupon} label="" className="grid size-6 place-content-center rounded-full text-stone-500 hover:bg-stone-500/10" /></span>
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        {money && (
                          <td className="whitespace-nowrap text-right">
                            <span className="block font-semibold tabular-nums" title={formatBRL(c.stats?.sales30Cents ?? 0)}>{shortBRL(c.stats?.sales30Cents ?? 0)}</span>
                            {c.stats && <TrendChip current={c.stats.sales30Cents} previous={c.stats.prev30Cents} />}
                          </td>
                        )}
                        {money && <td className="hidden @6xl:table-cell">{c.stats && <Sparkline weeks={c.stats.weeks} />}</td>}
                        <td><LastSale day={c.lastOrder?.day ?? null} daysAgo={d} /></td>
                        {money && (
                          <td className="hidden whitespace-nowrap text-right tabular-nums @4xl:table-cell">
                            <span className="block text-stone-700 dark:text-stone-200" title={formatBRL(c.stats?.salesCents ?? 0)}>{shortBRL(c.stats?.salesCents ?? 0)}</span>
                            <span className="text-[11px] text-stone-500">{c.stats?.orders ?? 0} pedidos</span>
                          </td>
                        )}
                        <td className="!pr-5">
                          <ChevronRight className={`size-4 transition-transform ${on ? "translate-x-0.5 text-brand" : "text-stone-300 group-hover:translate-x-0.5 group-hover:text-stone-500"}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {openRow && <PeekPanel row={openRow} onClose={close} onPrev={prev} onNext={next} daysAgo={openRow.lastOrder ? daysSince(openRow.lastOrder.day) : null} />}
      {p.canEdit && pickedRows.length > 0 && <BulkBar picked={pickedRows} onClear={() => setPicked(new Set())} tags={tagOptions} brandSlug={p.brand.slug} onInvites={setInvites} />}
    </div>
  );
}

/** Sinais da linha: só o que pede ação (sem acesso, pendência, contrato, vídeos da UGC) e as tags. */
function Signals({ c, className = "" }: { c: Row; className?: string }) {
  const pend = c.pendings.filter((x) => !x.startsWith("contrato"));
  const ugc = c.ugcCycle && c.status !== "DEACTIVATED" ? c.ugcCycle : null;
  if (c.hasLogin && !pend.length && c.contract.status !== "EXPIRING" && c.contract.status !== "EXPIRED" && !ugc && !c.tags.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {!c.hasLogin && <span title="Ainda não entra no portal" className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-300"><KeyRound className="size-2.5" />sem acesso</span>}
      {pend.map((x) => <span key={x} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="size-2.5" />{x}</span>)}
      {c.contract.status === "EXPIRING" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200"><FileWarning className="size-2.5" />contrato vence em {c.contract.daysLeft}d</span>}
      {c.contract.status === "EXPIRED" && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:text-red-300"><FileWarning className="size-2.5" />contrato vencido</span>}
      {ugc && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ugc.status === "DONE" ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300" : ugc.status === "MISSED" ? "bg-red-500/12 text-red-800 dark:text-red-300" : "bg-stone-500/10 text-stone-600 dark:text-stone-300"}`}>
          {ugc.status === "NO_CONTRACT" ? "vídeos: sem datas" : `vídeos ${ugc.count}/${ugc.goal}`}
        </span>
      )}
      {c.tags.slice(0, 3).map((t) => <span key={t.id} className="rounded-full border border-brand/25 bg-brand/8 px-1.5 py-0.5 text-[10px] font-medium text-brand dark:border-brand-2/30 dark:text-brand-2">{t.name}</span>)}
      {c.tags.length > 3 && <span className="text-[10px] text-stone-500">+{c.tags.length - 3}</span>}
    </div>
  );
}

/** Links gerados em massa (D-ACCESSREQ): cada um aparece só agora, com a mensagem pronta para o WhatsApp. */
function BulkInvites({ state, onClose }: { state: NonNullable<BulkInviteState>; onClose: () => void }) {
  if (state.error) return <p role="alert" className={ui.error}>{state.error}</p>;
  const results = state.results ?? [];
  const ok = results.filter((r) => r.link);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {ok.length} convite{ok.length === 1 ? "" : "s"} gerado{ok.length === 1 ? "" : "s"}. Cada link vale 7 dias, funciona uma vez e não aparece de novo: mande agora.
        </p>
        <button type="button" onClick={onClose} className={ui.ghostSm}>Fechar</button>
      </div>
      <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
        {results.map((r) => (
          <li key={r.creatorId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{r.name}</span>
              {r.error && <span className="block text-xs text-red-700 dark:text-red-400">{r.error}</span>}
              {r.emailedTo && <span className="block text-xs text-stone-500">também foi por e-mail para {r.emailedTo}</span>}
            </span>
            {r.link && r.message && (
              <span className="flex flex-wrap gap-2">
                {r.whatsappUrl ? (
                  <a href={r.whatsappUrl} {...ext} className={`${ui.btnSm} !bg-emerald-600`}>
                    <WhatsAppIcon className="size-3.5" /> Mandar no WhatsApp
                  </a>
                ) : (
                  <span className={ui.hint}>sem WhatsApp no cadastro</span>
                )}
                <CopyButton value={r.message} label="Copiar mensagem" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
