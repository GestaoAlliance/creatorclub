import Link from "next/link";
import { Wallet } from "lucide-react";
import { CouponView } from "@/components/portal/coupon-view";
import { formatBRL } from "@/domain";
import type { PortalCoupon } from "@/lib/portal/coupons";
import type { PortalSummary } from "@/lib/portal/home";
import type { portalHomeExtras } from "@/lib/portal/motivation";
import { HomeHero, NextSteps } from "./home-parts";

type Extras = Awaited<ReturnType<typeof portalHomeExtras>>;

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Cupom e link no Início (M0.0.5): a tela Cupom entrou aqui; o portal fica com 4 telas. */
export type HomeCoupons = { list: PortalCoupon[]; origin: string; brandName: string; deactivated: boolean };

/**
 * Início do portal (E7.2). D-PORTALSIMPLE (responsável, 2026-11-18): só o essencial, nesta ordem: o mês dela (quanto
 * falta para liberar, para saque, vendas) com o atalho do saque; o cupom e o link; uma pendência por vez. Extrato fica
 * no Saque, o próximo kit em Pedidos e as perguntas (TikTok, aniversário, nome da mãe) em Meu cadastro.
 * `ugc`: só vendas e cupom (D-UGCPORTAL).
 */
export function HomeView({ s, base, coupons, ugc = false, extras, top = null }: { s: PortalSummary; base: string; coupons: HomeCoupons; ugc?: boolean; extras: Extras; brandSlug: string; top?: React.ReactNode }) {
  const monthName = MONTHS[Number(s.month.slice(5)) - 1] ?? "";
  const first = coupons.list[0];
  const share = first && !coupons.deactivated ? { code: first.code, link: `${coupons.origin}${first.path}`, discountBps: s.terms.discountBps } : null;
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <HomeHero brandName={coupons.brandName} monthName={monthName} release={s.release} availableCents={s.balance.availableCents} heldCents={s.balance.heldCents} salesCents={s.salesCents} salesCount={s.salesCount} band={extras.band} share={share} ugc={ugc} />
      {!ugc && s.balance.availableCents > 0 && (
        <Link href={`${base}/saque`} className="glass flex items-center gap-3 rounded-3xl p-4 hover:shadow-sm md:p-5">
          <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><Wallet className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Você tem <span className="money">{formatBRL(s.balance.availableCents)}</span> para sacar</span>
            <span className="text-sm text-stone-600 dark:text-stone-300">Veja o valor da nota e como pedir →</span>
          </span>
        </Link>
      )}
      {top}
      <CouponView coupons={coupons.list} origin={coupons.origin} brandName={coupons.brandName} deactivated={coupons.deactivated} terms={ugc ? { rateBps: null, discountBps: s.terms.discountBps } : s.terms} />
      <NextSteps steps={extras.steps} />
      {!ugc && s.balance.reservedCents > 0 && <p className="px-1 text-xs text-stone-500">{formatBRL(s.balance.reservedCents)} do seu saldo está reservado (saque ou compra em andamento).</p>}
    </div>
  );
}
