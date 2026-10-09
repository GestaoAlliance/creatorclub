import { Link2, MousePointerClick, Ticket } from "lucide-react";
import type { PortalCoupon } from "@/lib/portal/coupons";
import { CopyButton } from "./copy-button";
import { ShareButton } from "./share-button";

/** Aba Cupom (E7.5): código e link para copiar/compartilhar, e os cliques no link. Só exibe. */
export function CouponView({ coupons, origin, brandName, deactivated }: { coupons: PortalCoupon[]; origin: string; brandName: string; deactivated: boolean }) {
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
          <section key={c.code} className="glass flex flex-col gap-5 rounded-3xl p-5 md:p-6">
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                <Ticket className="size-4" /> Seu cupom
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-4 dark:bg-white/5">
                <span className="font-mono text-2xl font-semibold tracking-wider md:text-3xl">{c.code}</span>
                <div className="flex gap-2">
                  <CopyButton value={c.code} label="Copiar cupom" />
                </div>
              </div>
              <p className="text-xs text-stone-500">A pessoa digita o cupom no carrinho da {brandName}.</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                <Link2 className="size-4" /> Seu link
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
                <span className="min-w-0 break-all font-mono text-sm">{link}</span>
                <div className="flex gap-2">
                  <CopyButton value={link} label="Copiar link" />
                  <ShareButton text={`Use meu cupom ${c.code} na ${brandName}:`} url={link} />
                </div>
              </div>
              <p className="text-xs text-stone-500">Quem abre o link já entra na loja com o cupom aplicado. Ótimo para a bio e os stories.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["Cliques este mês", c.clicksMonth],
                ["Cliques no total", c.clicksTotal],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white/40 px-4 py-3 dark:bg-white/5">
                  <p className="flex items-center gap-1.5 text-xs text-stone-500"><MousePointerClick className="size-3.5" /> {label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
