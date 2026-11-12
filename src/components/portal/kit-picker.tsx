"use client";

import { Gift, MapPin, Minus } from "lucide-react";
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
  kit: { id: string; products: number; preset?: { id: string; title: string; photo?: string | null; outOfStock?: boolean }[] | null };
  monthLabel: string;
  welcome?: boolean;
  /** D-GOALKIT: produto da meta de R$ 1.000. */
  goal?: boolean;
  products: { id: string; title: string; photo?: string | null; outOfStock?: boolean }[];
  address: Address | null;
  informed?: string | null;
  viewOnly: boolean;
}) {
  const [editing, setEditing] = useState(address === null);
  const [addrOk, setAddrOk] = useState(false);
  const [state, action, pending] = useActionState(chooseKitAction, undefined);
  // Pedido do responsável (2026-10-27): com uma opção só (Revita, VermeFree), o produto já vem escolhido.
  // D-WELCOMECHOICE: kit com produtos definidos (1º pedido pela opção do cadastro) também já vem pronto.
  const list = kit.preset ?? products;
  // D-WELCOMEPICK: preset com o mesmo número de produtos do kit vai fixo; com mais, são as opções dela.
  const presetFixed = Boolean(kit.preset) && kit.preset!.length === kit.products;
  const fixed = presetFixed || list.length === 1;
  const single = fixed ? list[0]! : null;
  const [qty, setQty] = useState<Record<string, number>>(() =>
    presetFixed ? Object.fromEntries(kit.preset!.map((p) => [p.id, 1])) : single ? { [single.id]: kit.products } : {},
  );
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
          {/* D-PORTALSHIP: produtos em cartões com foto; toque soma, o "−" tira; sem estoque fica apagado. */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((p) => {
              const n = qty[p.id] ?? 0;
              const can = !viewOnly && !single && left > 0 && !p.outOfStock;
              return (
                <li key={p.id} className={`relative flex flex-col overflow-hidden rounded-3xl bg-white/70 ring-2 transition dark:bg-white/5 ${n ? "ring-brand dark:ring-brand-2" : "ring-transparent"} ${p.outOfStock ? "opacity-50" : ""}`}>
                  <input type="hidden" name={`qty:${p.id}`} value={n} />
                  <button type="button" disabled={!can} onClick={() => set(p.id, 1)} aria-label={`Adicionar ${p.title}`} className="flex flex-1 flex-col items-center gap-2 p-3 text-center disabled:cursor-default">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" width={120} height={120} className="aspect-square w-full max-w-28 rounded-2xl bg-white object-contain" />
                    ) : (
                      <span className="grid aspect-square w-full max-w-28 place-content-center rounded-2xl bg-stone-200/70 text-stone-400 dark:bg-white/10"><Gift className="size-8" /></span>
                    )}
                    <span className="text-sm font-medium leading-snug">{p.title}</span>
                    {p.outOfStock && <span className="rounded-full bg-stone-500/15 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">sem estoque</span>}
                  </button>
                  {n > 0 && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-brand px-1 py-0.5 text-white shadow dark:bg-brand-2 dark:text-stone-900">
                      {!single && <button type="button" aria-label={`Tirar ${p.title}`} disabled={viewOnly} onClick={() => set(p.id, -1)} className="grid size-6 place-content-center rounded-full hover:bg-white/20"><Minus className="size-3.5" /></button>}
                      <span className="min-w-5 px-1 text-center text-sm font-semibold tabular-nums">{n}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {!single && <p className="text-center text-sm font-semibold">{total} de {kit.products} {plural(kit.products)} escolhidos{!viewOnly && left > 0 ? " · toque no produto para escolher" : ""}</p>}
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
          {/* D-PORTALSHIP: "está certo?" antes de confirmar (endereço errado é o problema mais caro do envio). */}
          {!viewOnly && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required checked={addrOk} onChange={(e) => setAddrOk(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>Conferi: o endereço de entrega está certo.</span>
            </label>
          )}
          <div className="sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur md:static md:bg-transparent md:p-0 md:shadow-none dark:bg-stone-900/95 md:dark:bg-transparent">
            <p className={ui.hint}>{single ? "Confira o endereço e envie o pedido." : left > 0 ? `Falta escolher ${left} ${plural(left)}.` : "Tudo escolhido."}</p>
            {!viewOnly && (
              <button disabled={pending || left !== 0 || !addrOk} className={ui.btn}>
                {pending ? "Enviando…" : "Confirmar pedido"}
              </button>
            )}
          </div>
          <Msg state={state} />
        </form>
    </section>
  );
}
