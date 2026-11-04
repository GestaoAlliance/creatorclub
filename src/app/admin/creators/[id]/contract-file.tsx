"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { attachContractAction, prepareContractUpload, type State } from "./actions";

/** D-CONTRACTFILE: anexar o PDF do contrato assinado (sobe direto ao bucket privado; o servidor confere e grava). */
export function ContractFileForm({ creatorId, has }: { creatorId: string; has: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [state, action, pending] = useActionState<State, FormData>(attachContractAction, undefined);

  function send() {
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setError("Envie o contrato em PDF.");
    if (file.size > 10 * 1024 * 1024) return setError("O PDF passa de 10 MB.");
    const uploadId = crypto.randomUUID();
    startUpload(async () => {
      const ticket = await prepareContractUpload(creatorId, uploadId);
      if (!ticket.ok) return setError(ticket.error);
      const res = await fetch(ticket.signedUrl, { method: "PUT", headers: { "content-type": "application/pdf", "x-upsert": "true" }, body: file });
      if (!res.ok) return setError("O envio falhou. Tente de novo.");
      const form = new FormData();
      form.set("creatorId", creatorId);
      form.set("uploadId", uploadId);
      action(form);
      setFile(null);
    });
  }

  const busy = uploading || pending;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-sm dark:border-white/15">
        <FileUp className="size-4 shrink-0 text-stone-500" />
        <span className="min-w-0 truncate">{file ? file.name : has ? "Trocar o PDF do contrato assinado" : "Escolher o PDF do contrato assinado"}</span>
        <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
      </label>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <Msg state={state} />
      <button type="button" className={`${ui.btn} self-start`} disabled={!file || busy} onClick={send}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : has ? "Anexar o novo PDF" : "Anexar contrato"}
      </button>
    </div>
  );
}
