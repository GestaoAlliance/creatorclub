"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { badge, ui } from "@/components/ui/styles";

type Row = { id: string; name: string; status: string; statusLabel: string; fakeEmail: boolean; hasLogin: boolean; reviewed: boolean };

const STATUS_BADGE: Record<string, string> = { ACTIVE: badge.green, INACTIVE: badge.amber, DEACTIVATED: badge.neutral };

/** Lista de creators com busca por nome (no próprio navegador; a lista já vem filtrada pela permissão). */
export function CreatorList({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const shown = rows.filter((r) => norm(r.name).includes(norm(q)));
  return (
    <section className={ui.card}>
      <label className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar creator" aria-label="Buscar creator" className={`${ui.input} pl-9`} />
      </label>
      {shown.length === 0 ? (
        <p className={ui.muted}>Nenhuma creator encontrada.</p>
      ) : (
        <ul className={ui.list}>
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/creators/${c.id}`} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-sm font-semibold text-brand dark:bg-brand-2/15 dark:text-brand-2">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className={STATUS_BADGE[c.status] ?? badge.neutral}>{c.statusLabel}</span>
                    {c.hasLogin && <span className={badge.sky}>no portal</span>}
                    {c.reviewed && <span className={badge.green}>conferida</span>}
                    {c.fakeEmail && <span className={badge.amber}>e-mail a confirmar</span>}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-stone-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
