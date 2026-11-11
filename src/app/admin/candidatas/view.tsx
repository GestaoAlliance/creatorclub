import { ContractLockForm } from "../marcas/forms";
import { Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { GlassLight } from "@/components/ui/glass-light";
import type { ApplicationsPace } from "@/lib/onboarding/pace";
import { ui } from "@/components/ui/styles";
import { HelpTip } from "@/components/ui/tour";
import { SIGNUP_BRANDS, type ApplicationFilters, type ApplicationSort } from "@/domain";
import type { ApplicationFilter, listApplications } from "@/lib/onboarding/applications";
import { candidateRow } from "./row";
import { CandidateBoard } from "./table";

export const TABS: [ApplicationFilter, string][] = [["NEW", "Pendentes"], ["WAITING", "Esperando assinatura"], ["APPROVED", "Aprovadas"], ["REJECTED", "Recusadas"]];
export const SORTS: [ApplicationSort, string][] = [["prioridade", "Prioridade"], ["antigas", "Mais antigas primeiro"], ["novas", "Mais novas primeiro"], ["seguidores", "Mais seguidores"]];
const KINDS: [string, string][] = [["", "Todos os tipos"], ["INFLUENCER", "Influencer"], ["UGC", "UGC"], ["PRESCRITOR", "Prescritor"]];
const SOURCES: [string, string][] = [["", "Todas as origens"], ["site_form", "Site"], ["captacao_form", "Captação"], ["hunter_form", "Hunter"], ["staff_form", "Equipe"]];

export type Search = { ver?: string; q?: string; tipo?: string; origem?: string; hunter?: string; marca?: string; ordem?: string };
type Data = Awaited<ReturnType<typeof listApplications>>;

const qs = (sp: Search, patch: Partial<Search>) => {
  const all = { ...sp, ...patch };
  const s = new URLSearchParams(Object.entries(all).filter(([, v]) => v) as [string, string][]).toString();
  return `/admin/candidatas${s ? `?${s}` : ""}`;
};

/** Tela Candidatas (D-CANDBOARD): faixa com situação e quadros, busca e filtros, lista e painel lateral de triagem. */
export function CandidatasView({ status, sp, filters, data, canCreate, lock, pace, brandName }: { status: ApplicationFilter; sp: Search; filters: ApplicationFilters; data: Data; canCreate: boolean; lock: { brandId: string; on: boolean; waiting: number } | null; pace: ApplicationsPace | null; brandName: string }) {
  const { rows, counts, total, hunters } = data;
  const filtered = rows.length !== total;
  const base: Search = status === "NEW" ? {} : { ver: status };
  const toolbar = (
    <>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {SOURCES.map(([v, l]) => (
          <Link key={v || "todas"} href={qs(sp, { origem: v })} className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${(sp.origem ?? "") === v ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>
            {l}
          </Link>
        ))}
      </div>
      <form data-tour="cand-filtros" className="flex flex-wrap items-center gap-2" role="search">
        {Object.entries(base).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {sp.origem && <input type="hidden" name="origem" value={sp.origem} />}
        <label className="relative min-w-0 flex-[1_1_16rem]">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, @ ou e-mail" aria-label="Buscar" className={`${ui.input} !rounded-full pl-10`} />
        </label>
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className={`${ui.inputSm} !rounded-full`}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="hunter" defaultValue={sp.hunter ?? ""} aria-label="Hunter" className={`${ui.inputSm} !rounded-full`}>
          <option value="">Qualquer hunter</option>
          <option value="nenhum">Sem hunter</option>
          {hunters.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}
        </select>
        <select name="marca" defaultValue={sp.marca ?? ""} aria-label="Marca de interesse" className={`${ui.inputSm} !rounded-full`}>
          <option value="">Qualquer marca</option>
          {SIGNUP_BRANDS.map((b) => <option key={b} value={b}>Quer {b}</option>)}
        </select>
        <select name="ordem" defaultValue={filters.sort} aria-label="Ordem" className={`${ui.inputSm} !rounded-full`}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className={ui.btnSm}>Filtrar</button>
        {filtered && <Link href={qs(base, {})} className={`${ui.link} text-sm`}>Limpar</Link>}
        <HelpTip id="cand-filtros" />
      </form>
    </>
  );
  const summary = (
    <>
      <span><strong className="tabular-nums text-stone-800 dark:text-stone-100">{rows.length}</strong>{filtered ? ` de ${total}` : ""} candidatas</span>
      {rows.length > 0 && <HelpTip id="cand-lista" className="-my-1" />}
      {/* D-CONTRACTSWITCH: trava do contrato na aprovação (Gestão da marca e super admin). */}
      {lock && (
        <details className="ml-auto">
          <summary className="cursor-pointer font-medium">Contrato na aprovação: {lock.on ? "trava ligada" : "trava desligada"}</summary>
          <div className="mt-2"><ContractLockForm {...lock} /></div>
        </details>
      )}
    </>
  );
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <CandidateBoard
        rows={rows.map((a) => candidateRow(a, status, data.templates.filter((t) => t.brandId === a.brandId)))}
        pending={status === "NEW"}
        tabs={TABS.map(([s, label]) => ({ href: s === "NEW" ? "/admin/candidatas" : `/admin/candidatas?ver=${s}`, label, n: counts[s] ?? 0, on: status === s }))}
        brandName={brandName}
        newHref={canCreate ? "/admin/candidatas/nova" : null}
        pace={pace}
        waitingHref="/admin/candidatas?ver=WAITING"
        toolbar={toolbar}
        summary={summary}
      />
    </GlassLight>
  );
}
