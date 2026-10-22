"use client";

import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { chooseBrandAction, searchCreatorsAction } from "@/app/admin/actions";
import { InstagramIcon, TikTokIcon } from "@/components/ui/social-icons";
import { badge, ui } from "@/components/ui/styles";
import type { CreatorHit } from "@/lib/creators/search";

const STATUS: Record<CreatorHit["status"], string> = { ACTIVE: "ativa", INACTIVE: "pausada", DEACTIVATED: "encerrada" };

/**
 * Busca de creator no painel inteiro (M0.5, D-SEARCH): botão no topo (ou Ctrl+K / ⌘K) abre a busca; cada resultado
 * entra na marca dela e abre a ficha.
 */
export function CreatorSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CreatorHit[] | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => start(async () => setHits(await searchCreatorsAction(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass flex items-center gap-2 rounded-full px-3 py-2 text-sm sm:px-4" aria-label="Buscar creator">
        <Search className="size-4" />
        <span className="hidden text-stone-500 lg:inline">Buscar creator</span>
        <kbd className="hidden rounded-md border border-stone-300/70 px-1.5 text-[11px] text-stone-500 lg:inline dark:border-white/15">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[10vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Buscar creator" className="glass flex w-full max-w-xl flex-col gap-3 rounded-3xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cupom, @, e-mail ou CPF" aria-label="Buscar creator" className={`${ui.input} pl-9`} />
              </label>
              <button type="button" onClick={() => setOpen(false)} className="glass grid size-9 shrink-0 place-content-center rounded-full" aria-label="Fechar">
                <X className="size-4" />
              </button>
            </div>
            {q.trim().length < 2 ? (
              <p className={`${ui.hint} px-1`}>Procura em todas as marcas do seu acesso. Escolha uma creator para abrir a ficha dela.</p>
            ) : hits === null || (pending && hits.length === 0) ? (
              <p className={`${ui.hint} px-1`}>Procurando…</p>
            ) : hits.length === 0 ? (
              <p className={`${ui.muted} px-1`}>Nenhuma creator encontrada.</p>
            ) : (
              <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.id}>
                    <form action={chooseBrandAction}>
                      <input type="hidden" name="slug" value={h.brand.slug} />
                      <input type="hidden" name="next" value={`/admin/creators/${h.id}`} />
                      <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/60 dark:hover:bg-white/10">
                        <span className="grid size-9 shrink-0 place-content-center rounded-full text-xs font-semibold text-white" style={{ background: h.brand.primaryColor }}>
                          {h.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="truncate font-medium">{h.name}</span>
                            {h.status !== "ACTIVE" && <span className={badge.neutral}>{STATUS[h.status]}</span>}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: h.brand.primaryColor }} />{h.brand.name}</span>
                            {h.coupon && <span className="font-mono font-semibold text-stone-700 dark:text-stone-300">{h.coupon}</span>}
                            {h.instagram && <span className="inline-flex items-center gap-1"><InstagramIcon className="size-3 text-pink-600" />{h.instagram.replace(/^@/, "")}</span>}
                            {h.tiktok && <span className="inline-flex items-center gap-1"><TikTokIcon className="size-3" />{h.tiktok.replace(/^@/, "")}</span>}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-stone-400" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
