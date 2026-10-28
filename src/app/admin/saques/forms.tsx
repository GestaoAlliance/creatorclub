"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { approveAction, payAction, payBatchAction, recheckAction, rejectAction, remessaAction, removeRemessaAction, retornoAction } from "./actions";

export function ApproveForm({ withdrawalId, label }: { withdrawalId: string; label: string }) {
  const [state, action, pending] = useActionState(approveAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Aprovar o saque de ${label}? Ele vai para o Pagamento fazer o Pix.`)) e.preventDefault();
      }}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={`${ui.btn} w-full`} disabled={pending}>{pending ? "Salvando…" : "Aprovar para pagamento"}</button>
      <Msg state={state} />
    </form>
  );
}

export function PayForm({ withdrawalId, label }: { withdrawalId: string; label: string }) {
  const [state, action, pending] = useActionState(payAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Confirmar que o Pix de ${label} foi feito?`)) e.preventDefault();
      }}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={`${ui.btn} w-full`} disabled={pending}>{pending ? "Salvando…" : "Pix feito: marcar como pago"}</button>
      <Msg state={state} />
    </form>
  );
}

export function RejectForm({ withdrawalId }: { withdrawalId: string }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <div className="flex gap-2">
        <input name="reason" required maxLength={300} placeholder="Motivo da recusa (a creator vê)" className={`${ui.inputSm} min-w-0 flex-1`} />
        <button className={ui.dangerSm} disabled={pending}>Recusar</button>
      </div>
      <Msg state={state} />
    </form>
  );
}

/** "Conferir de novo": lê a nota outra vez e atualiza o selo. */
export function RecheckForm({ withdrawalId }: { withdrawalId: string }) {
  const [state, action, pending] = useActionState(recheckAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={ui.ghostSm} disabled={pending}>
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} /> {pending ? "Conferindo…" : "Conferir de novo"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export const BATCH_FORM = "lote-pagar";
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[name=ids][form=${BATCH_FORM}]`)];

/** Caixa de cada aprovado para o pagamento em lote (fica no cartão, liga no formulário do lote pelo `form`). */
export function BatchCheck({ withdrawalId, cents, name }: { withdrawalId: string; cents: number; name: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="ids" value={withdrawalId} form={BATCH_FORM} data-cents={cents} className="size-4 accent-[var(--brand)]" onChange={() => window.dispatchEvent(new Event("lote"))} />
      Incluir no lote <span className="sr-only">{name}</span>
    </label>
  );
}

/** M1.5 (D-WDBATCH): baixar a planilha dos aprovados e, depois do Pix em lote, marcar os escolhidos como pagos. */
export function BatchBar({ count }: { count: number }) {
  const [state, action, pending] = useActionState(payBatchAction, undefined);
  const [sel, setSel] = useState({ n: 0, cents: 0 });
  const recount = () => {
    const on = boxes().filter((b) => b.checked);
    setSel({ n: on.length, cents: on.reduce((s, b) => s + Number(b.dataset.cents), 0) });
  };
  useEffect(() => {
    window.addEventListener("lote", recount);
    recount();
    return () => window.removeEventListener("lote", recount);
  }, [state]);
  return (
    <form
      id={BATCH_FORM}
      action={action}
      onSubmit={(e) => {
        if (!sel.n || !confirm(`Confirmar que os ${sel.n} Pix (total ${brl(sel.cents)}) foram feitos?`)) e.preventDefault();
      }}
      className={`${ui.card} flex flex-col gap-3`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm">
          <strong>Pagamento em lote</strong> · {count} {count === 1 ? "aprovado" : "aprovados"} · selecionados: <strong>{sel.n}</strong> ({brl(sel.cents)})
        </p>
        <a href="/admin/saques/lote" className={ui.ghostSm}>Baixar planilha dos aprovados</a>
        <button type="button" className={ui.ghostSm} onClick={() => { const all = boxes(); const on = all.some((b) => !b.checked); all.forEach((b) => (b.checked = on)); recount(); }}>
          Selecionar todos
        </button>
        <button className={ui.btnSm} disabled={pending || sel.n === 0}>{pending ? "Salvando…" : "Pix feitos: marcar selecionados como pagos"}</button>
      </div>
      <Msg state={state} />
    </form>
  );
}

/** D-REMESSA: arquivo de remessa SICOOB (Pix) com os aprovados ainda não enviados ao banco. */
export function RemessaBar({ brandId, count, cents, today, problems }: { brandId: string; count: number; cents: number; today: string; problems: { name: string | null; problem: string }[] }) {
  const [state, action, pending] = useActionState(remessaAction, undefined);
  useEffect(() => {
    if (!state?.file) return;
    const url = URL.createObjectURL(new Blob([state.file.content], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: state.file.name });
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);
  const blocking = problems.filter((p) => !p.problem.startsWith("Nenhum saque"));
  return (
    <form action={action} className={`${ui.card} flex flex-col gap-3`}>
      <input type="hidden" name="brandId" value={brandId} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-semibold">Remessa SICOOB (Pix)</p>
          <p className={ui.hint}>
            {count === 0 ? "Nenhum saque aprovado esperando remessa." : `${count} ${count === 1 ? "saque aprovado" : "saques aprovados"} ainda não ${count === 1 ? "enviado" : "enviados"} ao banco · ${brl(cents)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className={ui.label}>
            Data do pagamento
            <input type="date" name="payDay" min={today} defaultValue={today} required className={ui.inputSm} />
          </label>
          <button className={ui.btnSm} disabled={pending || count === 0 || blocking.length > 0}>{pending ? "Gerando…" : "Gerar arquivo de remessa"}</button>
        </div>
      </div>
      {blocking.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
          {blocking.map((p, i) => <li key={i}>{p.name ? `${p.name}: ` : ""}{p.problem}</li>)}
        </ul>
      )}
      {state?.problems && state.problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">{state.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
      )}
      <Msg state={state?.error || state?.ok ? { ...(state.error ? { error: state.error } : {}), ...(state.ok ? { ok: state.ok } : {}) } : undefined} />
      <p className={ui.hint}>Os saques do arquivo ficam marcados como "enviados ao banco". Depois que o banco processar, suba o retorno abaixo (ou marque como pagos aqui).</p>
    </form>
  );
}

