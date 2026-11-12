"use client";

import { Eye, PenLine } from "lucide-react";
import { useState } from "react";
import { ui } from "@/components/ui/styles";
import { renderContract, unknownContractFields } from "@/domain";

/** Dados de exemplo da prévia do contrato (D-SETTINGSBOARD): uma creator fictícia, para ver os campos preenchidos. */
const SAMPLE = {
  fullName: "Maria Exemplo da Silva",
  cpf: "12345678900",
  address: "Rua Exemplo, 100, Centro, São Paulo/SP, CEP 01000-000",
  cnpj: null,
  companyName: null,
  coupon: "MARIA10",
  discountBps: 500,
  rateBps: 1500,
  releaseMinCents: 30_000,
  kitTiers: [],
  months: 6,
  videoGoal: 3,
};

/**
 * Título e texto editáveis com "Prévia como a creator vê" (D-SETTINGSBOARD): mesma caixa do portal (termo ou contrato),
 * com os campos {{...}} do contrato preenchidos por uma creator de exemplo e aviso de campo desconhecido.
 */
export function TextWithPreview({ title: t0, body: b0, contract = false, brandSlug }: { title: string; body: string; contract?: boolean; brandSlug?: string }) {
  const [title, setTitle] = useState(t0);
  const [body, setBody] = useState(b0);
  const [preview, setPreview] = useState(false);
  const unknown = contract ? unknownContractFields(body) : [];
  const shown = contract ? renderContract(body, { ...SAMPLE, ...(brandSlug ? { brandSlug } : {}), signedAt: new Date() }) : body;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Modo">
        <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${!preview ? "bg-brand font-semibold text-white dark:bg-brand-2 dark:text-stone-900" : "bg-stone-500/10"}`}><PenLine className="size-3.5" />Editar</button>
        <button type="button" role="tab" aria-selected={preview} onClick={() => setPreview(true)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${preview ? "bg-brand font-semibold text-white dark:bg-brand-2 dark:text-stone-900" : "bg-stone-500/10"}`}><Eye className="size-3.5" />Prévia como a creator vê</button>
      </div>
      {/* Os campos ficam no formulário mesmo na prévia (o que vai ser publicado é o que está aqui). */}
      <div hidden={preview} className="flex flex-col gap-3">
        <label className={ui.label}>
          Título
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className={ui.input} />
        </label>
        <label className={ui.label}>
          Texto
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} required rows={18} className={`${ui.input} font-mono text-xs leading-relaxed`} />
        </label>
      </div>
      {preview && (
        <div className="flex flex-col gap-2 rounded-3xl bg-white/70 p-4 dark:bg-stone-900/60">
          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Como aparece no portal{contract ? " (com os dados de uma creator de exemplo)" : ""}</p>
          <p className="text-lg font-semibold">{title || "(sem título)"}</p>
          <div className={`${ui.inset} max-h-[55vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed`}>{shown || "(sem texto)"}</div>
        </div>
      )}
      {unknown.length > 0 && <p role="alert" className="text-sm text-red-700 dark:text-red-400">Campos que o sistema não conhece (confira a digitação): {unknown.map((f) => `{{${f}}}`).join(", ")}</p>}
    </div>
  );
}
