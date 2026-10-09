"use client";

import { ChevronsLeft, House, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Itens do portal. Cada etapa da E7 acrescenta o seu (Vendas, Extrato, Cupom e link). */
const ITEMS: { href: string; label: string; Icon: LucideIcon }[] = [{ href: "", label: "Início", Icon: House }];

function useActive(base: string) {
  const path = usePathname();
  return (href: string) => (href === "" ? path === base : path.startsWith(`${base}${href}`));
}

/** Computador: barra lateral de vidro, recolhível (lembra a escolha neste navegador). */
export function SideNav({ base, brandName }: { base: string; brandName: string }) {
  const [open, setOpen] = useState(true);
  const isActive = useActive(base);
  useEffect(() => {
    try {
      if (localStorage.getItem("portal-nav") === "closed") setOpen(false);
    } catch {}
  }, []);
  function toggle() {
    setOpen(!open);
    try {
      localStorage.setItem("portal-nav", open ? "closed" : "open");
    } catch {}
  }
  return (
    <nav
      aria-label="Menu do portal"
      className={`glass sticky top-4 m-4 hidden h-[calc(100vh-2rem)] shrink-0 flex-col rounded-3xl p-2 transition-[width] duration-300 md:flex ${open ? "w-60" : "w-[4.5rem]"}`}
    >
      <div className="mb-6 flex items-center gap-3 p-2">
        <div className="grid size-10 shrink-0 place-content-center rounded-2xl bg-brand font-bold text-white shadow-sm">
          {brandName.slice(0, 1)}
        </div>
        {open && <span className="truncate font-semibold">{brandName}</span>}
      </div>
      <div className="flex flex-col gap-1">
        {ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={`${base}${href}`}
            title={label}
            className={`flex h-11 items-center rounded-2xl transition-colors ${
              isActive(href) ? "bg-brand text-white shadow-sm" : "text-stone-600 hover:bg-white/60 dark:text-stone-300 dark:hover:bg-white/10"
            }`}
          >
            <span className="grid w-14 shrink-0 place-content-center">
              <Icon className="size-5" />
            </span>
            {open && <span className="text-sm font-medium">{label}</span>}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Recolher menu" : "Abrir menu"}
        className="mt-auto flex h-11 items-center rounded-2xl text-stone-500 hover:bg-white/60 dark:hover:bg-white/10"
      >
        <span className="grid w-14 shrink-0 place-content-center">
          <ChevronsLeft className={`size-5 transition-transform ${open ? "" : "rotate-180"}`} />
        </span>
        {open && <span className="text-sm">Recolher</span>}
      </button>
    </nav>
  );
}

/** Celular: barra de vidro fixa embaixo, tipo app. */
export function BottomNav({ base }: { base: string }) {
  const isActive = useActive(base);
  return (
    <nav aria-label="Menu do portal" className="glass fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-3xl px-2 py-2 md:hidden">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={`${base}${href}`}
          className={`flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium ${
            isActive(href) ? "bg-brand text-white" : "text-stone-600 dark:text-stone-300"
          }`}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
