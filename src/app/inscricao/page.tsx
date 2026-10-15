import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { normalizeHunterCode } from "@/domain";
import { db } from "@/lib/db";
import { signupLinksFor } from "@/lib/onboarding/hunters";
import { PerksAndSteps, signupBrands } from "./hero";

export const dynamic = "force-dynamic";

// Inscrição (D-SIGNUPBRAND): um formulário por marca. Aqui a pessoa escolhe UMA marca e vai para o formulário dela.
// Código de hunter de uma marca só: vai direto ao formulário daquela marca.
export default async function SignupChooserPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const code = normalizeHunterCode(typeof h === "string" ? h : "") || null;
  const links = code ? await signupLinksFor(db(), code).catch(() => []) : [];
  if (links.length === 1) redirect(`/inscricao/${links[0]!.slug}?h=${encodeURIComponent(links[0]!.code)}`);
  const brands = await signupBrands();
  const only = links.length ? new Set(links.map((l) => l.slug)) : null;
  const shown = only ? brands.filter((b) => only.has(b.slug)) : brands;
  return (
    <div className="min-h-screen bg-stone-100 px-3 py-3 md:px-6 md:py-6 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="relative isolate overflow-hidden rounded-[2rem] bg-black px-6 pb-8 pt-6 text-white shadow-2xl md:px-12 md:pb-12 md:pt-8 dark:ring-1 dark:ring-white/10">
          {brands.map((b, i) => (
            <span
              key={b.name}
              aria-hidden
              className="orb pointer-events-none absolute -z-10 size-72 rounded-full opacity-50 blur-3xl md:size-96"
              style={{ background: b.color, left: `${[-12, 55, 20][i] ?? 0}%`, top: `${[-30, -20, 55][i] ?? 0}%`, animationDelay: `${i * -4}s` }}
            />
          ))}
          <div className="flex items-center justify-between">
            <p className="rise text-xs">
              <span className="font-bold tracking-[0.35em]">ALLIANCE</span>
              <span className="ml-2 text-white/50">Creator Club</span>
            </p>
            <ThemeToggle />
          </div>
          <h1 className="rise mt-10 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight [animation-delay:80ms] md:mt-14 md:text-[3.4rem]">
            Sua influência
            <span className="block">vale dinheiro.</span>
            <span className="block text-white/45">Comece pelo seu cupom.</span>
          </h1>
          <p className="rise mt-5 max-w-lg text-[15px] leading-relaxed text-white/70 [animation-delay:160ms]">
            Escolha a marca que você quer divulgar. Quem te segue ganha desconto, você ganha comissão em cada venda e acompanha tudo no
            seu portal.
          </p>
          <PerksAndSteps />
        </header>

        <section className="rise flex flex-col gap-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-stone-200 md:p-9 dark:bg-white/[0.03] dark:ring-white/10">
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Com qual marca você quer crescer?</h2>
            <p className="mt-0.5 text-sm text-stone-500">Cada marca tem o seu formulário. Escolha uma para começar.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {shown.map((b) => (
              <Link
                key={b.slug}
                href={code ? `/inscricao/${b.slug}?h=${encodeURIComponent(code)}` : `/inscricao/${b.slug}`}
                style={{ background: `linear-gradient(140deg, ${b.color}, color-mix(in srgb, ${b.color} 55%, black))` }}
                className="group flex min-h-36 flex-col justify-between rounded-3xl p-5 text-white shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Creator Club</span>
                <span className="flex items-end justify-between gap-2">
                  <span className="text-2xl font-semibold tracking-tight">{b.name}</span>
                  <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>
        <p className="pb-6 text-center text-xs text-stone-500">
          <span className="font-bold tracking-[0.3em] text-stone-700 dark:text-stone-300">ALLIANCE</span> · Creator Club
        </p>
      </div>
    </div>
  );
}
