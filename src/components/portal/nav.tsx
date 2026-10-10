"use client";

import {
  Banknote,
  ChevronsLeft,
  ClipboardCheck,
  Download,
  Ellipsis,
  House,
  Package,
  RefreshCw,
  Scale,
  ShoppingBag,
  Ticket,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Ícones do menu por nome (o servidor manda só o nome; componentes não atravessam para o navegador). */
const ICONS = {
  home: House,
  sales: ShoppingBag,
  coupon: Ticket,
  wallet: Wallet,
  package: Package,
  creators: Users,
  review: ClipboardCheck,
  payout: Banknote,
  opening: Scale,
  team: UsersRound,
  sync: RefreshCw,
  import: Download,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: NavIcon };

/** Menu do portal da creator (D-E7ORDER). */
export const PORTAL_ITEMS: NavItem[] = [
  { href: "", label: "Início", icon: "home" },
  { href: "/vendas", label: "Vendas", icon: "sales" },
  { href: "/cupom", label: "Cupom", icon: "coupon" },
  { href: "/saque", label: "Saque", icon: "wallet" },
  { href: "/envios", label: "Envios", icon: "package" },
];

function useActive(base: string) {
  const path = usePathname();
  return (href: string) => (href === "" ? path === base : path === `${base}${href}` || path.startsWith(`${base}${href}/`));
}

/** Computador: barra lateral de vidro, recolhível (lembra a escolha neste navegador). */
export function SideNav({ base, brandName, items }: { base: string; brandName: string; items: NavItem[] }) {
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
      aria-label="Menu"
      className={`glass sticky top-4 m-4 hidden h-[calc(100vh-2rem)] shrink-0 flex-col rounded-3xl p-2 transition-[width] duration-300 md:flex ${open ? "w-60" : "w-[4.5rem]"}`}
    >
      <div className="mb-6 flex items-center gap-3 p-2">
        <div className="grid size-10 shrink-0 place-content-center rounded-2xl bg-brand font-bold text-white shadow-sm">
          {brandName.slice(0, 1)}
        </div>
        {open && <span className="truncate font-semibold">{brandName}</span>}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {items.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          return (
            <Link
              key={href}
              href={`${base}${href}`}
              title={label}
              className={`flex h-11 shrink-0 items-center rounded-2xl transition-colors ${
                isActive(href) ? "bg-brand text-white shadow-sm" : "text-stone-600 hover:bg-white/60 dark:text-stone-300 dark:hover:bg-white/10"
              }`}
            >
              <span className="grid w-14 shrink-0 place-content-center">
                <Icon className="size-5" />
              </span>
              {open && <span className="truncate text-sm font-medium">{label}</span>}
            </Link>
          );
        })}
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

/** Celular: barra de vidro fixa embaixo, tipo app. Mais de 5 itens: os 4 primeiros e "Mais" com o resto. */
export function BottomNav({ base, items }: { base: string; items: NavItem[] }) {
  const isActive = useActive(base);
  const [more, setMore] = useState(false);
  const path = usePathname();
  useEffect(() => setMore(false), [path]);
  const main = items.length > 5 ? items.slice(0, 4) : items;
  const rest = items.length > 5 ? items.slice(4) : [];
  const cls = (on: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-medium ${on ? "bg-brand text-white" : "text-stone-600 dark:text-stone-300"}`;
  return (
    <>
      {more && (
        <div className="glass fixed inset-x-3 bottom-[5.5rem] z-20 flex flex-col gap-1 rounded-3xl p-2 md:hidden">
          {rest.map(({ href, label, icon }) => {
            const Icon = ICONS[icon];
            return (
              <Link key={href} href={`${base}${href}`} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${isActive(href) ? "bg-brand text-white" : ""}`}>
                <Icon className="size-5" /> {label}
              </Link>
            );
          })}
        </div>
      )}
      <nav aria-label="Menu" className="glass fixed inset-x-3 bottom-3 z-20 flex gap-1 rounded-3xl px-2 py-2 md:hidden">
        {main.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          return (
            <Link key={href} href={`${base}${href}`} className={cls(isActive(href))}>
              <Icon className="size-5" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className={cls(more || rest.some((i) => isActive(i.href)))}>
            <Ellipsis className="size-5" />
            Mais
          </button>
        )}
      </nav>
    </>
  );
}
