import { BadgeDollarSign, Gift, LayoutDashboard, Ticket } from "lucide-react";
import { SIGNUP_BRANDS, signupBrandSlug } from "@/domain";
import { db } from "@/lib/db";
import type { SignupBrand } from "./form";

/** Cores de cada marca da inscrição, lidas do banco (D-BRANDCOLOR); sem banco, um cinza neutro. */
export async function signupBrands(): Promise<(SignupBrand & { slug: string })[]> {
  const slugs = SIGNUP_BRANDS.map(signupBrandSlug);
  const rows = await db()
    .brand.findMany({ where: { slug: { in: slugs }, archivedAt: null }, select: { slug: true, primaryColor: true, secondaryColor: true } })
    .catch(() => []);
  const by = new Map(rows.map((r) => [r.slug, r]));
  return SIGNUP_BRANDS.filter((name) => rows.length === 0 || by.has(signupBrandSlug(name))).map((name) => {
    const r = by.get(signupBrandSlug(name));
    return { name, slug: signupBrandSlug(name), color: r?.primaryColor ?? "#78716c", accent: r?.secondaryColor ?? null };
  });
}

export const PERKS = [
  [BadgeDollarSign, "Comissão em cada venda", "Toda compra feita com o seu cupom vira dinheiro para você."],
  [Ticket, "Cupom com o seu nome", "Um código exclusivo, com desconto para quem te acompanha."],
  [Gift, "Produtos em casa", "Você recebe os produtos para usar e mostrar de verdade."],
  [LayoutDashboard, "Seu portal", "Vendas, saldo e saque num lugar só, todo mês."],
] as const;

export const STEPS = ["Inscreva-se em 2 passos", "A equipe analisa o seu perfil", "Receba seu cupom e comece a ganhar"] as const;

/** Vantagens e passos, iguais na escolha de marca e no formulário de cada marca. */
export function PerksAndSteps() {
  return (
    <>
      <ul className="rise mt-10 grid gap-3 [animation-delay:320ms] sm:grid-cols-2">
        {PERKS.map(([Icon, title, text]) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
            <span className="grid size-10 shrink-0 place-content-center rounded-xl bg-white text-black">
              <Icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="mt-0.5 block text-sm leading-snug text-white/65">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <ol className="rise mt-6 flex flex-col gap-2 text-sm text-white/75 [animation-delay:400ms] sm:flex-row sm:items-center sm:gap-3">
        {STEPS.map((t, i) => (
          <li key={t} className="flex items-center gap-2 sm:gap-3">
            <span className="grid size-6 shrink-0 place-content-center rounded-full bg-white/15 text-xs font-semibold tabular-nums text-white">{i + 1}</span>
            {t}
            {i < STEPS.length - 1 && <span aria-hidden className="hidden h-px w-6 bg-white/25 sm:block" />}
          </li>
        ))}
      </ol>
    </>
  );
}
