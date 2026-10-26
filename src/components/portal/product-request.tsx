"use client";

import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useActionState, useState } from "react";
import { requestProductsAction } from "@/app/portal/[marca]/envios/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { kitNoun, PRODUCT_REQUEST_MAX } from "@/domain";

/** D-PRODUCTREQ: "Pedir produtos" no portal: até 3 por pedido; a equipe aprova e depois envia para o endereço dela. */
export function ProductRequest({
  marca,
  products,
  hasAddress,
  viewOnly,
}: {
  marca: string;
  products: { id: string; title: string }[];
  hasAddress: boolean;
  viewOnly: boolean;
}) {
  const [state, action, pending] = useActionState(requestProductsAction, undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = Object.values(qty).reduce((s, n) => s + n, 0);
  const left = PRODUCT_REQUEST_MAX - total;
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  if (state?.ok) return <p role="status" className={ui.ok}>{state.ok}</p>;

  return (
    <section className={`${ui.card} ring-1 ring-brand/30`}>
      <div className="flex flex-col gap-1">
        <h2 className={ui.h2}><ShoppingBag className="size-4 text-brand dark:text-brand-2" /> Pedir produtos</h2>
        <p className={ui.muted}>
          Escolha até {PRODUCT_REQUEST_MAX} {kitNoun(marca, PRODUCT_REQUEST_MAX)} (por exemplo, para gravar conteúdo). A equipe confere, aprova e envia para o seu endereço.
        </p>
      </div>
      {!hasAddress ? (
        <p className={ui.hint}>Cadastre o endereço completo logo abaixo para pedir.</p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="marca" value={marca} />
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
          <label className={ui.label}>
            Para que você vai usar? (opcional)
            <input name="reason" maxLength={200} placeholder="ex.: gravar o vídeo da campanha de novembro" className={ui.input} disabled={viewOnly} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={ui.hint}>{total === 0 ? `Escolha de 1 a ${PRODUCT_REQUEST_MAX}.` : left > 0 ? `Dá para escolher mais ${left}.` : "Limite do pedido atingido."}</p>
            {!viewOnly && (
              <button disabled={pending || total === 0} className={ui.btn}>
                {pending ? "Enviando…" : "Enviar pedido"}
              </button>
            )}
          </div>
          <Msg state={state} />
        </form>
      )}
    </section>
  );
}
