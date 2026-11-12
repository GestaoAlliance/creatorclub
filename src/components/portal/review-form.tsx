"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";
import { reviewAction } from "@/app/portal/[marca]/envios/actions";

/** D-SHIPREVIEW: avaliar o envio recebido (1 a 5 estrelas e, se quiser, um comentário curto). */
export function ReviewForm({ marca, shipmentId }: { marca: string; shipmentId: string }) {
  const [state, action, pending] = useActionState(reviewAction, undefined);
  const [rating, setRating] = useState(0);
  if (state?.ok) return <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white/60 p-3 dark:bg-white/5">
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="rating" value={rating} />
      <p className="text-sm font-medium">O que achou dos produtos?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`} onClick={() => setRating(n)} className="p-0.5">
            <Star className={`size-7 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-stone-300 dark:text-stone-600"}`} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea name="comment" maxLength={280} rows={2} placeholder="Conte o que gostou (opcional)" className="rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5" />
          <button disabled={pending} className="self-start rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Enviando…" : "Enviar avaliação"}</button>
        </>
      )}
      {state?.error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
