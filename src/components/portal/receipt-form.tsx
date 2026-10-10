"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { submitReceiptWithdrawal, type SubmitState } from "@/app/portal/[marca]/saque/actions";
import { receiptText } from "@/domain";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  marca: string;
  requestId: string;
  availableCents: number;
  pixKeyMasked: string | null;
  receipt: { payerName: string; payerDocument: string | null; brandName: string; releasedThrough: string | null; day: string };
};

/** Saque de pessoa física (D-PFRECEIPT): confere o recibo, digita nome completo e CPF e aceita; sem nota fiscal. */
export function ReceiptForm(p: Props) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitReceiptWithdrawal, undefined);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const digits = cpf.replace(/\D/g, "");
  const text = receiptText({
    ...p.receipt,
    fullName: name.trim() || "[seu nome completo]",
    cpf: digits.length === 11 ? digits : "___________",
    amountCents: p.availableCents,
  });
  const input = "rounded-xl border border-stone-300/70 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5";

  return (
    <form action={action} className="glass mx-auto flex w-full max-w-xl flex-col gap-4 rounded-3xl p-5 md:p-6">
      <h1 className="text-lg font-semibold">Saque de {brl(p.availableCents)} com recibo</h1>
      <input type="hidden" name="marca" value={p.marca} />
      <input type="hidden" name="requestId" value={p.requestId} />
      <input type="hidden" name="amount" value={(p.availableCents / 100).toFixed(2).replace(".", ",")} />
      <div className="whitespace-pre-line rounded-2xl bg-white/60 px-4 py-4 text-sm leading-relaxed dark:bg-white/5">{text}</div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-stone-500">Nome completo</span>
        <input name="fullName" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-stone-500">CPF</span>
        <input name="cpf" required inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} className={input} />
      </label>
      {p.pixKeyMasked ? (
        <p className="flex justify-between text-sm"><span className="text-stone-500">Pix</span><span className="font-mono">{p.pixKeyMasked}</span></p>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-stone-500">Chave Pix para receber</span>
          <input name="pixKey" required className={input} />
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-[var(--brand)]" />
        Conferi e aceito este recibo. Ele vale como quitação depois que o Pix for feito.
      </label>
      <p className="text-xs text-stone-500">O valor fica "em saque" até o pagamento. A equipe confere e paga por Pix até o dia 15.</p>
      {state?.error && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
      <div className="flex justify-end">
        <button className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}>
          {pending ? <Loader2 className="inline size-4 animate-spin" /> : "Aceitar e pedir saque"}
        </button>
      </div>
    </form>
  );
}
