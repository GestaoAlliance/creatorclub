import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BrandSwitchOption } from "./brand-switch";
import { signOut } from "@/app/entrar/actions";
import { BottomNav, SideNav, type NavItem } from "@/components/portal/nav";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { brandCssVars } from "@/lib/portal/context";
import type { StaffBrand } from "@/lib/staff/context";

/** Moldura do painel da equipe: a mesma do portal (D-DESIGNALL), com o menu do papel e a cor da marca escolhida. */
export function StaffShell({
  brand,
  brands,
  firstName,
  isCreator,
  items,
  children,
}: {
  brand: StaffBrand | null;
  brands: StaffBrand[];
  firstName: string;
  isCreator: boolean;
  items: NavItem[];
  children: ReactNode;
}) {
  const vars = brand ? brandCssVars(brand) : {};
  const others = brands.filter((b) => b.slug !== brand?.slug);
  return (
    <div style={vars as CSSProperties} className="portal-bg flex min-h-screen">
      <SideNav base="/admin" brandName="Creator Club" items={items} />
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-4 md:px-6 md:pb-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-2">Alliance{brand ? ` · ${brand.name}` : ""}</p>
            <p className="truncate text-lg font-semibold">Olá, {firstName}</p>
          </div>
          <div className="flex items-center gap-2">
            {brand && (
              <details className="relative">
                <summary className="glass flex cursor-pointer list-none items-center gap-2 rounded-full px-4 py-2 text-sm">
                  <span className="size-3 rounded-full" style={{ background: brandCssVars(brand)["--brand"] }} />
                  {brand.name}
                  {others.length > 0 && <ChevronDown className="size-3.5 text-stone-500" />}
                </summary>
                <div className="glass absolute right-0 z-30 mt-2 flex min-w-48 flex-col rounded-2xl p-2">
                  <p className="px-3 pb-1 pt-2 text-xs text-stone-500">{others.length ? "Trocar de marca" : "Única marca do seu acesso"}</p>
                  {others.map((b) => (
                    <BrandSwitchOption key={b.slug} slug={b.slug} name={b.name} color={brandCssVars(b)["--brand"] ?? b.primaryColor} />
                  ))}
                </div>
              </details>
            )}
            {isCreator && (
              <Link href="/portal" className="glass hidden rounded-full px-4 py-2 text-sm sm:block">Meu portal</Link>
            )}
            <ThemeToggle />
            <form action={signOut}>
              <button className="glass rounded-full px-4 py-2 text-sm">Sair</button>
            </form>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6">{children}</main>
      </div>
      <BottomNav base="/admin" items={items} />
    </div>
  );
}
