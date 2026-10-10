"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { badge, ui } from "@/components/ui/styles";

type Row = {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  fakeEmail: boolean;
  hasLogin: boolean;
  reviewed: boolean;
  contract: { status: "NONE" | "ACTIVE" | "EXPIRING" | "EXPIRED"; daysLeft: number | null };
  idle: { days: number; idle: boolean; lastSaleDay: string | null } | null;
  ugcCycle: { count: number; goal: number; status: "NO_CONTRACT" | "OPEN" | "DONE" | "MISSED" } | null;
};

/** Selo dos vídeos da UGC no ciclo (D-UGCVIDEOS). */
function UgcBadge({ c }: { c: NonNullable<Row["ugcCycle"]> }) {
  if (c.status === "NO_CONTRACT") return <span className={badge.amber}>vídeos: sem datas do contrato</span>;
  const cls = c.status === "DONE" ? badge.green : c.status === "MISSED" ? badge.red : badge.neutral;
  return <span className={cls}>vídeos {c.count}/{c.goal}{c.status === "MISSED" ? " · meta não batida" : ""}</span>;
}

const STATUS_BADGE: Record<string, string> = { ACTIVE: badge.green, INACTIVE: badge.amber, DEACTIVATED: badge.neutral };

/** Lista de creators com busca por nome (no próprio navegador; a lista já vem filtrada pela permissão). */
export function CreatorList({ rows, contractsOnly = false, idleOnly = false }: { rows: Row[]; contractsOnly?: boolean; idleOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [onlyContracts, setOnlyContracts] = useState(contractsOnly);
  const [onlyIdle, setOnlyIdle] = useState(idleOnly);
  const isIdle = (r: Row) => r.idle?.idle === true;
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const warn = (r: Row) => r.status !== "DEACTIVATED" && (r.contract.status === "EXPIRING" || r.contract.status === "EXPIRED");
  const shown = rows.filter((r) => norm(r.name).includes(norm(q)) && (!onlyContracts || warn(r)) && (!onlyIdle || isIdle(r)));
  return (
    <section className={ui.card}>
      <label className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar creator" aria-label="Buscar creator" className={`${ui.input} pl-9`} />
      </label>
      {rows.some(warn) && (
        <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={onlyContracts} onChange={(e) => setOnlyContracts(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Só contratos vencendo ou vencidos
        </label>
      )}
      {rows.some(isIdle) && (
        <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={onlyIdle} onChange={(e) => setOnlyIdle(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Só ativas há 60 dias ou mais sem vender
        </label>
      )}
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
                    {c.status !== "DEACTIVATED" && c.contract.status === "EXPIRING" && (
                      <span className={badge.amber}>contrato vence em {c.contract.daysLeft} {c.contract.daysLeft === 1 ? "dia" : "dias"}</span>
                    )}
                    {c.status !== "DEACTIVATED" && c.contract.status === "EXPIRED" && <span className={badge.red}>contrato vencido</span>}
                    {c.ugcCycle && c.status !== "DEACTIVATED" && <UgcBadge c={c.ugcCycle} />}
                    {c.idle?.idle && (
                      <span className={badge.amber}>{c.idle.lastSaleDay ? `sem vender há ${c.idle.days} dias` : `nunca vendeu · ${c.idle.days} dias`}</span>
                    )}
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
