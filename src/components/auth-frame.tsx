import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { db } from "@/lib/db";
import { loginBrand } from "@/lib/brands/assets";
import { brandCssVars } from "@/lib/portal/context";

/** Cor das telas de entrada (D-LOGINCOLOR): com uma marca só, a cor dela; com várias, o cinza neutro. */
async function loginColors(): Promise<Record<string, string>> {
  try {
    const brands = await db().brand.findMany({ where: { archivedAt: null }, take: 2, select: { primaryColor: true, secondaryColor: true } });
    return brands.length === 1 ? brandCssVars(brands[0]!) : {};
  } catch {
    return {};
  }
}

/**
 * Moldura das telas de entrada (entrar, senha, convite): o mesmo vidro do sistema, centralizado (D-DESIGNALL). Com a
 * marca (M4.4a, D-BRANDLOGIN): a cor, o logo e a imagem de fundo dela (sem imagem, o de sempre).
 */
export async function AuthFrame({ title, subtitle, children, brandSlug = null }: { title: string; subtitle?: string; children: ReactNode; brandSlug?: string | null }) {
  const brand = brandSlug ? await loginBrand(db(), brandSlug).catch(() => null) : null;
  const vars = brand ? brandCssVars(brand) : await loginColors();
  const bg = brand?.background ? { backgroundImage: `linear-gradient(rgb(0 0 0 / 0.25), rgb(0 0 0 / 0.25)), url(/marca/${brand.slug}/fundo?v=${brand.background})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
  return (
    <div style={{ ...vars, ...bg } as CSSProperties} className="portal-bg flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      {brand?.logo ? (
        <div className="mb-6 flex items-center rounded-2xl bg-white/90 px-5 py-3 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/marca/${brand.slug}/logo?v=${brand.logo}`} alt={brand.name} className="max-h-14 max-w-56 object-contain" />
        </div>
      ) : (
        <div className={`mb-6 flex items-center gap-3 ${brand?.background ? "glass rounded-2xl px-4 py-2" : ""}`}>
          <div className="grid size-11 place-content-center rounded-2xl bg-brand text-lg font-bold text-white shadow-sm">{brand ? brand.name.slice(0, 1).toUpperCase() : "C"}</div>
          <span className="text-lg font-semibold tracking-tight">{brand ? brand.name : "Creator Club"}</span>
        </div>
      )}
      <main className="glass flex w-full max-w-sm flex-col gap-5 rounded-3xl p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-stone-600 dark:text-stone-400">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
