"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { prepareNfUpload, submitWithdrawal, type SubmitState } from "@/app/portal/[marca]/saque/actions";
import { CopyButton } from "./copy-button";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toCents = (s: string) => {
  const clean = s.replace(/[^\d,]/g, "");
  if (!clean) return NaN;
  const [int, dec = ""] = clean.split(",");
  return Number(int) * 100 + Number((dec + "00").slice(0, 2));
};

type Props = {
  marca: string;
  requestId: string;
  availableCents: number;
  minCents: number;
  takerDocument: string | null;
  nfInstructions: string | null;
  pixKeyMasked: string | null;
};

/** Passo a passo do saque (D-WDFLOW): valor → dados da nota fiscal → PDF → confirmar. */
export function WithdrawalForm(p: Props) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(brl(p.availableCents).replace("R$", "").trim());
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitWithdrawal, undefined);
  const cents = toCents(amount);
  const amountOk = Number.isFinite(cents) && cents >= p.minCents && cents <= p.availableCents;

  function upload() {
    if (!file) return;
    setUploadError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setUploadError("Envie o arquivo em PDF.");
    if (file.size > 10 * 1024 * 1024) return setUploadError("O PDF passa de 10 MB.");
    startUpload(async () => {
      const ticket = await prepareNfUpload(p.marca, p.requestId);
      if (!ticket.ok) return setUploadError(ticket.error);
      const res = await fetch(ticket.signedUrl, { method: "PUT", headers: { "content-type": "application/pdf", "x-upsert": "true" }, body: file });
      if (!res.ok) return setUploadError("O envio falhou. Tente de novo.");
      setUploaded(true);
      setStep(4);
    });
  }

  const card = "glass flex flex-col gap-4 rounded-3xl p-5 md:p-6";
  const primary = "rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50";
  const ghost = "rounded-full px-4 py-3 text-sm text-stone-600 dark:text-stone-300";
  const Steps = () => (
    <ol className="flex gap-2 text-xs" aria-label="Etapas">
      {["Valor", "Nota fiscal", "Enviar PDF", "Confirmar"].map((label, i) => (
        <li key={label} className={`flex-1 rounded-full px-2 py-1.5 text-center ${i + 1 === step ? "bg-brand font-semibold text-white" : i + 1 < step ? "bg-brand/15 text-brand dark:text-brand-2" : "bg-stone-200/60 text-stone-500 dark:bg-white/5"}`}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Steps />
      {step === 1 && (
        <section className={card}>
          <h1 className="text-lg font-semibold">Quanto você quer sacar?</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">Disponível: <strong>{brl(p.availableCents)}</strong> · mínimo {brl(p.minCents)}</p>
          <label className="flex items-center gap-2 rounded-2xl border border-stone-300/70 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <span className="text-stone-500">R$</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent text-2xl font-semibold tabular-nums outline-none" aria-label="Valor do saque" />
          </label>
          {!amountOk && amount && <p className="text-sm text-red-700 dark:text-red-400">O valor precisa ficar entre {brl(p.minCents)} e {brl(p.availableCents)}.</p>}
          <button className={primary} disabled={!amountOk} onClick={() => setStep(2)}>Continuar</button>
        </section>
      )}

      {step === 2 && (
        <section className={card}>
          <h1 className="text-lg font-semibold">Emita a nota fiscal de serviço</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">Emita a NF no seu CNPJ/MEI com estes dados e baixe o PDF:</p>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
              <div><dt className="text-xs text-stone-500">CNPJ do tomador</dt><dd className="font-mono font-semibold">{p.takerDocument ?? "em breve"}</dd></div>
              {p.takerDocument && <CopyButton value={p.takerDocument} label="Copiar" />}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
              <div><dt className="text-xs text-stone-500">Valor da nota</dt><dd className="font-semibold tabular-nums">{brl(cents)}</dd></div>
            </div>
            <div className="rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
              <dt className="text-xs text-stone-500">Descrição do serviço</dt>
              <dd className="whitespace-pre-line">{p.nfInstructions ?? "A equipe vai informar a descrição e o código do serviço em breve."}</dd>
            </div>
          </dl>
          <div className="flex justify-between">
            <button className={ghost} onClick={() => setStep(1)}>Voltar</button>
            <button className={primary} onClick={() => setStep(3)}>Já emiti a nota</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className={card}>
          <h1 className="text-lg font-semibold">Envie o PDF da nota fiscal</h1>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 px-4 py-8 text-center text-sm dark:border-white/15">
            <FileUp className="size-6 text-stone-500" />
            {file ? <span className="font-medium">{file.name}</span> : <span>Toque para escolher o PDF (até 10 MB)</span>}
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploaded(false); }} />
          </label>
          {uploadError && <p className="text-sm text-red-700 dark:text-red-400">{uploadError}</p>}
          <div className="flex justify-between">
            <button className={ghost} onClick={() => setStep(2)}>Voltar</button>
            <button className={primary} disabled={!file || uploading} onClick={upload}>
              {uploading ? <Loader2 className="inline size-4 animate-spin" /> : "Enviar e continuar"}
            </button>
          </div>
        </section>
      )}

      {step === 4 && uploaded && (
        <form action={action} className={card}>
          <h1 className="text-lg font-semibold">Confira e confirme</h1>
          <input type="hidden" name="marca" value={p.marca} />
          <input type="hidden" name="requestId" value={p.requestId} />
          <input type="hidden" name="amount" value={amount} />
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-stone-500">Valor</dt><dd className="font-semibold tabular-nums">{brl(cents)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Nota fiscal</dt><dd className="max-w-[60%] truncate">{file?.name}</dd></div>
            {p.pixKeyMasked ? (
              <div className="flex justify-between"><dt className="text-stone-500">Pix</dt><dd className="font-mono">{p.pixKeyMasked}</dd></div>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-stone-500">Chave Pix para receber</span>
                <input name="pixKey" required className="rounded-xl border border-stone-300/70 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5" />
              </label>
            )}
          </dl>
          <p className="text-xs text-stone-500">O valor fica "em saque" até o pagamento. A equipe confere a nota e paga por Pix.</p>
          {state?.error && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
          <div className="flex justify-between">
            <button type="button" className={ghost} onClick={() => setStep(3)}>Voltar</button>
            <button className={primary} disabled={pending}>{pending ? <Loader2 className="inline size-4 animate-spin" /> : "Pedir saque"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
