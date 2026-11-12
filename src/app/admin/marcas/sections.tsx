"use client";

import { Check, CircleAlert } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { BrandForm, BrandImage, ContractLockForm, type BrandSection } from "./forms";

export type SectionItem = { id: BrandSection | "contrato" | "login"; label: string; done: boolean | null; hint: string };

/**
 * Marca em seções com checklist (D-SETTINGSBOARD): índice com ✓ ou "falta" ao lado (abas no celular) e só a seção
 * escolhida aberta. Abre na primeira que falta.
 */
export function BrandSections({ items, form, lock, logo }: { items: SectionItem[]; form: Omit<React.ComponentProps<typeof BrandForm>, "section">; lock: { brandId: string; on: boolean; waiting: number }; logo: { brandId: string; slug: string; version: string | null } }) {
  const [cur, setCur] = useState(items.find((i) => i.done === false)?.id ?? items[0]!.id);
  const item = items.find((i) => i.id === cur)!;
  return (
    <div className="@container">
      <div className="grid gap-4 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Seções da marca" className="flex gap-1.5 overflow-x-auto pb-1 @3xl:flex-col @3xl:overflow-visible @3xl:pb-0">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-current={cur === i.id ? "true" : undefined}
              onClick={() => setCur(i.id)}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm transition ${cur === i.id ? "bg-brand font-semibold text-white shadow-sm dark:bg-brand-2 dark:text-stone-900" : "liquid-tile hover:-translate-y-0.5"}`}
            >
              <span className="truncate">{i.label}</span>
              {i.done === true && <Check className={`size-4 shrink-0 ${cur === i.id ? "" : "text-emerald-600"}`} />}
              {i.done === false && <CircleAlert className={`size-4 shrink-0 ${cur === i.id ? "" : "text-amber-600"}`} />}
            </button>
          ))}
        </nav>
        <section className="glass flex min-w-0 flex-col gap-3 rounded-3xl p-4 md:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {item.label}
              {item.done === false && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200">falta</span>}
            </h2>
            <p className="text-sm text-stone-500">{item.hint}</p>
          </div>
          {/* O formulário fica montado (o que foi digitado não se perde ao trocar de seção); só a seção escolhida aparece. */}
          <div hidden={cur === "contrato" || cur === "login"}>
            <BrandForm {...form} section={cur === "contrato" || cur === "login" ? "dados" : cur} />
          </div>
          {cur === "contrato" && <ContractLockForm brandId={lock.brandId} on={lock.on} waiting={lock.waiting} />}
          {cur === "login" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-stone-500">
                Aparece em <Link href={`/entrar?marca=${logo.slug}`} target="_blank" className="font-medium underline">/entrar?marca={logo.slug}</Link> (link das boas-vindas) e quando a creator volta para o portal da marca.
              </p>
              <BrandImage brandId={logo.brandId} slug={logo.slug} kind="LOGO" label="Logo" hint="PNG, JPG ou WebP, até 300 KB. Fundo transparente fica melhor." version={logo.version} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
