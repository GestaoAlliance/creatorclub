import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Clock, ShoppingBag, Wallet } from "lucide-react";
import { CopyButton } from "@/components/portal/copy-button";
import { formatBRL } from "@/domain";
import { LEDGER_LABEL } from "@/lib/commission/statement";
import { releaseNote } from "@/components/ui/release-progress";
import type { PortalSummary } from "@/lib/portal/home";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Início do portal (E7.2, D-HOMEKPI). Só exibe o resumo já calculado. `ugc`: só vendas e cupom (D-UGCPORTAL). */
export function HomeView({ s, base, ugc = false }: { s: PortalSummary; base: string; ugc?: boolean }) {
  const monthName = MONTHS[Number(s.month.slice(5)) - 1];
  if (ugc) return <UgcHome s={s} base={base} monthName={monthName} />;

  const cards = [
    { label: "Disponível para saque", value: formatBRL(s.balance.availableCents), note: s.balance.reservedCents > 0 ? `${formatBRL(s.balance.reservedCents)} em saque` : "já liberado para você", Icon: Wallet, accent: true },
    { label: "A liberar", value: formatBRL(s.balance.heldCents), note: s.balance.heldCents > 0 ? releaseNote(s.release) : "nada em espera", Icon: Clock },
    { label: `Vendas de ${monthName}`, value: formatBRL(s.salesCents), note: `${s.salesCount} ${s.salesCount === 1 ? "pedido" : "pedidos"}`, Icon: ShoppingBag },
    { label: `Comissão de ${monthName}`, value: formatBRL(s.commissionCents), note: "pela data do pagamento", Icon: ArrowUpRight },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, note, Icon, accent }) => (
          <div key={label} className={`glass rounded-3xl p-4 md:p-5 ${accent ? "ring-2 ring-brand/40" : ""}`}>
            <div className="mb-3 grid size-9 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2">
              <Icon className="size-4" />
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">{label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums md:text-2xl ${value.startsWith("-") ? "text-red-700 dark:text-red-400" : ""}`}>{value}</p>
            <p className="mt-1 text-xs text-stone-500">{note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="glass rounded-3xl p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Últimas movimentações</h2>
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
                  <span className={`text-sm font-semibold tabular-nums ${l.amountCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{formatBRL(l.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {s.coupons.length > 0 && <Coupons codes={s.coupons} note="Pedidos pagos com seu cupom geram comissão para você." base={base} />}
      </div>
    </div>
  );
}

function Coupons({ codes, note, base }: { codes: string[]; note: string; base: string }) {
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-5">
      <h2 className="font-semibold">{codes.length > 1 ? "Seus cupons" : "Seu cupom"}</h2>
      {codes.map((code) => (
        <div key={code} className="flex items-center justify-between gap-2 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
          <span className="font-mono text-lg font-semibold tracking-wide">{code}</span>
          <CopyButton value={code} />
        </div>
      ))}
      <p className="text-xs text-stone-500">{note}</p>
      <Link href={`${base}/cupom`} className="text-sm font-medium text-brand underline-offset-4 hover:underline dark:text-brand-2">
        Ver meu link e os cliques →
      </Link>
    </section>
  );
}

/** Início de quem é só UGC (D-UGCPORTAL): vendas do mês com o cupom e o cupom; sem saldo, comissão e saque. */
function UgcHome({ s, base, monthName }: { s: PortalSummary; base: string; monthName: string | undefined }) {
  const cards = [
    { label: `Vendas de ${monthName}`, value: formatBRL(s.salesCents), note: "valor dos produtos, pela data do pagamento", Icon: ShoppingBag },
    { label: `Pedidos de ${monthName}`, value: String(s.salesCount), note: "pagos com seu cupom", Icon: ArrowUpRight },
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3">
        {cards.map(({ label, value, note, Icon }) => (
          <div key={label} className="glass rounded-3xl p-4 md:p-5">
            <div className="mb-3 grid size-9 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2">
              <Icon className="size-4" />
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
      {s.coupons.length > 0 && <Coupons codes={s.coupons} note="As vendas feitas com seu cupom aparecem em Vendas." base={base} />}
    </div>
  );
}
