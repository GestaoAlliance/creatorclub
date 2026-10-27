"use client";

import { MapPin, Minus, Plus, ShoppingBag } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { buyAction } from "@/app/portal/[marca]/envios/actions";
import { AddressFields } from "@/components/ui/address-fields";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { formatAddress, zipFromText, type Address } from "@/lib/shipments/address";
import type { ShopState } from "@/lib/shipments/shop";

const field = "w-full rounded-2xl border border-stone-300/70 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-brand dark:border-white/15 dark:bg-white/5";

/**
 * Loja com o saldo (M5.1, D-SHOPBALANCE): produtos da marca pelo preço de creator, pagos com o saldo disponível. A
 * compra espera a aprovação da equipe (o valor fica reservado) e o frete é da marca.
 */
export function ShopPicker({ marca, shop, address, informed = null, viewOnly }: { marca: string; shop: ShopState; address: Address | null; informed?: string | null; viewOnly: boolean }) {
  const [state, action, pending] = useActionState(buyAction, undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(address === null);
  useEffect(() => {
    if (state?.ok) setQty({}); // pedido feito: o carrinho volta vazio
  }, [state]);
  if (!shop.allowed) return <p className="rounded-2xl bg-white/50 px-4 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">{shop.reason}</p>;
  const price = new Map(shop.products.map((p) => [p.id, p.creatorPriceCents]));
  const total = Object.entries(qty).reduce((s, [id, n]) => s + (price.get(id) ?? 0) * n, 0);
  const left = shop.availableCents - total;
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));

  return (
    <section className={ui.card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className={ui.h2}><ShoppingBag className="size-4 text-brand dark:text-brand-2" /> Comprar com o saldo</h2>
          <p className={ui.muted}>
            {shop.discountBps > 0 ? `Preço de creator (${(shop.discountBps / 100).toLocaleString("pt-BR")}% de desconto)` : "Preço da loja"}, frete por nossa conta. A equipe aprova e o valor sai do seu saldo.
          </p>
        </div>
        <p className="text-right text-sm">
          <span className="block text-xs text-stone-500">Saldo disponível</span>
          <span className="font-semibold tabular-nums">{formatBRL(Math.max(0, shop.availableCents))}</span>
        </p>
      </div>
      {shop.products.length === 0 ? (
        <p className={ui.muted}>Nenhum produto com preço ainda. Volte mais tarde.</p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="marca" value={marca} />
          <ul className={ui.list}>
            {shop.products.map((p) => {
              const n = qty[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    {p.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" width={56} height={56} className="size-14 shrink-0 rounded-2xl bg-white object-contain" />
                    )}
                    <span className="flex flex-col">
                      <span className={`text-sm ${n ? "font-medium" : ""}`}>{p.title}</span>
                      <span className="text-xs tabular-nums text-stone-500">
                        {p.creatorPriceCents < p.priceCents && <s className="mr-1">{formatBRL(p.priceCents)}</s>}
                        {formatBRL(p.creatorPriceCents)}
                      </span>
                    </span>
                  </span>
                  <input type="hidden" name={`qty:${p.id}`} value={n} />
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`Tirar ${p.title}`} disabled={viewOnly || n === 0} onClick={() => set(p.id, -1)} className={ui.ghostSm}><Minus className="size-3.5" /></button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{n}</span>
                    <button type="button" aria-label={`Adicionar ${p.title}`} disabled={viewOnly || p.creatorPriceCents > left} onClick={() => set(p.id, 1)} className={ui.ghostSm}><Plus className="size-3.5" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
          {total > 0 && (
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
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={ui.hint}>{total > 0 ? <>Total: <strong className="tabular-nums">{formatBRL(total)}</strong> · sobra {formatBRL(Math.max(0, left))}</> : "Escolha os produtos."}</p>
            {!viewOnly && <button disabled={pending || total === 0 || left < 0} className={ui.btn}>{pending ? "Enviando…" : "Fazer pedido"}</button>}
          </div>
          <Msg state={state} />
        </form>
      )}
    </section>
  );
}
