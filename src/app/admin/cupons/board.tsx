"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { badge, ui } from "@/components/ui/styles";
import { ClassifyForm, OwnerForm, RateForm } from "./forms";

type Row = {
  id: string;
  code: string;
  kind: "CREATOR" | "PROMO" | null;
  uses: number;
  owner: { creatorId: string; name: string; confirmed: boolean } | null;
  rate: { policyId: string; rateBps: number; confirmed: boolean } | null;
};
type Creator = { id: string; name: string; status: string };
type Tab = "pending" | "creator" | "promo";

const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;

/** Algo a fazer neste cupom: sem tipo, ou de creator com dona ou taxa a confirmar. */
const isPending = (r: Row) => r.kind === null || (r.kind === "CREATOR" && (!r.owner?.confirmed || !r.rate?.confirmed));

/**
 * Cupons separados em abas (D-COUPONTABS): "A conferir" (o que pede ação), "Creators" e "Promocionais", com busca.
 * Trocar o tipo de um cupom já conferido fica escondido em "Trocar tipo", para não poluir a lista.
 */
export function CouponsBoard({ rows, creators }: { rows: Row[]; creators: Creator[] }) {
  const pending = rows.filter(isPending);
  const creatorRows = rows.filter((r) => r.kind === "CREATOR" && !isPending(r));
  const promoRows = rows.filter((r) => r.kind === "PROMO");
  const [tab, setTab] = useState<Tab>(pending.length > 0 ? "pending" : "creator");
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const match = (r: Row) => !q || norm(r.code).includes(norm(q)) || (r.owner && norm(r.owner.name).includes(norm(q)));
  const list = (tab === "pending" ? pending : tab === "creator" ? creatorRows : promoRows).filter(match);

  const tabs: [Tab, string, number][] = [
    ["pending", "A conferir", pending.length],
    ["creator", "Creators", creatorRows.length],
    ["promo", "Promocionais", promoRows.length],
  ];

  return (
    <section className={ui.card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tipo de cupom" className="flex flex-wrap gap-2">
          {tabs.map(([key, label, n]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={tab === key ? ui.pillOn : ui.pill}>
              {label} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          ))}
        </nav>
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cupom ou dona" aria-label="Buscar cupom ou dona" className={`${ui.inputSm} w-full pl-9`} />
        </label>
      </div>

      {list.length === 0 && <p className={ui.muted}>{tab === "pending" && !q ? "Nada a conferir. Tudo certo por aqui." : "Nenhum cupom encontrado."}</p>}

      {tab === "pending" && list.length > 0 && (
        <ul className={ui.list}>
          {list.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold">{r.code}</span>
                <span className={ui.hint}>{r.uses} pedidos</span>
              </div>
              {r.kind === null ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-stone-600 dark:text-stone-400">De creator ou promocional da loja?</span>
                  <ClassifyForm couponId={r.id} kind={r.kind} />
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-stone-500">Dona</span>
                    {r.owner?.confirmed ? (
                      <span className="text-sm">{r.owner.name} <span className={badge.green}>confirmada</span></span>
                    ) : (
                      <OwnerForm couponId={r.id} currentCreatorId={r.owner?.creatorId ?? null} needsSince={!r.owner} creators={creators} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-stone-500">Taxa</span>
                    {!r.rate ? (
                      <span className={ui.hint}>confirme a dona primeiro</span>
                    ) : r.rate.confirmed ? (
                      <span className="text-sm">{pct(r.rate.rateBps)} <span className={badge.green}>confirmada</span></span>
                    ) : (
                      <RateForm policyId={r.rate.policyId} rateBps={r.rate.rateBps} />
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "creator" && list.length > 0 && (
        <ul className={ui.list}>
          {list.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 md:grid-cols-[9rem_1fr_3rem_6rem]">
              <span className="font-mono text-sm font-semibold">{r.code}</span>
              <span className="text-right text-sm font-semibold tabular-nums md:order-3">{pct(r.rate!.rateBps)}</span>
              <Link href={`/admin/creators/${r.owner!.creatorId}`} className="min-w-0 truncate text-sm text-stone-600 hover:underline md:order-2 md:text-stone-900 dark:text-stone-300 md:dark:text-stone-100">{r.owner!.name}</Link>
              <span className="text-right text-xs tabular-nums text-stone-500 md:order-4">{r.uses} pedidos</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "promo" && list.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={r.id} className={`${ui.inset} flex items-center justify-between gap-2 py-2.5`}>
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-semibold">{r.code}</span>
                <span className={ui.hint}>{r.uses} pedidos</span>
              </span>
              <details className="relative">
                <summary className="cursor-pointer list-none text-xs text-stone-500 hover:underline">Trocar tipo</summary>
                <div className="glass absolute right-0 z-10 mt-2 rounded-2xl p-3">
                  <ClassifyForm couponId={r.id} kind={r.kind} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
