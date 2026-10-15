import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { normalizeHunterCode } from "@/domain";
import { SignupForm } from "../form";
import { PerksAndSteps, signupBrands } from "../hero";

export const dynamic = "force-dynamic";

// Formulário de uma marca (D-SIGNUPBRAND): a identidade da marca (cores do cadastro, D-BRANDCOLOR) e a candidatura
// fica só nela. O link do hunter (/i/[codigo]) traz ?h=código.
export default async function BrandSignupPage({ params, searchParams }: { params: Promise<{ marca: string }>; searchParams: Promise<{ h?: string }> }) {
  const [{ marca }, { h }] = await Promise.all([params, searchParams]);
  const brand = (await signupBrands()).find((b) => b.slug === marca.toLowerCase());
  if (!brand) notFound();
  const code = normalizeHunterCode(typeof h === "string" ? h : "") || null;
  const accent = brand.accent ?? "#ffffff";
  return (
    <div style={{ "--b": brand.color } as CSSProperties} className="min-h-screen bg-[color-mix(in_srgb,var(--b)_6%,#f5f5f4)] px-3 py-3 md:px-6 md:py-6 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header
          style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${brand.color} 92%, black), color-mix(in srgb, ${brand.color} 50%, black))` }}
          className="relative isolate overflow-hidden rounded-[2rem] px-6 pb-8 pt-6 text-white shadow-2xl md:px-12 md:pb-12 md:pt-8"
        >
          {[0, 1].map((i) => (
            <span
              key={i}
              aria-hidden
              className="orb pointer-events-none absolute -z-10 size-72 rounded-full opacity-30 blur-3xl md:size-96"
              style={{ background: i === 0 ? accent : brand.color, left: `${[55, -15][i]}%`, top: `${[-35, 50][i]}%`, animationDelay: `${i * -5}s` }}
            />
          ))}
          <div className="flex items-center justify-between">
            <p className="rise text-xs">
              <span className="font-bold uppercase tracking-[0.35em]">{brand.name}</span>
              <span className="ml-2 text-white/60">Creator Club</span>
            </p>
            <ThemeToggle />
          </div>
          <h1 className="rise mt-10 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight [animation-delay:80ms] md:mt-14 md:text-[3.4rem]">
            Sua influência
            <span className="block">vale dinheiro.</span>
            <span className="block text-white/55">Comece pelo seu cupom.</span>
          </h1>
          <p className="rise mt-5 max-w-lg text-[15px] leading-relaxed text-white/80 [animation-delay:160ms]">
            Divulgue a {brand.name} com um cupom só seu. Quem te segue ganha desconto, você ganha comissão em cada venda e acompanha tudo
            no seu portal.
          </p>
          <PerksAndSteps />
        </header>
        <SignupForm hunterCode={code} brand={brand} />
        <p className="pb-6 text-center text-xs text-stone-500">
          <span className="font-bold uppercase tracking-[0.3em] text-stone-700 dark:text-stone-300">{brand.name}</span> · Creator Club ·{" "}
          <span className="font-bold tracking-[0.3em]">ALLIANCE</span>
        </p>
      </div>
    </div>
  );
}
