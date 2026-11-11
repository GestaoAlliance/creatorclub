"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Abas dentro de uma tela (ex.: ficha da creator): o conteúdo de todas já vem do servidor e a aba só mostra uma de cada
 * vez, sem recarregar. `initial` abre uma aba direto (ex.: Extrato quando o endereço traz o mês). D-CREATORFILE: no
 * trilho de vidro com a gota da cor da marca (como as abas do grupo) e um link `#id-da-aba` abre a aba (ex.: os itens
 * de "O que falta" levam para Contrato ou Cadastro).
 */
export function Tabs({ tabs, initial }: { tabs: { id: string; label: string; badge?: string | number | null; content: ReactNode }[]; initial?: string | undefined }) {
  const [on, setOn] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const list = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ x: number; w: number } | null>(null);
  const ids = tabs.map((t) => t.id).join(",");

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (ids.split(",").includes(id)) {
        setOn(id);
        list.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [ids]);

  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el) return;
    const place = () => setDrop({ x: el.offsetLeft, w: el.offsetWidth });
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  return (
    <div className="flex flex-col gap-5">
      <div ref={list} role="tablist" className={`liquid-tabs scroll-mt-4 self-start ${drop ? "is-ready" : ""}`}>
        {drop && <span aria-hidden className="drop" style={{ width: drop.w, transform: `translateX(${drop.x}px)` }} />}
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={on === t.id} aria-controls={`panel-${t.id}`} onClick={() => setOn(t.id)}>
            {t.label}
            {t.badge !== undefined && t.badge !== null && <span className="ml-1.5 rounded-full bg-current/15 px-1.5 py-0.5 text-[11px] tabular-nums">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={on !== t.id} className="flex flex-col gap-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
