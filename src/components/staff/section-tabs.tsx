"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/components/portal/nav";
import { activeTab } from "@/lib/staff/nav";

/**
 * Abas do grupo do menu (D-MENUGROUPS): no topo de cada tela, as outras telas do mesmo trabalho (ex.: Pagamentos →
 * Saques · Abertura · Conferência). Grupo de uma tela só não mostra abas.
 */
export function SectionTabs({ items, base = "/admin" }: { items: NavItem[]; base?: string }) {
  const path = usePathname();
  const group = items.find((i) => i.tabs && activeTab(i.tabs, path, base));
  if (!group?.tabs || group.tabs.length < 2) return null;
  const on = activeTab(group.tabs, path, base);
  return (
    <nav aria-label={group.label} className="-mt-2 flex gap-1 overflow-x-auto pb-1">
      {group.tabs.map((t) => (
        <Link
          key={t.href}
          href={`${base}${t.href}`}
          aria-current={t.href === on ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            t.href === on ? "bg-brand text-white shadow-sm" : "glass text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
