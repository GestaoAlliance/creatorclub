import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { normalizeHunterCode } from "@/domain";
import { SignupForm } from "../form";
import { signupBrands } from "../hero";

export const dynamic = "force-dynamic";

// Cadastro de creator de uma marca (D-SIGNUPACCOUNT, no modelo da referência do responsável): um cartão com a marca na
// cor dela (D-BRANDCOLOR) e o formulário. O link do hunter (/i/[codigo]) traz ?h=código.
export default async function BrandSignupPage({ params, searchParams }: { params: Promise<{ marca: string }>; searchParams: Promise<{ h?: string }> }) {
  const [{ marca }, { h }] = await Promise.all([params, searchParams]);
  const brand = (await signupBrands()).find((b) => b.slug === marca.toLowerCase());
  if (!brand) notFound();
  const code = normalizeHunterCode(typeof h === "string" ? h : "") || null;
  return (
    <div
      style={{ "--b": brand.color } as CSSProperties}
      className="min-h-screen bg-gradient-to-b from-[color-mix(in_srgb,var(--b)_5%,#f8fafc)] to-[#f1f5f9] px-4 py-8 md:py-12 dark:from-black dark:to-black"
    >
      <main className="mx-auto w-full max-w-xl rounded-2xl border border-stone-200 bg-white px-5 py-8 shadow-sm sm:px-8 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <header className="mb-8 flex flex-col items-center gap-2 text-center">
          <p className="text-3xl font-black uppercase tracking-tight text-[var(--b)] dark:text-[color-mix(in_srgb,var(--b)_50%,white)]">{brand.name}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cadastro de creator</h1>
          <p className="text-sm text-stone-500">Crie sua conta para acessar o portal.</p>
        </header>
        <SignupForm hunterCode={code} brand={brand} />
      </main>
      <p className="py-6 text-center text-xs text-stone-500">
        <span className="font-bold uppercase tracking-[0.3em] text-stone-700 dark:text-stone-300">{brand.name}</span> · Creator Club ·{" "}
        <span className="font-bold tracking-[0.3em]">ALLIANCE</span>
      </p>
    </div>
  );
}
