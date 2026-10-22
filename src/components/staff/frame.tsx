"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { signOut } from "@/app/entrar/actions";
import { BottomNav, SideNav, type NavItem } from "@/components/portal/nav";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { TourButton, TutorialProvider } from "@/components/ui/tour";
import { brandCssVars } from "@/lib/portal/context";
import type { StaffBrand } from "@/lib/staff/context";
import { ALLIANCE_PATHS } from "@/lib/staff/nav";
import { BrandSwitchOption } from "./brand-switch";
import { SectionTabs } from "./section-tabs";

const ALLIANCE_COLORS = { primaryColor: "#18181B", secondaryColor: null };

/**
 * Moldura da equipe em dois níveis (A1, D-ALLIANCE). No painel da Alliance: só as marcas (e o cadastro e a equipe,
 * para o super admin), em cor neutra. Dentro de uma marca: o nome e a cor dela, o "Alliance" para voltar e as telas.
 */
export function StaffFrame(p: {
  brand: StaffBrand | null;
  brands: StaffBrand[];
  firstName: string;
  isCreator: boolean;
  alliance: boolean;
  brandItems: NavItem[];
  allianceItems: NavItem[];
  children: ReactNode;
}) {
  const path = usePathname();
  const inAlliance = p.alliance && ALLIANCE_PATHS.includes(path);
  const items: NavItem[] = inAlliance ? p.allianceItems : p.alliance ? [{ href: "", label: "Alliance", icon: "grid" }, ...p.brandItems] : p.brandItems;
  const vars = inAlliance || !p.brand ? brandCssVars(ALLIANCE_COLORS) : brandCssVars(p.brand);
  const others = p.brands.filter((b) => b.slug !== p.brand?.slug);
  return (
    <div style={vars as CSSProperties} className="portal-bg flex min-h-screen">
      <SideNav base="/admin" brandName={inAlliance ? "Alliance" : (p.brand?.name ?? "Creator Club")} items={items} />
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-4 md:px-6 md:pb-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-2">
              {inAlliance ? "Creator Club · Alliance" : `Alliance · ${p.brand?.name ?? ""}`}
            </p>
            <p className="truncate text-lg font-semibold">Olá, {p.firstName}</p>
          </div>
          <div className="flex items-center gap-2">
            {!inAlliance && p.brand && (
              <details className="relative">
                <summary className="glass flex cursor-pointer list-none items-center gap-2 rounded-full px-4 py-2 text-sm">
                  <span className="size-3 rounded-full" style={{ background: brandCssVars(p.brand)["--brand"] }} />
                  {p.brand.name}
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
            {p.isCreator && <Link href="/portal" className="glass hidden rounded-full px-4 py-2 text-sm sm:block">Meu portal</Link>}
            <TourButton />
            <ThemeToggle />
            <form action={signOut}>
              <button className="glass rounded-full px-4 py-2 text-sm">Sair</button>
            </form>
          </div>
        </header>
        {/* D-TUTORIAL: passo a passo no primeiro acesso às telas da rotina de cada papel. */}
        <TutorialProvider ugc={false} auto>
          <main className="flex flex-1 flex-col gap-6">
            {!inAlliance && <SectionTabs items={items} />}
            {p.children}
          </main>
        </TutorialProvider>
      </div>
      <BottomNav base="/admin" items={items} />
    </div>
  );
}
