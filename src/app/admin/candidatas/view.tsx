import { ContractLockForm } from "../marcas/forms";
import { Plus, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { HelpTip } from "@/components/ui/tour";
import { SIGNUP_BRANDS, type ApplicationFilters, type ApplicationSort } from "@/domain";
import type { ApplicationFilter, listApplications } from "@/lib/onboarding/applications";
import { candidateRow } from "./row";
import { CandidateTable } from "./table";

export const TABS: [ApplicationFilter, string][] = [["NEW", "Pendentes"], ["APPROVED", "Aprovadas"], ["REJECTED", "Recusadas"]];
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

/** Tela Candidatas no modelo da referência: situação, origem em abas, busca e filtros, tabela com aprovar/recusar na linha. */
export function CandidatasView({ status, sp, filters, data, canCreate, lock }: { status: ApplicationFilter; sp: Search; filters: ApplicationFilters; data: Data; canCreate: boolean; lock: { brandId: string; on: boolean; waiting: number } | null }) {
  const { rows, counts, total, hunters } = data;
  const filtered = rows.length !== total;
  const base: Search = status === "NEW" ? {} : { ver: status };
  return (
    <>
      <PageHeader
        title="Candidatas"
        actions={canCreate && <Link href="/admin/candidatas/nova" className={`${ui.btnSm} inline-flex items-center gap-1.5`}><Plus className="size-4" /> Nova candidata</Link>}
      >
        Inscrições pelo site, pelos formulários do Google e cadastros da equipe. Aprovar cria a creator com cupom, taxa e acesso ao portal; clique na
        linha para ver tudo o que ela respondeu. Marque várias para recusar de uma vez.
      </PageHeader>
      <nav aria-label="Situação" data-tour="cand-abas" className="flex flex-wrap items-center gap-2">
        {TABS.map(([s, label]) => (
          <Link key={s} href={s === "NEW" ? "/admin/candidatas" : `/admin/candidatas?ver=${s}`} className={status === s ? ui.pillOn : ui.pill}>
            {label} · <span className="tabular-nums">{counts[s] ?? 0}</span>
          </Link>
        ))}
        <HelpTip id="cand-abas" />
      </nav>
      {/* D-CONTRACTSWITCH: trava do contrato na aprovação (Gestão da marca e super admin). */}
      {lock && (
        <details className={ui.card}>
          <summary className="cursor-pointer text-sm font-medium">Contrato na aprovação: {lock.on ? "trava ligada" : "trava desligada"}</summary>
          <div className="mt-3"><ContractLockForm {...lock} /></div>
        </details>
      )}

      <section className={`${ui.card} gap-4`}>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map(([v, l]) => (
            <Link key={v || "todas"} href={qs(sp, { origem: v })} className={`rounded-full px-3 py-1 text-sm ${(sp.origem ?? "") === v ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>
              {l}
            </Link>
          ))}
        </div>
        <form data-tour="cand-filtros" className="flex flex-col gap-3" role="search">
          {Object.entries(base).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {sp.origem && <input type="hidden" name="origem" value={sp.origem} />}
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, @ ou e-mail" aria-label="Buscar" className={`${ui.input} pl-9`} />
            </label>
            <HelpTip id="cand-filtros" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className={ui.inputSm}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="hunter" defaultValue={sp.hunter ?? ""} aria-label="Hunter" className={ui.inputSm}>
              <option value="">Qualquer hunter</option>
              <option value="nenhum">Sem hunter</option>
              {hunters.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}
            </select>
            <select name="marca" defaultValue={sp.marca ?? ""} aria-label="Marca de interesse" className={ui.inputSm}>
              <option value="">Qualquer marca</option>
              {SIGNUP_BRANDS.map((b) => <option key={b} value={b}>Quer {b}</option>)}
            </select>
            <select name="ordem" defaultValue={filters.sort} aria-label="Ordem" className={ui.inputSm}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className={ui.btnSm}>Filtrar</button>
            {filtered && <Link href={qs(base, {})} className={`${ui.link} text-sm`}>Limpar</Link>}
          </div>
        </form>
        <p className={`${ui.hint} flex items-center gap-1`}>
          {filtered ? `${rows.length} de ${total} candidatas` : `${total} candidatas`}
          {rows.length > 0 && <HelpTip id="cand-lista" className="-my-1" />}
        </p>
        {rows.length === 0 ? (
          <p className={ui.muted}>{filtered ? "Nenhuma candidata com esses filtros." : status === "NEW" ? "Nenhuma candidata esperando." : "Nenhuma aqui."}</p>
        ) : (
          <CandidateTable pending={status === "NEW"} rows={rows.map((a) => candidateRow(a, status, data.templates.filter((t) => t.brandId === a.brandId)))} />
        )}
      </section>
    </>
  );
}
