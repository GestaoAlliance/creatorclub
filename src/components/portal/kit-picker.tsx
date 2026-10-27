"use client";

import { Gift, MapPin, Minus, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { chooseKitAction } from "@/app/portal/[marca]/envios/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { kitNoun } from "@/domain";
import { AddressFields } from "@/components/ui/address-fields";
import { formatAddress, zipFromText, type Address } from "@/lib/shipments/address";

const field = "w-full rounded-2xl border border-stone-300/70 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-brand dark:border-white/15 dark:bg-white/5";

/**
 * Kit mensal (D-KIT) ou de boas-vindas (D-WELCOMEKIT, 1 produto desde D-WELCOMEKIT1): a creator escolhe os N produtos que
 * ganhou e confere o endereço de entrega antes de enviar o pedido (D-KITOPTIONS). Sem endereço nos campos, aparece o
 * que ela informou no cadastro e os campos com a busca pelo CEP; o endereço é salvo junto com o pedido.
 */
export function KitPicker({
  marca,
  kit,
  monthLabel,
  welcome = false,
  goal = false,
  products,
  address,
  informed = null,
  viewOnly,
}: {
  marca: string;
  kit: { id: string; products: number };
  monthLabel: string;
  welcome?: boolean;
  /** D-GOALKIT: produto da meta de R$ 1.000. */
  goal?: boolean;
  products: { id: string; title: string; photo?: string | null }[];
  address: Address | null;
  informed?: string | null;
  viewOnly: boolean;
}) {
  const [editing, setEditing] = useState(address === null);
  const [state, action, pending] = useActionState(chooseKitAction, undefined);
  // Pedido do responsável (2026-10-27): com uma opção só (Revita, VermeFree), o produto já vem escolhido.
  const single = products.length === 1 ? products[0]! : null;
  const [qty, setQty] = useState<Record<string, number>>(() => (single ? { [single.id]: kit.products } : {}));
  const total = Object.values(qty).reduce((s, n) => s + n, 0);
  const left = kit.products - total;
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  const plural = (n: number) => kitNoun(marca, n);

  return (
    <section className={`${ui.card} ring-1 ring-brand/30`}>
      <div className="flex flex-col gap-1">
        <h2 className={ui.h2}>
          <Gift className="size-4 text-brand dark:text-brand-2" /> {welcome ? `Boas-vindas: você ganhou ${kit.products} ${plural(kit.products)}!` : goal ? `Meta batida: você ganhou ${kit.products} ${plural(kit.products)}!` : `Você ganhou ${kit.products} ${plural(kit.products)}!`}
        </h2>
        <p className={ui.muted}>
          {welcome ? "É o kit do início da sua parceria." : goal ? "Você chegou a R$ 1.000 em vendas com o seu cupom." : `Pelas suas vendas de ${monthLabel}.`} {single ? "Confira o endereço e envie o pedido" : "Escolha os produtos"}: a equipe aprova o pedido e prepara o envio para o seu endereço.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="marca" value={marca} />
          <input type="hidden" name="kitId" value={kit.id} />
          <ul className={ui.list}>
            {products.map((p) => {
              const n = qty[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    {p.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" width={64} height={64} className="size-16 shrink-0 rounded-2xl bg-white object-contain" />
                    )}
                    <span className={`text-sm ${n ? "font-medium" : ""}`}>{p.title}</span>
                  </span>
                  <input type="hidden" name={`qty:${p.id}`} value={n} />
                  {single ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{n}×</span>
                  ) : (
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`Tirar ${p.title}`} disabled={viewOnly || n === 0} onClick={() => set(p.id, -1)} className={ui.ghostSm}>
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{n}</span>
                    <button type="button" aria-label={`Adicionar ${p.title}`} disabled={viewOnly || left === 0} onClick={() => set(p.id, 1)} className={ui.ghostSm}>
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-3 rounded-2xl bg-white/50 p-4 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4" /> Entregar em</p>
              {address && !editing && !viewOnly && (
                <button type="button" onClick={() => setEditing(true)} className="glass rounded-full px-4 py-1.5 text-xs font-semibold">Alterar</button>
              )}
            </div>
            {address && !editing ? (
              <div className="text-sm">{formatAddress(address).map((l) => <p key={l}>{l}</p>)}</div>
            ) : (
              <>
                {!address && informed && (
                  <p className="text-sm">
                    <span className="block text-xs text-stone-500">Endereço que você informou no cadastro (confira e preencha os campos, a partir do CEP):</span>
                    {informed}
                  </p>
                )}
                {!viewOnly && <AddressFields initial={address ?? { zip: zipFromText(informed) ?? "" }} inputClass={field} />}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={ui.hint}>{single ? "Confira o endereço e envie o pedido." : left > 0 ? `Falta escolher ${left} ${plural(left)}.` : "Tudo escolhido."}</p>
            {!viewOnly && (
              <button disabled={pending || left !== 0} className={ui.btn}>
                {pending ? "Enviando…" : "Enviar pedido"}
              </button>
            )}
          </div>
          <Msg state={state} />
        </form>
    </section>
  );
}
