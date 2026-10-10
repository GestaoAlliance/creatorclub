import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { normalizeHunterCode } from "@/domain";
import { db } from "@/lib/db";
import { brandCssVars } from "@/lib/portal/context";
import { SignupForm } from "./form";

export const dynamic = "force-dynamic";

// Inscrição pública (D-SIGNUP): qualquer pessoa preenche; vira candidata em /admin/candidatas. Link do hunter traz ?h=código.
export default async function SignupPage({ params, searchParams }: { params: Promise<{ marca: string }>; searchParams: Promise<{ h?: string }> }) {
  const { marca } = await params;
  const { h } = await searchParams;
  const brand = await db().brand.findUnique({ where: { slug: marca.toLowerCase() }, select: { slug: true, name: true, primaryColor: true, secondaryColor: true, archivedAt: true } });
  if (!brand || brand.archivedAt) notFound();
  const code = normalizeHunterCode(typeof h === "string" ? h : "") || null;
  return (
    <div style={brandCssVars(brand) as CSSProperties} className="portal-bg min-h-screen px-4 py-8 md:py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-content-center rounded-2xl bg-brand text-lg font-bold text-white shadow-sm">{brand.name.slice(0, 1)}</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-2">{brand.name} · Creator Club</p>
            <h1 className="text-2xl font-semibold tracking-tight">Inscrição de creators</h1>
          </div>
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Quer divulgar a {brand.name} com o seu próprio cupom? Preencha a inscrição abaixo. A equipe analisa e fala com você
          pelo WhatsApp.
        </p>
        <main className="glass rounded-3xl p-5 md:p-8">
          <SignupForm marca={brand.slug} brandName={brand.name} hunterCode={code} />
        </main>
      </div>
    </div>
  );
}
