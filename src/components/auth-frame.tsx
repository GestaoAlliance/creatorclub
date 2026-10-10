import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { db } from "@/lib/db";
import { brandCssVars } from "@/lib/portal/context";

/** Cor das telas de entrada (D-LOGINCOLOR): com uma marca só, a cor dela; com várias, o cinza neutro. */
async function loginColors(): Promise<Record<string, string>> {
  try {
    const brands = await db().brand.findMany({ take: 2, select: { primaryColor: true, secondaryColor: true } });
    return brands.length === 1 ? brandCssVars(brands[0]!) : {};
  } catch {
    return {};
  }
}

/** Moldura das telas de entrada (entrar, senha, convite): o mesmo vidro do sistema, centralizado (D-DESIGNALL). */
export async function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const vars = await loginColors();
  return (
    <div style={vars as CSSProperties} className="portal-bg flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-content-center rounded-2xl bg-brand text-lg font-bold text-white shadow-sm">C</div>
        <span className="text-lg font-semibold tracking-tight">Creator Club</span>
      </div>
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
