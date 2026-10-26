"use client";

import { FileSignature } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { signContractAction } from "@/app/portal/[marca]/contrato/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { renderContract } from "@/domain";
import { AddressFields } from "@/components/ui/address-fields";
import { zipFromText } from "@/lib/shipments/address";
import type { PendingContract } from "@/lib/contracts/sign";

/**
 * Bloqueio do portal até a creator assinar o contrato (D-SIGNCONTRACT). Ela confere os dados e o texto do contrato
 * vai se preenchendo na hora; o servidor monta o mesmo texto de novo ao assinar, e é esse que fica guardado.
 */
export function ContractGate({ marca, brandName, contract }: { marca: string; brandName: string; contract: PendingContract }) {
  const [state, action, pending] = useActionState(signContractAction, undefined);
  const [v, setV] = useState(contract.prefill);
  // Controlado para não desmarcar quando a assinatura volta com erro (ex.: CPF digitado errado).
  const [accepted, setAccepted] = useState(false);
  // D-CEPAUTO: sem endereço (ou para trocar), os campos com busca pelo CEP montam a linha do contrato.
  const [editAddress, setEditAddress] = useState(!contract.prefill.address.trim());
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const text = useMemo(() => {
    const cnpj = v.cnpj.replace(/\D/g, "") || null;
    return renderContract(contract.body, {
      ...contract.fixed,
      fullName: v.fullName.trim() || "(seu nome completo)",
      cpf: v.cpf.replace(/\D/g, "") || "(seu CPF)",
      address: v.address.trim() || "(seu endereço)",
      cnpj,
      companyName: cnpj ? v.companyName.trim() || "(razão social)" : null,
      signedAt: new Date(),
    });
  }, [v, contract]);
  return (
    <section className={`${ui.card} mx-auto w-full max-w-3xl`}>
      <span className={`${ui.pillOn} self-start`}>Falta 1 passo</span>
      <div className="flex flex-col gap-1">
        <h1 className={`${ui.title} flex items-center gap-2`}><FileSignature className="size-6" /> {contract.title}</h1>
        <p className={ui.muted}>
          Para ativar seu portal do Creator Club da {brandName}, confira seus dados, leia o contrato da parceria e assine. O texto
          abaixo já está preenchido com os seus dados, o seu cupom e as condições da sua parceria.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="marca" value={marca} />
        <input type="hidden" name="documentId" value={contract.documentId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            Nome completo
            <input name="fullName" value={v.fullName} onChange={set("fullName")} autoComplete="name" required className={ui.input} />
          </label>
          <label className={ui.label}>
            CPF
            <input name="cpf" value={v.cpf} onChange={set("cpf")} inputMode="numeric" placeholder="000.000.000-00" required className={ui.input} />
          </label>
          <div className={`${ui.label} sm:col-span-2`}>
            Endereço completo
            {editAddress ? (
              <AddressFields
                compose="address"
                initial={{ zip: zipFromText(contract.prefill.address) ?? "" }}
                inputClass={ui.input}
                onChange={(_, line) => setV((cur) => (cur.address === line ? cur : { ...cur, address: line }))}
              />
            ) : (
              <span className="flex flex-wrap items-center justify-between gap-2">
                <input type="hidden" name="address" value={v.address} />
                <span className="text-sm text-stone-800 dark:text-stone-200">{v.address}</span>
                <button type="button" onClick={() => setEditAddress(true)} className={ui.ghostSm}>Alterar endereço</button>
              </span>
            )}
          </div>
          <label className={ui.label}>
            Telefone (WhatsApp)
            <input name="phone" value={v.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" required className={ui.input} />
          </label>
          <div className="hidden sm:block" />
          <label className={ui.label}>
            CNPJ (se tiver)
            <input name="cnpj" value={v.cnpj} onChange={set("cnpj")} inputMode="numeric" placeholder="00.000.000/0000-00" className={ui.input} />
          </label>
          <label className={ui.label}>
            Razão social (se tiver CNPJ)
            <input name="companyName" value={v.companyName} onChange={set("companyName")} className={ui.input} />
          </label>
        </div>
        <div className={`${ui.inset} max-h-[55vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed`} tabIndex={0} aria-label="Texto do contrato">
          {text}
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="accept" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Li e concordo com o contrato. Sei que meu nome, CPF, a data, a hora, o IP e o texto assinado ficam registrados como prova da assinatura.</span>
        </label>
        <Msg state={state} />
        <button className={`${ui.btn} self-start`} disabled={pending}>{pending ? "Assinando…" : "Assinar contrato"}</button>
      </form>
    </section>
  );
}
