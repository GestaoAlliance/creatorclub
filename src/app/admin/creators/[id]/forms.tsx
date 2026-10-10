"use client";

import { useActionState, useState } from "react";
import { adjustAction, checklistAction, contactAction, couponCreateAction, inviteAction, rateAction, rateFixAction, reviewedAction, statusAction, type State } from "./actions";

import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";

const input = ui.input;
const btn = `${ui.btn} self-start`;

export function ContactForm(p: { creatorId: string; name: string; email: string; phone: string | null; fakeEmail: boolean }) {
  const [state, action, pending] = useActionState(contactAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="creatorId" value={p.creatorId} />
      <label className={ui.label}>Nome<input className={input} name="name" defaultValue={p.name} required /></label>
      <label className={ui.label}>E-mail
        <input className={input} name="email" type="email" defaultValue={p.fakeEmail ? "" : p.email} placeholder={p.fakeEmail ? "e-mail real (o do app antigo era falso)" : ""} required />
      </label>
      <label className={ui.label}>Telefone<input className={input} name="phone" defaultValue={p.phone ?? ""} /></label>
      <Msg state={state} />
      <button className={btn} disabled={pending}>Salvar contato</button>
    </form>
  );
}

export function StatusForm({ creatorId, status, labels }: { creatorId: string; status: string; labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(statusAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <select className={ui.inputSm} name="status" defaultValue={status}>
        {Object.entries(labels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className={btn} disabled={pending}>Salvar situação</button>
      <Msg state={state} />
    </form>
  );
}

export function RateChangeForm({ creatorId }: { creatorId: string }) {
  const [state, action, pending] = useActionState(rateAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <input className={`${ui.inputSm} w-20`} name="rate" placeholder="15" inputMode="decimal" required />%
      <button className={btn} disabled={pending}>Mudar taxa a partir de agora</button>
      <Msg state={state} />
    </form>
  );
}

type Checklist = {
  start: string | null;
  end: string | null;
  contractSigned: boolean | null;
  couponRegistered: boolean | null;
  followsOnInstagram: boolean | null;
  inGroup: boolean | null;
  tagged: boolean | null;
  note: string | null;
  templateId: string | null;
  receivesAsIndividual: boolean;
};

const CHECK_ITEMS: { name: keyof Checklist; label: string }[] = [
  { name: "contractSigned", label: "Contrato assinado" },
  { name: "couponRegistered", label: "Cupom cadastrado" },
  { name: "followsOnInstagram", label: "Seguimos no Instagram" },
  { name: "inGroup", label: "Grupo" },
  { name: "tagged", label: "Etiquetada" },
];

const tri = (v: unknown) => (v === true ? "sim" : v === false ? "nao" : "");

/** Contrato e checklist (D-CHECKLIST): fim vazio = início + 6 meses (UGC 3). */
export function ChecklistForm({ creatorId, c, templates }: { creatorId: string; c: Checklist; templates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(checklistAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="creatorId" value={creatorId} />
      <label className={ui.label}>
        Modelo de contrato assinado
        <select name="templateId" defaultValue={c.templateId ?? ""} className={ui.input}>
          <option value="">— (padrão da marca)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className={ui.label}>
        Recebe como
        <select name="receivesAsIndividual" defaultValue={c.receivesAsIndividual ? "pf" : "pj"} className={ui.input}>
          <option value="pj">Empresa (CNPJ, com nota fiscal)</option>
          <option value="pf">Pessoa física (CPF, com recibo no portal)</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={ui.label}>
          Início
          <input type="date" name="start" defaultValue={c.start ?? ""} className={ui.input} />
        </label>
        <label className={ui.label}>
          Fim
          <input type="date" name="end" defaultValue={c.end ?? ""} className={ui.input} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CHECK_ITEMS.map((i) => (
          <label key={i.name} className={ui.label}>
            {i.label}
            <select name={i.name} defaultValue={tri(c[i.name])} className={ui.input}>
              <option value="">—</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
        ))}
      </div>
      <label className={ui.label}>
        Observação
        <input name="note" maxLength={300} defaultValue={c.note ?? ""} placeholder="ex.: @ não encontrado" className={ui.input} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btn} disabled={pending}>Salvar</button>
        <Msg state={state} />
      </div>
    </form>
  );
}

/** Correção da taxa desde o início (D-RATEFIX): só super admin e só com o saque travado. */
export function RateFixForm({ creatorId }: { creatorId: string }) {
  const [state, action, pending] = useActionState(rateFixAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm("Corrigir a taxa de todos os pedidos desta creator? A diferença entra no extrato.")) e.preventDefault(); }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="creatorId" value={creatorId} />
      <input className={`${ui.inputSm} w-20`} name="rate" placeholder="10" inputMode="decimal" required />%
      <button className={btn} disabled={pending}>Corrigir desde o início</button>
      <Msg state={state} />
    </form>
  );
}

export function InviteButton({ creatorId, accountId }: { creatorId: string; accountId: string }) {
  const [state, action, pending] = useActionState(inviteAction, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <input type="hidden" name="creatorId" value={creatorId} />
        <input type="hidden" name="accountId" value={accountId} />
        <button className={btn} disabled={pending}>Gerar link de convite</button>
      </form>
      <Msg state={state} />
      {state?.link && (
        <div className={ui.label}>
          <p>Link de uso único (vale 7 dias). Envie pelo WhatsApp; ele não aparece de novo.</p>
          <code className={`${ui.inset} break-all font-mono text-xs`}>{state.link}</code>
          <button type="button" className={ui.ghostSm + " self-start"} onClick={() => { void navigator.clipboard.writeText(state.link!); setCopied(true); }}>
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AdjustForm({ creatorId, requestId }: { creatorId: string; requestId: string }) {
  const [state, action, pending] = useActionState(adjustAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="creatorId" value={creatorId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className={ui.label}>Valor (R$; negativo para descontar)
        <input className={input} name="amount" placeholder="150,00 ou -20,50" inputMode="decimal" required />
      </label>
      <label className={ui.label}>Motivo (aparece no extrato)
        <input className={input} name="reason" minLength={5} required />
      </label>
      <Msg state={state} />
      <button className={btn} disabled={pending}>Lançar ajuste</button>
    </form>
  );
}

/** "Conferi os números" (D-ANAREVIEW): libera o saldo de abertura desta creator para o Pagamento. */
export function ReviewedButton({ creatorId }: { creatorId: string }) {
  const [state, action, pending] = useActionState(reviewedAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Confirmar que você conferiu cupons, taxa e vendas desta creator?")) e.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="creatorId" value={creatorId} />
      <button className={btn} disabled={pending}>Conferi os números desta creator</button>
      <Msg state={state} />
    </form>
  );
}

export function CouponCreateForm({ creatorId }: { creatorId: string }) {
  const [state, action, pending] = useActionState(couponCreateAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="creatorId" value={creatorId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className={ui.label}>Código
          <input className={`${ui.inputSm} font-mono uppercase`} name="code" placeholder="SÓ LETRAS, ATÉ 8" maxLength={8} required />
        </label>
        <label className={ui.label}>Desconto (%)
          <input className={`${ui.inputSm} w-20`} name="discount" defaultValue="5" inputMode="decimal" required />
        </label>
        <button className={btn} disabled={pending}>{pending ? "Criando…" : "Criar cupom na Shopify"}</button>
      </div>
      <p className={ui.hint}>Vale para todos os produtos e combina com outros descontos. Sem taxa definida em contrato de permuta, a taxa fica 0%.</p>
      <Msg state={state} />
    </form>
  );
}
