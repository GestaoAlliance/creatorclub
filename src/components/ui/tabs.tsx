"use client";

import { useState, type ReactNode } from "react";

/**
 * Abas dentro de uma tela (ex.: ficha da creator): o conteúdo de todas já vem do servidor e a aba só mostra uma de cada
 * vez, sem recarregar. `initial` abre uma aba direto (ex.: Extrato quando o endereço traz o mês).
 */
export function Tabs({ tabs, initial }: { tabs: { id: string; label: string; badge?: string | number | null; content: ReactNode }[]; initial?: string | undefined }) {
  const [on, setOn] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-stone-200/80 dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on === t.id}
            onClick={() => setOn(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              on === t.id ? "border-brand text-stone-900 dark:border-brand-2 dark:text-white" : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== null && <span className="ml-1.5 rounded-full bg-stone-500/15 px-1.5 py-0.5 text-xs tabular-nums">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={on !== t.id} className="flex flex-col gap-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
