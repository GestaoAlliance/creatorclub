import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, Clock, Hourglass, ShoppingBag, Wallet } from "lucide-react";
import { CouponView } from "@/components/portal/coupon-view";
import { HelpTip } from "@/components/ui/tour";
import type { HelpId } from "@/domain/tutorial";
import { formatBRL } from "@/domain";
import { LEDGER_LABEL } from "@/lib/commission/statement";
import { ReleaseProgressBar, releaseNote } from "@/components/ui/release-progress";
import type { PortalCoupon } from "@/lib/portal/coupons";
import type { PortalSummary } from "@/lib/portal/home";
import type { portalHomeExtras } from "@/lib/portal/motivation";
import { Achievements, DailyTip, HomeHero, NextKit, NextSteps } from "./home-parts";

type Extras = Awaited<ReturnType<typeof portalHomeExtras>>;

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Cupom e link no Início (M0.0.5): a tela Cupom entrou aqui; o portal fica com 4 telas. */
export type HomeCoupons = { list: PortalCoupon[]; origin: string; brandName: string; deactivated: boolean };

/** Início do portal (E7.2, D-HOMEKPI). Só exibe o resumo já calculado. `ugc`: só vendas e cupom (D-UGCPORTAL). */
export function HomeView({ s, base, coupons, ugc = false, extras, brandSlug, top = null }: { s: PortalSummary; base: string; coupons: HomeCoupons; ugc?: boolean; extras: Extras; brandSlug: string; top?: React.ReactNode }) {
  const monthName = MONTHS[Number(s.month.slice(5)) - 1] ?? "";
  const first = coupons.list[0];
  const share = first && !coupons.deactivated ? { code: first.code, link: `${coupons.origin}${first.path}`, discountBps: s.terms.discountBps } : null;
  const hero = <HomeHero brandName={coupons.brandName} monthName={monthName} release={s.release} availableCents={s.balance.availableCents} heldCents={s.balance.heldCents} salesCents={s.salesCents} salesCount={s.salesCount} band={extras.band} share={share} ugc={ugc} />;
  const motivation = (
    <>
      {top}
      <NextSteps steps={extras.steps} />
      <div className={`grid gap-4 ${!ugc && extras.kit ? "md:grid-cols-2" : ""}`}>
        <DailyTip tip={extras.tip} />
        {!ugc && <NextKit kit={extras.kit} photos={extras.kitPhotos} brandSlug={brandSlug} base={base} />}
      </div>
      <Achievements list={extras.achievements} />
    </>
  );
  if (ugc) return <UgcHome s={s} base={base} monthName={monthName} coupons={coupons} hero={hero} motivation={motivation} />;

  const cards = [
    { label: "Aguardando pagamento", value: formatBRL(s.pending.salesCents), note: s.pending.orders ? `${s.pending.orders} ${s.pending.orders === 1 ? "pedido" : "pedidos"} com seu cupom` : "nenhum pedido esperando", Icon: Hourglass, help: "aguardando" as HelpId },
    { label: `Comissão de ${monthName}`, value: formatBRL(s.commissionCents), note: "pela data do pagamento", Icon: ArrowUpRight, help: "comissao-mes" as HelpId },
    { label: "Já usado", value: formatBRL(s.usedCents), note: "saques pagos", Icon: Banknote, help: "ja-usado" as HelpId },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {hero}
      {motivation}
      <CouponView coupons={coupons.list} origin={coupons.origin} brandName={coupons.brandName} deactivated={coupons.deactivated} terms={s.terms} />
      {s.balance.reservedCents > 0 && <p className="px-1 text-xs text-stone-500">{formatBRL(s.balance.reservedCents)} do seu saldo está reservado (saque ou compra em andamento).</p>}
      <section className="grid grid-cols-3 gap-2 md:gap-3">
        {cards.map(({ label, value, note, Icon, help }) => (
          <div key={label} data-tour={help} className="glass min-w-0 rounded-3xl p-3 md:p-5">
            <div className="mb-2 flex items-start justify-between gap-1 md:mb-3">
              <div className="grid size-7 place-content-center md:size-9 rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2">
                <Icon className="size-4" />
              </div>
              <HelpTip id={help} className="-mr-1.5 -mt-1.5" />
            </div>
            <p className="truncate text-[11px] text-stone-600 md:text-xs dark:text-stone-400">{label}</p>
            <p className={`mt-1 truncate text-sm font-semibold tabular-nums md:text-2xl ${value.startsWith("-") ? "text-red-700 dark:text-red-400" : ""}`}>{value}</p>
            <p className="mt-1 hidden text-xs text-stone-500 md:block">{note}</p>
          </div>
        ))}
      </section>

      <div className="grid min-w-0 gap-6">
        <section data-tour="movimentacoes" className="glass min-w-0 rounded-3xl p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Últimas movimentações</h2>
            <HelpTip id="movimentacoes" />
          </div>
          {s.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">Nenhuma movimentação ainda. Suas comissões aparecem aqui quando um pedido com seu cupom for pago.</p>
          ) : (
            <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
              {s.recent.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <span className={`grid size-9 shrink-0 place-content-center rounded-2xl ${l.amountCents < 0 ? "bg-red-500/10 text-red-600" : "bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"}`}>
                    {l.amountCents < 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {LEDGER_LABEL[l.type]}
                      {l.orderName && <span className="text-stone-500"> · pedido {l.orderName}</span>}
                    </p>
                    <p className="text-xs text-stone-500">
                      {day(l.orderPaidAt ?? l.createdAt)}
                      {l.held && " · a liberar"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${l.amountCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{formatBRL(l.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}

/** Início de quem é só UGC (D-UGCPORTAL): vendas do mês com o cupom e o cupom; sem saldo, comissão e saque. */
function UgcHome({ s, base, monthName, coupons, hero, motivation }: { s: PortalSummary; base: string; monthName: string | undefined; coupons: HomeCoupons; hero: React.ReactNode; motivation: React.ReactNode }) {
  const cards = [
    { label: `Vendas de ${monthName}`, value: formatBRL(s.salesCents), note: "valor dos produtos, pela data do pagamento", Icon: ShoppingBag, help: "vendas-mes" as HelpId },
    { label: `Pedidos de ${monthName}`, value: String(s.salesCount), note: "pagos com seu cupom", Icon: ArrowUpRight, help: "pedidos-mes" as HelpId },
  ];
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {hero}
      {motivation}
      <section className="grid grid-cols-2 gap-3">
        {cards.map(({ label, value, note, Icon, help }) => (
          <div key={label} data-tour={help} className="glass rounded-3xl p-4 md:p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="grid size-9 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2">
                <Icon className="size-4" />
              </div>
              <HelpTip id={help} className="-mr-1.5 -mt-1.5" />
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums md:text-2xl">{value}</p>
            <p className="mt-1 text-xs text-stone-500">{note}</p>
          </div>
        ))}
      </section>
      <Link href={`${base}/vendas`} className="glass flex items-center justify-between rounded-3xl px-5 py-4 text-sm font-medium">
        Ver todas as minhas vendas <span aria-hidden>→</span>
      </Link>
      <CouponView coupons={coupons.list} origin={coupons.origin} brandName={coupons.brandName} deactivated={coupons.deactivated} terms={{ rateBps: null, discountBps: s.terms.discountBps }} />
    </div>
  );
}
