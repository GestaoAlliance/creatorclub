"use client";

import { useActionState, useState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { NF_DEFAULT_SERVICE } from "@/domain";
import { brandAssetAction, createBrandAction, updateBrandAction } from "./actions";

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
  defaultRate: string;
  defaultDiscount: string;
  approvalSuggestion?: string;
  shopDiscount?: string;
  financeEmail?: string;
  bank?: { convenio: string; agency: string; agencyDv: string; account: string; accountDv: string };
  shipFrom?: { zip: string; street: string; number: string; complement: string; district: string; city: string; state: string; phone: string } | null;
};

/** Cadastrar marca nova ou editar uma existente (A1b). O endereço (slug) só se escolhe ao criar. */
export function BrandForm({ initial, create = false, products = [] }: { initial: Values; create?: boolean; products?: readonly { id: string; title: string; kitOption: boolean }[] }) {
  const titles = products.map((p) => p.title);
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
      {/* M4.4a (D-BRANDLOGIN): padrões que a aprovação de candidata já traz preenchidos. */}
      <fieldset className="flex flex-col gap-3 rounded-2xl border border-stone-200/70 p-4 dark:border-white/10">
        <legend className="px-1 text-sm font-semibold">Padrões para novas creators</legend>
        <p className={ui.hint}>Vêm preenchidos na aprovação de cada candidata (a Ana pode mudar). Quem já é creator mantém a comissão e o desconto dela.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            Comissão padrão (%)
            <input name="defaultRate" defaultValue={initial.defaultRate} inputMode="decimal" required className={ui.input} />
          </label>
          <label className={ui.label}>
            Desconto do cupom padrão (%)
            <input name="defaultDiscount" defaultValue={initial.defaultDiscount} inputMode="decimal" required className={ui.input} />
          </label>
          {/* M5.1 (D-SHOPBALANCE): desconto na loja com o saldo (0 = preço da loja). */}
          {!create && (
            <label className={ui.label}>
              Desconto da creator na loja com o saldo (%)
              <input name="shopDiscount" defaultValue={initial.shopDiscount ?? "0"} inputMode="decimal" className={ui.input} />
            </label>
          )}
          {/* D-NFMAIL: cada nota fiscal enviada vai para este e-mail, com o PDF. */}
          {!create && (
            <label className={ui.label}>
              E-mail do financeiro (recebe cada NF enviada)
              <input name="financeEmail" type="email" defaultValue={initial.financeEmail ?? ""} placeholder="financeiro@marca.com.br" className={ui.input} />
            </label>
          )}
          {/* D-REMESSA: conta no SICOOB para o arquivo de remessa de Pix (Saques → Aprovados). */}
          {!create && (
            <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-stone-200 p-3 sm:col-span-2 sm:grid-cols-5 dark:border-white/10">
              <legend className="px-1 text-sm font-medium">Conta no SICOOB (remessa de Pix)</legend>
              <label className={`${ui.label} col-span-2`}>Convênio CNAB 240<input name="bankConvenio" defaultValue={initial.bank?.convenio ?? ""} placeholder="do Internet Banking" className={ui.input} /></label>
              <label className={ui.label}>Agência<input name="bankAgency" defaultValue={initial.bank?.agency ?? ""} inputMode="numeric" className={ui.input} /></label>
              <label className={ui.label}>Dígito ag.<input name="bankAgencyDv" defaultValue={initial.bank?.agencyDv ?? ""} maxLength={1} className={ui.input} /></label>
              <span className="hidden sm:block" />
              <label className={`${ui.label} col-span-2`}>Conta corrente<input name="bankAccount" defaultValue={initial.bank?.account ?? ""} inputMode="numeric" className={ui.input} /></label>
              <label className={ui.label}>Dígito<input name="bankAccountDv" defaultValue={initial.bank?.accountDv ?? ""} maxLength={1} inputMode="numeric" className={ui.input} /></label>
            </fieldset>
          )}
          {/* D-LABEL: remetente da etiqueta e da declaração de conteúdo (Envios → Imprimir). */}
          {!create && (
            <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-stone-200 p-3 sm:col-span-2 sm:grid-cols-6 dark:border-white/10">
              <legend className="px-1 text-sm font-medium">Endereço de envio (remetente das etiquetas)</legend>
              <label className={`${ui.label} col-span-2`}>CEP<input name="shipFromZip" defaultValue={initial.shipFrom?.zip ?? ""} inputMode="numeric" className={ui.input} /></label>
              <label className={`${ui.label} col-span-2 sm:col-span-3`}>Rua<input name="shipFromStreet" defaultValue={initial.shipFrom?.street ?? ""} className={ui.input} /></label>
              <label className={ui.label}>Número<input name="shipFromNumber" defaultValue={initial.shipFrom?.number ?? ""} className={ui.input} /></label>
              <label className={`${ui.label} col-span-2`}>Complemento<input name="shipFromComplement" defaultValue={initial.shipFrom?.complement ?? ""} className={ui.input} /></label>
              <label className={`${ui.label} col-span-2`}>Bairro<input name="shipFromDistrict" defaultValue={initial.shipFrom?.district ?? ""} className={ui.input} /></label>
              <label className={`${ui.label} col-span-2 sm:col-span-1`}>Cidade<input name="shipFromCity" defaultValue={initial.shipFrom?.city ?? ""} className={ui.input} /></label>
              <label className={ui.label}>UF<input name="shipFromState" defaultValue={initial.shipFrom?.state ?? ""} maxLength={2} className={ui.input} /></label>
              <label className={`${ui.label} col-span-2`}>Telefone<input name="shipFromPhone" defaultValue={initial.shipFrom?.phone ?? ""} inputMode="tel" className={ui.input} /></label>
            </fieldset>
          )}
          {/* D-D4SIGN: "💡 Nossa sugestão" da mensagem de aprovação. */}
          {!create && (
            <label className={`${ui.label} sm:col-span-2`}>
              Produto sugerido na mensagem de aprovação
              <select name="approvalSuggestion" defaultValue={initial.approvalSuggestion ?? ""} className={ui.input}>
                <option value="">Sem sugestão (a linha não aparece)</option>
                {initial.approvalSuggestion && !titles.includes(initial.approvalSuggestion) && <option value={initial.approvalSuggestion}>{initial.approvalSuggestion}</option>}
                {titles.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}
        </div>
        {/* D-KITOPTIONS: o que aparece para a creator escolher na aba Pedidos. */}
        {!create && products.length > 0 && (
          <div className="flex flex-col gap-2">
            <input type="hidden" name="kitOptionsSent" value="1" />
            <p className="text-sm font-medium">Produtos que a creator pode escolher (aba Pedidos)</p>
            <p className={ui.hint}>Nenhum marcado: ela vê todos os produtos ativos da loja.</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {products.map((p) => (
                <label key={p.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="kitOption" value={p.id} defaultChecked={p.kitOption} className="mt-0.5 size-4 shrink-0 accent-current" />
                  <span>{p.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </fieldset>
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

/** M4.4a (D-BRANDLOGIN): logo da tela de entrar da marca. */
export function BrandImage({ brandId, slug, kind, label, hint, version }: { brandId: string; slug: string; kind: "LOGO"; label: string; hint: string; version: string | null }) {
  const [state, action, pending] = useActionState(brandAssetAction, undefined);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {version ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/marca/${slug}/logo?v=${version}`} alt={label} className="h-14 w-44 rounded-xl border border-stone-200/70 bg-white object-contain p-2 dark:border-white/10" />
      ) : (
        <span className="grid h-14 w-44 place-content-center rounded-xl border border-dashed border-stone-300 text-xs text-stone-500 dark:border-white/15">sem imagem</span>
      )}
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="file" name="file" accept="image/png,image/jpeg,image/webp" aria-label={label} className="max-w-56 text-xs file:mr-2 file:rounded-full file:border-0 file:bg-stone-900 file:px-3 file:py-1 file:text-xs file:text-white dark:file:bg-white dark:file:text-stone-900" />
        <button className={ui.btnSm} disabled={pending}>Enviar</button>
        {version && <button name="remove" value="1" className={ui.ghostSm} disabled={pending}>Tirar</button>}
      </form>
      <p className={ui.hint}>{hint}</p>
      <Msg state={state} />
    </div>
  );
}
