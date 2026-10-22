import { Link2, MousePointerClick, Ticket } from "lucide-react";
import type { PortalCoupon } from "@/lib/portal/coupons";
import { CopyButton } from "./copy-button";
import { HelpTip } from "@/components/ui/tour";
import { ShareButton } from "./share-button";

/**
 * Cupom, link e cliques (E7.5), no Início do portal desde M0.0.5 (a tela Cupom saiu do menu). No computador fica
 * numa faixa: código, link e cliques lado a lado. Só exibe.
 */
export function CouponView({
  coupons,
  origin,
  brandName,
  deactivated,
  terms,
}: {
  coupons: PortalCoupon[];
  origin: string;
  brandName: string;
  deactivated: boolean;
  /** M0.4: as condições dela (comissão vigente e desconto do cupom); UGC sem comissão passa `rateBps: null`. */
  terms?: { rateBps: number | null; discountBps: number | null };
}) {
  const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  if (coupons.length === 0) {
    return (
      <section className="glass rounded-3xl p-6 text-sm text-stone-600 dark:text-stone-400">
        {deactivated ? "Sua participação foi encerrada; o cupom não está mais ativo." : "Você ainda não tem cupom ativo. Fale com a equipe da marca."}
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {coupons.map((c) => {
        const link = `${origin}${c.path}`;
        return (
          <section key={c.code} className="glass grid gap-5 rounded-3xl p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] lg:items-start">
            <div data-tour="cupom-codigo" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                  <Ticket className="size-4" /> Seu cupom
                </p>
                <HelpTip id="cupom-codigo" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
                <span className="font-mono text-2xl font-semibold tracking-wider">{c.code}</span>
                <CopyButton value={c.code} label="Copiar cupom" />
              </div>
              <p className="text-xs text-stone-500">
                A pessoa digita o cupom no carrinho da {brandName}
                {terms?.discountBps != null ? ` e ganha ${pct(terms.discountBps)} de desconto` : ""}.
                {terms?.rateBps != null && <> Você ganha <strong className="text-stone-700 dark:text-stone-300">{pct(terms.rateBps)}</strong> de comissão sobre os produtos.</>}
              </p>
            </div>

            <div data-tour="cupom-link" className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                  <Link2 className="size-4" /> Seu link
                </p>
                <HelpTip id="cupom-link" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
                <span className="min-w-0 break-all font-mono text-sm">{link}</span>
                <div className="flex gap-2">
                  <CopyButton value={link} label="Copiar link" />
                  <ShareButton text={`Use meu cupom ${c.code} na ${brandName}:`} url={link} />
                </div>
              </div>
              <p className="text-xs text-stone-500">Quem abre o link já entra na loja com o cupom aplicado. Ótimo para a bio e os stories.</p>
            </div>

            <div data-tour="cupom-cliques" className="flex flex-col gap-2 lg:min-w-44">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                  <MousePointerClick className="size-4" /> Cliques no link
                </p>
                <HelpTip id="cupom-cliques" />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {[
                  ["Este mês", c.clicksMonth],
                  ["No total", c.clicksTotal],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white/40 px-4 py-2.5 dark:bg-white/5">
                    <p className="text-xs text-stone-500">{label}</p>
                    <p className="text-xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
