import { ThemeToggle } from "@/components/portal/theme-toggle";
import { normalizeHunterCode, SIGNUP_BRANDS, signupBrandSlug } from "@/domain";
import { db } from "@/lib/db";
import { SignupForm, type SignupBrand } from "./form";

export const dynamic = "force-dynamic";

/** Cor de cada marca da inscrição, lida do banco (D-BRANDCOLOR); sem banco, um cinza neutro. */
async function brandColors(): Promise<SignupBrand[]> {
  const slugs = SIGNUP_BRANDS.map(signupBrandSlug);
  const rows = await db()
    .brand.findMany({ where: { slug: { in: slugs } }, select: { slug: true, primaryColor: true } })
    .catch(() => []);
  const color = new Map(rows.map((r) => [r.slug, r.primaryColor]));
  return SIGNUP_BRANDS.map((name) => ({ name, color: color.get(signupBrandSlug(name)) ?? "#78716c" }));
}

const STEPS = [
  ["Inscreva-se", "Uma página só, uns 5 minutos."],
  ["Análise", "A equipe confere o seu perfil e chama no WhatsApp."],
  ["Aprovada", "Você recebe o seu cupom e o acesso ao portal."],
] as const;

// Inscrição pública (D-SIGNUP, D-SIGNUPDESIGN): base preto e branco da Alliance com detalhes na cor de cada marca.
// Vira candidata em /admin/candidatas. O link do hunter (/i/[codigo]) traz ?h=código.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const code = normalizeHunterCode(typeof h === "string" ? h : "") || null;
  const brands = await brandColors();
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
          <h1 className="rise mt-10 max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight [animation-delay:80ms] md:mt-14 md:text-6xl">
            Divulgue marcas que você usa.
            <span className="block text-white/45">Com o seu cupom.</span>
          </h1>
          <p className="rise mt-5 max-w-lg text-[15px] leading-relaxed text-white/70 [animation-delay:160ms]">
            Uma inscrição só para {brands.map((b) => b.name).join(", ").replace(/, ([^,]*)$/, " e $1")}. A equipe da Alliance analisa e fala com você
            pelo WhatsApp.
          </p>
          <ul className="rise mt-6 flex flex-wrap gap-2 [animation-delay:240ms]">
            {brands.map((b) => (
              <li key={b.name} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm backdrop-blur">
                <span className="size-2.5 rounded-full ring-2 ring-white/20" style={{ background: b.color }} />
                {b.name}
              </li>
            ))}
          </ul>
          <ol className="rise mt-10 grid gap-3 [animation-delay:320ms] sm:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
                <span className="text-xs font-semibold tabular-nums text-white/40">0{i + 1}</span>
                <p className="mt-1 font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-snug text-white/60">{text}</p>
              </li>
            ))}
          </ol>
        </header>
        <SignupForm hunterCode={code} brands={brands} />
        <p className="pb-6 text-center text-xs text-stone-500">
          <span className="font-bold tracking-[0.3em] text-stone-700 dark:text-stone-300">ALLIANCE</span> · Creator Club
        </p>
      </div>
    </div>
  );
}
