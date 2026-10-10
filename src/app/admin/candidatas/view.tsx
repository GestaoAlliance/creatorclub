import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { SIGNUP_BRANDS, type ApplicationFilters, type ApplicationSort } from "@/domain";
import type { ApplicationFilter, listApplications } from "@/lib/onboarding/applications";
import { ApplicationRow } from "./row";

export const TABS: [ApplicationFilter, string][] = [["NEW", "Novas"], ["APPROVED", "Aprovadas"], ["REJECTED", "Recusadas"]];
export const SORTS: [ApplicationSort, string][] = [["antigas", "Mais antigas primeiro"], ["novas", "Mais novas primeiro"], ["seguidores", "Mais seguidores"]];
const KINDS: [string, string][] = [["", "Todos os tipos"], ["INFLUENCER", "Influencer"], ["UGC", "UGC"], ["PRESCRITOR", "Prescritor"]];
const SOURCES: [string, string][] = [["", "Todas as origens"], ["site_form", "Inscrição pelo site"], ["captacao_form", "Captação (Google)"], ["hunter_form", "Hunter (Google)"]];

export type Search = { ver?: string; q?: string; tipo?: string; origem?: string; hunter?: string; marca?: string; ordem?: string };
type Data = Awaited<ReturnType<typeof listApplications>>;

/** Tela Candidatas (F2): abas, busca e filtros, lista compacta. Só exibe. */
export function CandidatasView({ status, sp, filters, data }: { status: ApplicationFilter; sp: Search; filters: ApplicationFilters; data: Data }) {
  const { rows, counts, total, hunters } = data;
  const filtered = rows.length !== total;
  return (
    <>
      <PageHeader title="Candidatas">
        Inscrições pelo site e pelos formulários do Google. Clique numa linha para ver tudo e decidir: aprovar cria a creator com
        cupom, taxa e o convite do portal.
      </PageHeader>
      <nav aria-label="Situação" className="flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <Link key={s} href={s === "NEW" ? "/admin/candidatas" : `/admin/candidatas?ver=${s}`} className={status === s ? ui.pillOn : ui.pill}>
            {label} <span className="tabular-nums opacity-80">{counts[s] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form className="glass flex flex-col gap-3 rounded-3xl p-4" role="search">
        {status !== "NEW" && <input type="hidden" name="ver" value={status} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, @ ou e-mail" aria-label="Buscar" className={ui.input} />
        <div className="flex flex-wrap items-center gap-2">
          <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className={ui.inputSm}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select name="origem" defaultValue={sp.origem ?? ""} aria-label="Origem" className={ui.inputSm}>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select name="hunter" defaultValue={sp.hunter ?? ""} aria-label="Hunter" className={ui.inputSm}>
            <option value="">Qualquer hunter</option>
            <option value="nenhum">Sem hunter</option>
            {hunters.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}
          </select>
          <select name="ordem" defaultValue={filters.sort} aria-label="Ordem" className={ui.inputSm}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select name="marca" defaultValue={sp.marca ?? ""} aria-label="Marca de interesse" className={ui.inputSm}>
            <option value="">Qualquer marca</option>
            {SIGNUP_BRANDS.map((b) => <option key={b} value={b}>Quer {b}</option>)}
          </select>
          <button className={ui.btnSm}>Filtrar</button>
          {filtered && <Link href={status === "NEW" ? "/admin/candidatas" : `/admin/candidatas?ver=${status}`} className={`${ui.link} text-sm`}>Limpar</Link>}
        </div>
      </form>

      <p className={ui.hint}>{filtered ? `${rows.length} de ${total} candidatas` : `${total} candidatas`}</p>
      {rows.length === 0 ? (
        <p className={ui.muted}>{filtered ? "Nenhuma candidata com esses filtros." : status === "NEW" ? "Nenhuma candidata nova." : "Nenhuma aqui."}</p>
      ) : (
        <ul className="glass divide-y divide-stone-200/70 rounded-3xl px-2 md:px-4 dark:divide-white/10">
          {rows.map((a) => (
            <ApplicationRow key={a.id} a={a} status={status} />
          ))}
        </ul>
      )}
    </>
  );
}
