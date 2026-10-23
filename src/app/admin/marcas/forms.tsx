"use client";

import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { NF_DEFAULT_SERVICE } from "@/domain";
import { createBrandAction, updateBrandAction } from "./actions";

type Values = {
  brandId?: string;
  name: string;
  slug?: string;
  primaryColor: string;
  legalName: string;
  cnpj: string;
  storeUrl: string;
  nfServiceCode: string;
  nfServiceDescription: string;
  nfInstructions: string;
  whatsappInstance: string;
};

/** Cadastrar marca nova ou editar uma existente (A1b). O endereço (slug) só se escolhe ao criar. */
export function BrandForm({ initial, create = false }: { initial: Values; create?: boolean }) {
  const [state, action, pending] = useActionState(create ? createBrandAction : updateBrandAction, undefined);
  const [color, setColor] = useState(initial.primaryColor);
  return (
    <form action={action} className="flex flex-col gap-3">
      {initial.brandId && <input type="hidden" name="brandId" value={initial.brandId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={ui.label}>
          Nome
          <input name="name" defaultValue={initial.name} required className={ui.input} />
        </label>
        {create ? (
          <label className={ui.label}>
            Endereço (opcional)
            <input name="slug" defaultValue={initial.slug} placeholder="ex.: vermefree" className={`${ui.input} font-mono`} />
          </label>
        ) : (
          <p className={`${ui.label} justify-end`}>
            <span className="text-xs text-stone-500">Endereço</span>
            <span className="font-mono text-sm">{initial.slug}</span>
          </p>
        )}
        <label className={ui.label}>
          Razão social
          <input name="legalName" defaultValue={initial.legalName} className={ui.input} />
        </label>
        <label className={ui.label}>
          CNPJ (tomador da nota fiscal)
          <input name="cnpj" defaultValue={initial.cnpj} inputMode="numeric" placeholder="00.000.000/0000-00" className={ui.input} />
        </label>
        <label className={ui.label}>
          Site da loja (para onde vai o link da creator)
          <input name="storeUrl" defaultValue={initial.storeUrl} placeholder="https://vermefree.com.br" inputMode="url" className={ui.input} />
        </label>
        <label className={ui.label}>
          Cor da marca
          <span className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Escolher a cor" className="h-10 w-12 cursor-pointer rounded-xl" />
            <input name="primaryColor" value={color} onChange={(e) => setColor(e.target.value)} className={`${ui.input} font-mono`} />
          </span>
        </label>
      </div>
      {/* M1.3 (D-NFDATA): o que a creator vê na tela de saque para emitir a nota. Vazio = serviço padrão. */}
      <fieldset className="flex flex-col gap-3 rounded-2xl border border-stone-200/70 p-4 dark:border-white/10">
        <legend className="px-1 text-sm font-semibold">Dados para a creator emitir a nota</legend>
        <p className={ui.hint}>Aparecem na tela de saque da creator, com botão de copiar. A razão social e o CNPJ são os de cima. A conferência automática da nota exige este código.</p>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className={ui.label}>
            Código do serviço
            <input name="nfServiceCode" defaultValue={initial.nfServiceCode} placeholder={NF_DEFAULT_SERVICE.code} className={`${ui.input} font-mono`} />
          </label>
          <label className={ui.label}>
            Descrição do serviço
            <textarea name="nfServiceDescription" defaultValue={initial.nfServiceDescription} placeholder={NF_DEFAULT_SERVICE.description} rows={2} maxLength={500} className={ui.input} />
          </label>
        </div>
        <label className={ui.label}>
          Observações (opcional)
          <textarea name="nfInstructions" defaultValue={initial.nfInstructions} placeholder="Ex.: não destacar ISS; emita no mesmo mês do pedido." rows={2} maxLength={1000} className={ui.input} />
        </label>
      </fieldset>
      {/* M2.2 (D-WHATSAPP): avisos à creator pelo WhatsApp da marca, via n8n + Evolution. */}
      <label className={ui.label}>
        Instância do WhatsApp para os avisos (Evolution, no n8n)
        <input name="whatsappInstance" defaultValue={initial.whatsappInstance} placeholder="ex.: Botanika" className={ui.input} />
        <span className={ui.hint}>Com o nome preenchido, os avisos da creator (comissão liberada, kit, saque…) vão pelo WhatsApp desta instância, das 9h às 20h, e saem do e-mail. Vazio = portal e e-mail.</span>
      </label>
      <Msg state={state} />
      <button className={`${ui.btn} self-start`} disabled={pending}>{create ? "Criar marca" : "Salvar"}</button>
    </form>
  );
}
