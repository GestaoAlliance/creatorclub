"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import type { NavItem } from "@/components/portal/nav";
import { activeTab } from "@/lib/staff/nav";

/**
 * Abas do grupo do menu (D-MENUGROUPS): no topo de cada tela, as outras telas do mesmo trabalho (ex.: Pagamentos →
 * Saques · Abertura · Conferência). Grupo de uma tela só não mostra abas. D-CREATORLIST: trilho de vidro com a gota
 * da cor da marca, que escorrega até a aba aberta (o componente fica no layout, então a gota anda entre as telas).
 */
export function SectionTabs({ items, base = "/admin" }: { items: NavItem[]; base?: string }) {
  const path = usePathname();
  const group = items.find((i) => i.tabs && activeTab(i.tabs, path, base));
  const on = group?.tabs ? activeTab(group.tabs, path, base) : null;
  const nav = useRef<HTMLElement>(null);
  const [drop, setDrop] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!el) return setDrop(null);
    const place = () => setDrop({ x: el.offsetLeft, w: el.offsetWidth });
    place();
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on, group?.label]);
  if (!group?.tabs || group.tabs.length < 2) return null;
  const current = group.tabs.find((t) => t.href === on);
  const about = current?.about;
  return (
    <div className="-mt-2">
      <nav ref={nav} aria-label={group.label} className={`liquid-tabs ${drop ? "is-ready" : ""}`}>
        {drop && <span aria-hidden className="drop" style={{ width: drop.w, transform: `translateX(${drop.x}px)` }} />}
        {group.tabs.map((t) => (
          <Link key={t.href} href={`${base}${t.href}`} aria-current={t.href === on ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {/* O que é a aba aberta (pedido do responsável, 2026-11-23: "não está intuitivo o que cada aba faz"). */}
      {about && <p className="mt-2 px-1 text-sm text-stone-600 dark:text-stone-300"><strong className="font-semibold text-stone-800 dark:text-stone-100">{current?.label}</strong> · {about}</p>}
    </div>
  );
}
