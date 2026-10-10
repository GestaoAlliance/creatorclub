import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { chooseBrandAction } from "@/app/admin/actions";
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
      <SideNav base="/admin" brandName={brand?.name ?? "Creator Club"} items={items} />
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-4 md:px-6 md:pb-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-2">{brand?.name ?? "Creator Club"} · equipe</p>
            <p className="truncate text-lg font-semibold">Olá, {firstName}</p>
          </div>
          <div className="flex items-center gap-2">
            {others.length > 0 && (
              <details className="relative">
                <summary className="glass cursor-pointer list-none rounded-full px-4 py-2 text-sm">Trocar marca</summary>
                <div className="glass absolute right-0 z-30 mt-2 flex min-w-40 flex-col rounded-2xl p-2">
                  {others.map((b) => (
                    <form key={b.slug} action={chooseBrandAction}>
                      <input type="hidden" name="slug" value={b.slug} />
                      <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/60 dark:hover:bg-white/10">
                        <span className="size-3 rounded-full" style={{ background: brandCssVars(b)["--brand"] }} />
                        {b.name}
                      </button>
                    </form>
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