/** Saque recusado pelo banco: tira da remessa para ir na próxima. */
export function RemoveRemessaForm({ withdrawalId }: { withdrawalId: string }) {
  const [state, action, pending] = useActionState(removeRemessaAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <button className={`${ui.ghostSm} self-start`} disabled={pending}>Banco recusou: tirar da remessa</button>
      <Msg state={state} />
    </form>
  );
}

const RESULT_LABEL = { PAID: "Pago", SCHEDULED: "Agendado", PENDING: "Pendente de assinatura", REJECTED: "Recusado" } as const;
const STATE_LABEL = { ok: "", done: "Já está assim", notfound: "Não é saque desta remessa", amount: "Valor diferente do saque: confira" } as const;

/** D-RETORNO: sobe o retorno do SICOOB, mostra a prévia e o Pagamento confirma. */
export function RetornoForm({ brandId }: { brandId: string }) {
  const [state, action, pending] = useActionState(retornoAction, undefined);
  const preview = state?.preview;
  const toApply = preview?.rows.filter((r) => r.state === "ok").length ?? 0;
  return (
    <div className={`${ui.card} flex flex-col gap-3`}>
      <div>
        <p className="font-semibold">Retorno do banco</p>
        <p className={ui.hint}>Baixe o arquivo de retorno no Internet Banking do SICOOB e escolha aqui. Você confere antes de confirmar.</p>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="mode" value="preview" />
        <input type="file" name="file" accept=".txt,.ret,.rem,text/plain" required className={ui.inputSm} />
        <button className={ui.ghostSm} disabled={pending}>{pending ? "Lendo…" : "Conferir retorno"}</button>
      </form>
      {preview && (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="mode" value="apply" />
          <input type="hidden" name="content" value={preview.content} />
          <p className="text-sm font-medium">Remessa nº {preview.nsa}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {preview.rows.map((r) => (
              <li key={r.ref} className="flex flex-wrap justify-between gap-2">
                <span>{r.name} · {brl(r.amountCents)}</span>
                <span className={r.result === "PAID" ? "text-emerald-700 dark:text-emerald-400" : r.result === "REJECTED" ? "text-red-700 dark:text-red-400" : "text-sky-800 dark:text-sky-300"}>
                  {RESULT_LABEL[r.result]}
                  {r.result === "REJECTED" || r.result === "PENDING" ? `: ${r.reason}` : ""}
                  {r.state !== "ok" && <span className={ui.hint}> ({STATE_LABEL[r.state]})</span>}
                </span>
              </li>
            ))}
          </ul>
          <button className={`${ui.btnSm} self-start`} disabled={pending || toApply === 0}>
            {pending ? "Aplicando…" : toApply === 0 ? "Nada a mudar" : `Confirmar ${toApply} ${toApply === 1 ? "saque" : "saques"}`}
          </button>
          <p className={ui.hint}>Pago: sai do saldo e a creator é avisada. Recusado: sai da remessa, vai na próxima e a creator é avisada para conferir a chave Pix.</p>
        </form>
      )}
      {state?.problems && state.problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">{state.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
      )}
      <Msg state={state?.error || state?.ok ? { ...(state.error ? { error: state.error } : {}), ...(state.ok ? { ok: state.ok } : {}) } : undefined} />
    </div>
  );
}
