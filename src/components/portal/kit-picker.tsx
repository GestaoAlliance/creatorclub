"use client";

import { Gift, Minus, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { chooseKitAction } from "@/app/portal/[marca]/envios/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

/** Kit mensal (D-KIT): a creator escolhe os N suplementos que ganhou pelas vendas do mês. */
export function KitPicker({
  marca,
  kit,
  monthLabel,
  products,
  hasAddress,
  viewOnly,
}: {
  marca: string;
  kit: { id: string; products: number };
  monthLabel: string;
  products: { id: string; title: string }[];
  hasAddress: boolean;
  viewOnly: boolean;
}) {
  const [state, action, pending] = useActionState(chooseKitAction, undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = Object.values(qty).reduce((s, n) => s + n, 0);
  const left = kit.products - total;
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  const plural = (n: number) => (n === 1 ? "suplemento" : "suplementos");

  return (
    <section className={`${ui.card} ring-1 ring-brand/30`}>
      <div className="flex flex-col gap-1">
        <h2 className={ui.h2}><Gift className="size-4 text-brand dark:text-brand-2" /> Você ganhou {kit.products} {plural(kit.products)}!</h2>
        <p className={ui.muted}>Pelas suas vendas de {monthLabel}. Escolha os produtos e a equipe prepara o envio para o seu endereço.</p>
      </div>
      {!hasAddress ? (
        <p className={ui.hint}>Cadastre o endereço completo acima para escolher o kit.</p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="marca" value={marca} />
          <input type="hidden" name="kitId" value={kit.id} />
          <ul className={ui.list}>
            {products.map((p) => {
              const n = qty[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className={`text-sm ${n ? "font-medium" : ""}`}>{p.title}</span>
                  <input type="hidden" name={`qty:${p.id}`} value={n} />
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`Tirar ${p.title}`} disabled={viewOnly || n === 0} onClick={() => set(p.id, -1)} className={ui.ghostSm}>
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{n}</span>
                    <button type="button" aria-label={`Adicionar ${p.title}`} disabled={viewOnly || left === 0} onClick={() => set(p.id, 1)} className={ui.ghostSm}>
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={ui.hint}>{left > 0 ? `Falta escolher ${left} ${plural(left)}.` : "Tudo escolhido."}</p>
            {!viewOnly && (
              <button disabled={pending || left !== 0} className={ui.btn}>
                {pending ? "Enviando…" : "Confirmar escolha"}
              </button>
            )}
          </div>
          <Msg state={state} />
        </form>
      )}
    </section>
  );
}
