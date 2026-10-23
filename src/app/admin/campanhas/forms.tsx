"use client";

import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { publishCampaignAction, saveCampaignAction, settleCampaignAction } from "./actions";

export type CampaignValues = {
  id?: string;
  name: string;
  briefing: string;
  startDay: string;
  endDay: string;
  categories: string[];
  tagIds: string[];
  rankingPrizes: string[];
  goal: string;
  goalPrize: string;
  allianceOsUrl: string;
};

const CATS: [string, string][] = [["INFLUENCER", "Influencer"], ["UGC", "UGC"], ["PRESCRITOR", "Prescritor"]];
const PLACES = 5;

/** Formulário da campanha (M4.5). Depois de publicada, só nome, briefing e link mudam. */
export function CampaignForm({ v, tags, locked = false }: { v: CampaignValues; tags: { id: string; name: string }[]; locked?: boolean }) {
  const [state, action, pending] = useActionState(saveCampaignAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <label className={ui.label}>Nome<input name="name" defaultValue={v.name} required maxLength={80} placeholder="ex.: Desafio Semana Rosa" className={ui.input} /></label>
      <label className={ui.label}>
        Briefing (o que divulgar, oferta, cupom, cuidados)
        <textarea name="briefing" defaultValue={v.briefing} required rows={5} maxLength={4000} className={ui.input} />
      </label>
      <label className={ui.label}>
        Link da campanha no AllianceOS (opcional)
        <input name="allianceOsUrl" defaultValue={v.allianceOsUrl} placeholder="https://alliance-os…" className={ui.input} />
      </label>
      <fieldset disabled={locked} className="flex flex-col gap-4 disabled:opacity-60">
        {locked && <p className={ui.hint}>Publicada: período, público e prêmios não mudam mais (as creators já viram as regras).</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>Início<input type="date" name="startDay" defaultValue={v.startDay} required className={ui.input} /></label>
          <label className={ui.label}>Fim (inclusive)<input type="date" name="endDay" defaultValue={v.endDay} required className={ui.input} /></label>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-stone-600 dark:text-stone-300">Público (nada marcado = todas as creators ativas)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {CATS.map(([k, l]) => (
              <label key={k} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" name="categories" value={k} defaultChecked={v.categories.includes(k)} className="size-4 accent-current" /> {l}</label>
            ))}
            {tags.map((t) => (
              <label key={t.id} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" name="tagIds" value={t.id} defaultChecked={v.tagIds.includes(t.id)} className="size-4 accent-current" /> tag {t.name}</label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-stone-600 dark:text-stone-300">Ranking de vendas: prêmio por posição (R$; deixe em branco as que não têm)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Array.from({ length: PLACES }, (_, i) => (
              <label key={i} className={ui.label}>{i + 1}º lugar<input name="rankingPrizes" defaultValue={v.rankingPrizes[i] ?? ""} inputMode="decimal" placeholder="—" className={ui.input} /></label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>Meta individual: vendas de (R$)<input name="goal" defaultValue={v.goal} inputMode="decimal" placeholder="ex.: 1.000" className={ui.input} /></label>
          <label className={ui.label}>Prêmio de quem bater a meta (R$)<input name="goalPrize" defaultValue={v.goalPrize} inputMode="decimal" placeholder="ex.: 100" className={ui.input} /></label>
        </div>
      </fieldset>
      <p className={ui.hint}>Vendas com o cupom pagas dentro do período (a régua da comissão). Prêmio em dinheiro entra no saldo, já disponível, quando a Gestão confirma as ganhadoras (a partir de 7 dias depois do fim).</p>
      <Msg state={state} />
      <button className={`${ui.btn} self-start`} disabled={pending}>{v.id ? "Salvar" : "Criar rascunho"}</button>
    </form>
  );
}

export function PublishButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(publishCampaignAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button className={ui.btn} disabled={pending}>Publicar para as creators</button>
      <Msg state={state} />
    </form>
  );
}

export function SettleButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState(settleCampaignAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" onSubmit={(e) => { if (!confirm("Confirmar as ganhadoras? Os prêmios entram no saldo e não mudam mais.")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className={ui.btn} disabled={pending}>{label}</button>
      <Msg state={state} />
    </form>
  );
}
