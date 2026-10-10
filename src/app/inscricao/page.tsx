import { ThemeToggle } from "@/components/portal/theme-toggle";
import { normalizeHunterCode } from "@/domain";
import { SignupForm } from "./form";

export const dynamic = "force-dynamic";

// Inscrição pública (D-SIGNUP): endereço sem marca e visual neutro "Creator Club" (a pessoa escolhe as marcas no
// formulário). Vira candidata em /admin/candidatas. O link do hunter (/i/[codigo]) traz ?h=código.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const code = normalizeHunterCode(typeof h === "string" ? h : "") || null;
  return (
    <div className="portal-bg min-h-screen px-4 py-8 md:py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-content-center rounded-2xl bg-brand text-lg font-bold text-white shadow-sm">C</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Creator Club</p>
            <h1 className="text-2xl font-semibold tracking-tight">Inscrição de creators</h1>
          </div>
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Quer divulgar nossas marcas com o seu próprio cupom? Preencha a inscrição abaixo. A equipe analisa e fala com você
          pelo WhatsApp.
        </p>
        <main className="glass rounded-3xl p-5 md:p-8">
          <SignupForm hunterCode={code} />
        </main>
      </div>
    </div>
  );
}
