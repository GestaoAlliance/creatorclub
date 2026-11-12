"use client";

import { MapPin, Search, ShoppingBag, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { ui } from "@/components/ui/styles";
import type { TikTokRow } from "@/lib/tiktok/list";
import { Avatar } from "../creators/list-parts";

type Row = Omit<TikTokRow, "since"> & { since: string };
type Who = "" | "CANDIDATA" | "CREATOR";

const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const dmy = (d: string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const KIND = {
  CANDIDATA: { label: "Candidata", cls: "bg-amber-500/15 text-amber-900 dark:text-amber-200" },
  ATIVA: { label: "Ativa", cls: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  PAUSADA: { label: "Pausada", cls: "bg-stone-500/15 text-stone-700 dark:text-stone-300" },
} as const;
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * Aba TikTok (D-TIKTOKLIST; D-TIKTOKBOARD): faixa da marca com os quadros que filtram (todas, com TikTok Shop,
 * candidatas, creators), busca e cartões para chamar no WhatsApp. Só leitura e sem dinheiro (a Mafe usa esta aba).
 * As afiliadas do TikTok Shop entram quando a API do TikTok for liberada.
 */
export function TikTokBoard({ rows, brandName, initial }: { rows: Row[]; brandName: string; initial: { q: string; shop: boolean; who: Who } }) {
  const [q, setQ] = useState(initial.q);
  const [shop, setShop] = useState(initial.shop);
  const [who, setWho] = useState<Who>(initial.who);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return rows.filter(
      (r) =>
        (!shop || r.tiktokShop === true) &&
        (!who || (who === "CANDIDATA" ? r.kind === "CANDIDATA" : r.kind !== "CANDIDATA")) &&
        (!f || fold(`${r.name} ${r.tiktok} ${r.instagram ?? ""} ${r.niche ?? ""} ${r.place ?? ""}`).includes(f)),
    );
  }, [rows, q, shop, who]);
  const tiles = [
    { id: "all", label: "Com TikTok", n: rows.length, hint: "candidatas e creators", on: !shop && !who, click: () => { setShop(false); setWho(""); }, dot: "seg-info" },
    { id: "shop", label: "TikTok Shop", n: rows.filter((r) => r.tiktokShop).length, hint: "com a loja ativa", on: shop, click: () => setShop(!shop), dot: "seg-good" },
    { id: "cand", label: "Candidatas", n: rows.filter((r) => r.kind === "CANDIDATA").length, hint: "ainda não decididas", on: who === "CANDIDATA", click: () => setWho(who === "CANDIDATA" ? "" : "CANDIDATA"), dot: "seg-warn" },
    { id: "creators", label: "Creators", n: rows.filter((r) => r.kind !== "CANDIDATA").length, hint: "ativas e pausadas", on: who === "CREATOR", click: () => setWho(who === "CREATOR" ? "" : "CREATOR"), dot: "seg-good" },
  ];
  const filtered = Boolean(q.trim() || shop || who);

  return (
    <div className="flex flex-col gap-4">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{brandName}</p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl"><TikTokIcon className="size-6" /> TikTok</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Candidatas e creators que têm TikTok, para chamar no WhatsApp. As mais recentes primeiro.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-5">
            {tiles.map((t) => (
              <button key={t.id} type="button" aria-pressed={t.on} onClick={t.click} className={`seg-tile frost-tile flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-stone-900 dark:text-white ${t.on ? "is-on" : ""}`}>
                <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">{t.label}</span><span className={`seg-dot ${t.dot}`} /></span>
                <span className="text-2xl font-semibold tabular-nums leading-tight">{t.n}</span>
                <span className="w-full truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>
              </button>
            ))}
            <div className="frost-tile col-span-2 flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 @3xl:col-span-1 dark:text-white">
              <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300"><span className="truncate">Afiliadas Shop</span><ShoppingBag className="size-3.5" /></span>
              <span className="text-sm font-semibold leading-tight">Esperando a API</span>
              <span className="w-full text-[11px] leading-tight text-stone-500 dark:text-stone-300">aparecem aqui quando o TikTok liberar o acesso</span>
            </div>
          </div>
        </div>
      </section>

      <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
        <label className="relative min-w-0 flex-[1_1_16rem]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, @, nicho ou cidade" aria-label="Buscar" className={`${ui.input} !rounded-full pl-10 pr-10`} />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Limpar" className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"><X className="size-4" /></button>}
        </label>
        <span className="text-xs text-stone-500"><strong className="text-stone-800 dark:text-stone-100">{shown.length}</strong> de {rows.length}</span>
        {filtered && <button type="button" onClick={() => { setQ(""); setShop(false); setWho(""); }} className="text-xs font-semibold text-brand hover:underline dark:text-brand-2">Limpar filtros</button>}
      </section>

      {shown.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center text-sm text-stone-500">Ninguém com esses filtros.</section>
      ) : (
        <div className="@container">
          <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {shown.map((r) => (
              <article key={r.key} className="liquid-tile flex flex-col gap-3 rounded-3xl p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={r.name} id={r.key.startsWith("c:") ? r.key.slice(2) : null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span>
                      {r.tiktokShop && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:text-sky-300"><ShoppingBag className="size-3" />TikTok Shop</span>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={`https://www.tiktok.com/@${r.tiktok}`} {...ext} className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-stone-900"><TikTokIcon className="size-3.5" />@{r.tiktok}</a>
                  {r.instagram && <a href={`https://instagram.com/${r.instagram}`} {...ext} className="inline-flex items-center gap-1.5 rounded-full bg-stone-500/10 px-3 py-1.5 text-xs font-medium"><InstagramIcon className="size-3.5 text-pink-600" />@{r.instagram}</a>}
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                  {r.followers && <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{r.followers}</span>}
                  {r.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{r.place}</span>}
                  {r.niche && <span className="truncate">{r.niche}</span>}
                  <span>desde {dmy(r.since)}</span>
                </p>
                <div className="mt-auto border-t border-stone-200/70 pt-3 dark:border-white/10">
                  {r.whatsapp ? (
                    <a href={r.whatsapp} {...ext} className={`${ui.btnSm} w-full !bg-emerald-600`}><WhatsAppIcon className="size-3.5" /> Chamar no WhatsApp</a>
                  ) : (
                    <span className="text-xs text-stone-500">{r.phone ?? "sem WhatsApp no cadastro"}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
