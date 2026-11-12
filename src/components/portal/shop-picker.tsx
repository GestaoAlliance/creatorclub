"use client";

import { MapPin, Minus, Plus, RotateCcw, ShoppingBag, Sparkles } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { buyAction } from "@/app/portal/[marca]/envios/actions";
import { AddressFields } from "@/components/ui/address-fields";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { formatAddress, zipFromText, type Address } from "@/lib/shipments/address";
import type { ShopState } from "@/lib/shipments/shop";

const field = "w-full rounded-2xl border border-stone-300/70 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-brand dark:border-white/15 dark:bg-white/5";
const M = ({ children }: { children: React.ReactNode }) => <span className="money">{children}</span>;

/**
 * Loja com o saldo (M5.1, D-SHOPBALANCE; visual D-PORTALSHOP): faixa com o saldo e quanto sobra, "comprar de novo" dos
 * mais pedidos, vitrine em cartões com foto e preço de creator, carrinho fixo embaixo e revisão com o endereço ("está
 * certo?"). A compra espera a aprovação da equipe (o valor fica reservado) e o frete é da marca. Sem saldo, a faixa
 * mostra quanto falta para liberar a próxima comissão.
 */
export function ShopPicker({
  marca,
  shop,
  address,
  informed = null,
  viewOnly,
  savedCents = 0,
  favorites = [],
  goal = null,
}: {
  marca: string;
  shop: ShopState;
  address: Address | null;
  informed?: string | null;
  viewOnly: boolean;
  savedCents?: number;
  favorites?: string[];
  goal?: { missingCents: number; what: string; nextDay: string } | null;
}) {
  const [state, action, pending] = useActionState(buyAction, undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(address === null);
  const [review, setReview] = useState(false);
  const [addrOk, setAddrOk] = useState(false);
  useEffect(() => {
    if (state?.ok) {
      setQty({}); // pedido feito: o carrinho volta vazio
      setReview(false);
      setAddrOk(false);
    }
  }, [state]);
  if (!shop.allowed) return <p className="glass rounded-3xl px-5 py-4 text-sm text-stone-600 dark:text-stone-300">{shop.reason}</p>;
  const byId = new Map(shop.products.map((p) => [p.id, p]));
  const total = Object.entries(qty).reduce((s, [id, n]) => s + (byId.get(id)?.creatorPriceCents ?? 0) * n, 0);
  const full = Object.entries(qty).reduce((s, [id, n]) => s + (byId.get(id)?.priceCents ?? 0) * n, 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const left = shop.availableCents - total;
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  const canAdd = (id: string) => !viewOnly && (byId.get(id)?.creatorPriceCents ?? Infinity) <= left;
  const favs = favorites.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-3 p-5 md:p-7">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/75"><ShoppingBag className="size-4" />Comprar com o saldo</p>
          <p className="text-4xl font-semibold tabular-nums"><M>{formatBRL(Math.max(0, shop.availableCents))}</M></p>
          <p className="text-sm text-white/85">
            {shop.availableCents <= 0 && goal
              ? <>Venda com o seu cupom para usar a loja: faltam <strong className="money">{formatBRL(goal.missingCents)}</strong> {goal.what} para liberar a sua próxima comissão (fechamento em {goal.nextDay}).</>
              : shop.availableCents <= 0
                ? "Venda com o seu cupom para usar a loja. Os produtos e preços ficam aqui para você conhecer."
                : <>{shop.discountBps > 0 ? `Preço de creator (${(shop.discountBps / 100).toLocaleString("pt-BR")}% de desconto)` : "Preço da loja"}, frete por nossa conta.{count > 0 && <> No carrinho: <strong className="money">{formatBRL(total)}</strong> · sobra <strong className="money">{formatBRL(Math.max(0, left))}</strong>.</>}</>}
          </p>
          {savedCents > 0 && <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/18 px-3 py-1 text-xs font-semibold"><Sparkles className="size-3.5" />Você já economizou cerca de <M>{formatBRL(savedCents)}</M> comprando como creator</span>}
        </div>
      </section>

      {favs.length > 0 && shop.availableCents > 0 && (
        <section className="glass flex flex-col gap-2 rounded-3xl p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><RotateCcw className="size-4" />Comprar de novo</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {favs.map((p) => (
              <button key={p.id} type="button" disabled={!canAdd(p.id)} onClick={() => set(p.id, 1)} className="liquid-tile flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm disabled:opacity-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.photo && <img src={p.photo} alt="" width={36} height={36} className="size-9 rounded-xl bg-white object-contain" />}
                <span><span className="block max-w-36 truncate font-medium">{p.title}</span><span className="text-xs text-stone-500"><M>{formatBRL(p.creatorPriceCents)}</M> · + 1</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {shop.products.length === 0 ? (
        <p className="glass rounded-3xl px-5 py-6 text-center text-sm text-stone-500">Nenhum produto com preço ainda. Volte mais tarde.</p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="marca" value={marca} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shop.products.map((p) => {
              const n = qty[p.id] ?? 0;
              return (
                <li key={p.id} className={`glass relative flex flex-col overflow-hidden rounded-3xl ring-2 transition ${n ? "ring-brand dark:ring-brand-2" : "ring-transparent"}`}>
                  <input type="hidden" name={`qty:${p.id}`} value={n} />
                  <button type="button" disabled={!canAdd(p.id)} onClick={() => set(p.id, 1)} aria-label={`Adicionar ${p.title}`} className="flex flex-1 flex-col items-center gap-2 p-3 text-center disabled:cursor-default">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" width={120} height={120} className="aspect-square w-full max-w-28 rounded-2xl bg-white object-contain" />
                    ) : (
                      <span className="grid aspect-square w-full max-w-28 place-content-center rounded-2xl bg-stone-200/70 text-stone-400 dark:bg-white/10"><ShoppingBag className="size-8" /></span>
                    )}
                    <span className="text-sm font-medium leading-snug">{p.title}</span>
                    <span className="flex flex-col items-center">
                      <span className="text-base font-semibold tabular-nums"><M>{formatBRL(p.creatorPriceCents)}</M></span>
                      {p.creatorPriceCents < p.priceCents && <span className="text-[11px] text-stone-500"><s><M>{formatBRL(p.priceCents)}</M></s> · economiza <M>{formatBRL(p.priceCents - p.creatorPriceCents)}</M></span>}
                    </span>
                  </button>
                  {n > 0 && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-brand px-1 py-0.5 text-white shadow dark:bg-brand-2 dark:text-stone-900">
                      <button type="button" aria-label={`Tirar ${p.title}`} disabled={viewOnly} onClick={() => set(p.id, -1)} className="grid size-6 place-content-center rounded-full hover:bg-white/20"><Minus className="size-3.5" /></button>
                      <span className="min-w-5 px-0.5 text-center text-sm font-semibold tabular-nums">{n}</span>
                      <button type="button" aria-label={`Mais ${p.title}`} disabled={!canAdd(p.id)} onClick={() => set(p.id, 1)} className="grid size-6 place-content-center rounded-full hover:bg-white/20 disabled:opacity-40"><Plus className="size-3.5" /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {count > 0 && review && (
            <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
              <h2 className="text-sm font-semibold">Revisar pedido</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{n}× {byId.get(id)?.title}</span><span className="shrink-0 tabular-nums"><M>{formatBRL((byId.get(id)?.creatorPriceCents ?? 0) * n)}</M></span></li>
                ))}
                <li className="flex justify-between gap-2 border-t border-stone-200/70 pt-1 font-semibold dark:border-white/10"><span>Total (sai do saldo)</span><span className="tabular-nums"><M>{formatBRL(total)}</M></span></li>
                {full > total && <li className="text-xs text-emerald-700 dark:text-emerald-300">Você economiza <M>{formatBRL(full - total)}</M> nesta compra.</li>}
              </ul>
              <div className="flex flex-col gap-3 rounded-2xl bg-white/50 p-4 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4" /> Entregar em</p>
                  {address && !editing && !viewOnly && <button type="button" onClick={() => setEditing(true)} className="glass rounded-full px-4 py-1.5 text-xs font-semibold">Alterar</button>}
                </div>
                {address && !editing ? (
                  <div className="text-sm">{formatAddress(address).map((l) => <p key={l}>{l}</p>)}</div>
                ) : (
                  <>
                    {!address && informed && <p className="text-sm"><span className="block text-xs text-stone-500">Endereço que você informou no cadastro (confira e preencha os campos, a partir do CEP):</span>{informed}</p>}
                    {!viewOnly && <AddressFields initial={address ?? { zip: zipFromText(informed) ?? "" }} inputClass={field} />}
                  </>
                )}
              </div>
              {!viewOnly && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" required checked={addrOk} onChange={(e) => setAddrOk(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                  <span>Conferi: o endereço de entrega está certo.</span>
                </label>
              )}
              <p className="text-xs text-stone-500">A equipe aprova o pedido; até lá o valor fica reservado no seu saldo. O frete é por nossa conta.</p>
              <Msg state={state} />
            </section>
          )}
          {state?.ok && !review && <Msg state={state} />}

          {count > 0 && !viewOnly && (
            <div className="sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur md:bottom-4 dark:bg-stone-900/90">
              <p className="text-sm"><strong>{count}</strong> {count === 1 ? "item" : "itens"} · <strong className="tabular-nums"><M>{formatBRL(total)}</M></strong> <span className="text-stone-500">· sobra <M>{formatBRL(Math.max(0, left))}</M></span></p>
              {review ? (
                <button disabled={pending || left < 0 || !addrOk} className={ui.btn}>{pending ? "Enviando…" : "Fazer pedido"}</button>
              ) : (
                <button type="button" onClick={() => setReview(true)} className={ui.btn}>Revisar pedido</button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
