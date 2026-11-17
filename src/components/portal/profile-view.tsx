"use client";

import { AtSign, BadgeCheck, ChevronRight, CircleCheck, FileText, Handshake, KeyRound, Pencil, UserRound } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { requestFixAction, savePersonalAction, saveSocialAction } from "@/app/portal/[marca]/cadastro/actions";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import type { PortalProfile } from "@/lib/portal/profile";

const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Barra de "cadastro completo" no topo (D-PORTALPROFILE). */
export function ProfileProgress({ p }: { p: PortalProfile }) {
  const { pct: value, missing } = p.completeness;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-white/85">Cadastro {value === 100 ? "completo" : `${value}% completo`}</p>
        {value === 100 && <BadgeCheck className="size-4 text-white" />}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${value}%` }} />
      </div>
      {missing.length > 0 && <p className="text-xs text-white/80">Falta: {missing.join(", ")}.</p>}
    </div>
  );
}

const FIELDS = [
  { v: "NAME", l: "Nome" },
  { v: "CPF", l: "CPF" },
  { v: "CNPJ", l: "CNPJ" },
  { v: "PHONE", l: "Telefone" },
  { v: "EMAIL", l: "E-mail" },
  { v: "OTHER", l: "Outro dado" },
] as const;

/** Pedir correção à equipe (D-DATAFIX): nome, CPF, CNPJ, telefone e e-mail só a equipe muda. */
function FixRequest({ marca, field, onClose }: { marca: string; field: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(requestFixAction, undefined);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <form action={action} className="mt-2 flex flex-col gap-2 rounded-2xl bg-white/50 p-3 dark:bg-white/5">
      <input type="hidden" name="marca" value={marca} />
      <label className={ui.label}>
        O que precisa corrigir
        <select name="field" defaultValue={field} className={ui.input}>
          {FIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
        </select>
      </label>
      <label className={ui.label}>
        Qual é o certo?
        <textarea name="message" required minLength={3} maxLength={500} rows={2} placeholder="Ex.: meu telefone novo é (11) 9…" className={ui.input} />
      </label>
      <Msg state={state} />
      <div className="flex gap-2">
        <button disabled={pending} className={ui.btnSm}>Enviar à equipe</button>
        <button type="button" onClick={onClose} className={ui.ghostSm}>Cancelar</button>
      </div>
    </form>
  );
}

/** Dados pessoais (D-SELFEDIT): ela muda e salva na hora; "outro dado" ainda vai como pedido à equipe. */
export function PersonalCard({ p, marca, viewOnly }: { p: PortalProfile; marca: string; viewOnly: boolean }) {
  const [fix, setFix] = useState(false);
  const [sent, setSent] = useState(false);
  const pj = Boolean(p.cnpj) || p.partnership.receivesAs !== "Pessoa física (recibo)";
  return (
    <section className={ui.card}>
      <div>
        <h2 className={ui.h2}><UserRound className="size-4" /> Dados pessoais</h2>
        <p className={ui.hint}>Mudou algo? Toque em Alterar e salve. Vale para todas as marcas em que você é creator.</p>
      </div>
      <div className={ui.list}>
        <EditRow action={savePersonalAction} marca={marca} field="name" label="Nome completo" value={p.name} shown={p.name} viewOnly={viewOnly} />
        <EditRow action={savePersonalAction} marca={marca} field="email" label="E-mail (é com ele que você entra)" value={p.email} shown={p.email} type="email" viewOnly={viewOnly} />
        <EditRow action={savePersonalAction} marca={marca} field="phone" label="Celular (WhatsApp)" value={p.phone} shown={p.phone} type="tel" placeholder="(11) 99999-9999" viewOnly={viewOnly} />
        <EditRow action={savePersonalAction} marca={marca} field="cpf" label="CPF" value={null} hasValue={Boolean(p.cpf)} shown={p.cpf} inputMode="numeric" placeholder="só os números" viewOnly={viewOnly} />
        {pj && <EditRow action={savePersonalAction} marca={marca} field="cnpj" label="CNPJ" value={null} hasValue={Boolean(p.cnpj)} shown={p.cnpj} inputMode="numeric" placeholder="só os números" viewOnly={viewOnly} />}
      </div>
      {!viewOnly && !fix && <button type="button" onClick={() => { setFix(true); setSent(false); }} className={`${ui.link} self-start text-xs`}>Outro dado errado? Fale com a equipe</button>}
      {fix && <FixRequest marca={marca} field="OTHER" onClose={() => { setFix(false); setSent(true); }} />}
      {sent && !fix && <p role="status" className={ui.ok}>Pedido enviado. A equipe corrige e te avisa.</p>}
      {p.fixes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Seus pedidos</p>
          {p.fixes.map((f) => (
            <p key={f.id} className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-300">
              {f.done ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> : <span className="mt-1 size-2 shrink-0 rounded-full bg-amber-500" />}
              <span>
                {br(f.day)} · corrigir {f.label}: “{f.message}” · <strong>{f.done ? "corrigido" : "com a equipe"}</strong>
              </span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

type SaveAction = typeof saveSocialAction;

/** Um campo editável (dados pessoais, Instagram, TikTok, aniversário). */
function EditRow({ action: save = saveSocialAction, marca, field, label, value, hasValue, shown, type = "text", inputMode, placeholder, viewOnly }: { action?: SaveAction; marca: string; field: string; label: string; value: string | null; hasValue?: boolean; shown: string | null; type?: string; inputMode?: "numeric" | "tel" | "email" | "text"; placeholder?: string; viewOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(save, undefined);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">{label}</p>
          <p className="truncate text-sm font-medium">{shown ?? <span className="text-stone-400">não informado</span>}</p>
        </div>
        {!viewOnly && !open && (
          <button type="button" onClick={() => setOpen(true)} className={`${ui.ghostSm} shrink-0`}><Pencil className="size-3" /> {value || hasValue ? "Alterar" : "Informar"}</button>
        )}
      </div>
      {state?.ok && !open && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{state.ok}</p>}
      {open && (
        <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
          <input type="hidden" name="marca" value={marca} />
          <input type="hidden" name="field" value={field} />
          <input name="value" type={type} inputMode={inputMode} defaultValue={value ?? ""} required placeholder={placeholder} aria-label={label} className={`${ui.input} min-w-0 flex-1`} />
          <button disabled={pending} className={ui.btnSm}>Salvar</button>
          <button type="button" onClick={() => setOpen(false)} className={ui.ghostSm}>Cancelar</button>
          <Msg state={state} />
        </form>
      )}
    </div>
  );
}

export function SocialCard({ p, marca, viewOnly }: { p: PortalProfile; marca: string; viewOnly: boolean }) {
  return (
    <section className={ui.card}>
      <h2 className={ui.h2}><AtSign className="size-4" /> Redes e aniversário</h2>
      <div className={ui.list}>
        <EditRow marca={marca} field="instagram" label="Instagram" value={p.instagram} shown={p.instagram ? `@${p.instagram}` : null} placeholder="@seuperfil" viewOnly={viewOnly} />
        <EditRow marca={marca} field="tiktok" label="TikTok" value={p.tiktok} shown={p.tiktok ? `@${p.tiktok}` : null} placeholder="@seuperfil" viewOnly={viewOnly} />
        <EditRow marca={marca} field="birthDate" label="Aniversário" value={p.birthDate} shown={p.birthDate ? br(p.birthDate) : null} type="date" viewOnly={viewOnly} />
      </div>
    </section>
  );
}

export function PixCard({ p, children }: { p: PortalProfile; children?: React.ReactNode }) {
  return (
    <section className={ui.card}>
      <div>
        <h2 className={ui.h2}><KeyRound className="size-4" /> Chave Pix</h2>
        <p className={ui.hint}>Onde você recebe os saques.</p>
      </div>
      <p className={ui.inset}>{p.pix ?? <span className="text-stone-400">não informada</span>}</p>
      {children}
    </section>
  );
}

/** Minha parceria (D-PORTALPROFILE): tipo, comissão, cupom, desde quando, contrato e mínimo. */
export function PartnershipCard({ p, base }: { p: PortalProfile; base: string }) {
  const s = p.partnership;
  const items: [string, string | null][] = [
    ["Tipo", s.types.join(" · ") || null],
    ["Comissão", s.rateBps !== null ? `${pct(s.rateBps)} das vendas com o seu cupom` : null],
    ["Cupom", s.coupons.length ? s.coupons.map((c) => (c.discountBps ? `${c.code} (${pct(c.discountBps)} de desconto)` : c.code)).join(" · ") : null],
    ["Parceira desde", br(s.since)],
    ["Contrato", s.contractStart || s.contractEnd ? `${s.contractStart ? br(s.contractStart) : "…"} até ${s.contractEnd ? br(s.contractEnd) : "…"}` : null],
    ["Recebe por", s.receivesAs],
    ["Mínimo para liberar a comissão", s.minCents !== null ? `${brl(s.minCents)} ${s.minBasis === "COMMISSION" ? "de comissão" : "em vendas"} no mês` : null],
  ];
  return (
    <section className={ui.card}>
      <h2 className={ui.h2}><Handshake className="size-4" /> Minha parceria</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {items.filter(([, v]) => v !== null).map(([k, v]) => (
          <div key={k} className={ui.inset}>
            <dt className="text-xs text-stone-500">{k}</dt>
            <dd className="text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {s.contractFile && (
        <a href={`${base}/contrato-pdf`} target="_blank" rel="noopener noreferrer" className="frost-tile flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium">
          <FileText className="size-4 shrink-0" /> <span className="flex-1">Ver o contrato assinado (PDF)</span> <ChevronRight className="size-4 text-stone-400" />
        </a>
      )}
    </section>
  );
}


