import { AtSign, MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listApplications, type ApplicationFilter } from "@/lib/onboarding/applications";
import { ApproveForm, RejectForm } from "./forms";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const TABS: [ApplicationFilter, string][] = [["NEW", "Novas"], ["APPROVED", "Aprovadas"], ["REJECTED", "Recusadas"]];

// Candidatas do formulário Hunter (D-ONBOARD): aprovar vira creator com cupom, taxa e convite.
export default async function CandidatasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/candidatas");
  const allowed = brandsWith(actor.grants, "creators.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const { ver } = await searchParams;
  const status = TABS.find(([s]) => s === ver)?.[0] ?? "NEW";
  const { rows, counts } = await listApplications(db(), actor, status);

  return (
    <>
      <PageHeader title="Candidatas">
        Respostas do formulário Hunter. Confira, ajuste o cupom e aprove: o sistema cria a creator com cupom, taxa e o convite do portal.
      </PageHeader>
      <nav aria-label="Situação" className="flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <Link key={s} href={s === "NEW" ? "/admin/candidatas" : `/admin/candidatas?ver=${s}`} className={status === s ? ui.pillOn : ui.pill}>
            {label} <span className="tabular-nums opacity-80">{counts[s] ?? 0}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 && <p className={ui.muted}>{status === "NEW" ? "Nenhuma candidata nova." : "Nenhuma aqui."}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((a) => (
          <article key={a.id} className={ui.card}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{a.fullName}</p>
                <p className={ui.hint}>respondeu em {day(a.submittedAt)}{a.decidedAt && ` · decidida em ${day(a.decidedAt)}`}</p>
              </div>
              <span className={a.categoryProposal === "PRESCRITOR" ? badge.sky : a.categoryProposal === "UGC" ? badge.amber : badge.neutral}>
                {a.kindAnswer ?? "tipo não informado"}
              </span>
            </div>
            <div className="grid gap-1.5 text-sm sm:grid-cols-2">
              {a.instagram && <p className="flex items-center gap-1.5"><AtSign className="size-3.5 text-stone-500" /> {a.instagram.replace(/^@/, "")}</p>}
              {a.followers && <p className="flex items-center gap-1.5"><Users className="size-3.5 text-stone-500" /> {a.followers} seguidores</p>}
              {a.phone && <p className="flex items-center gap-1.5"><Phone className="size-3.5 text-stone-500" /> {a.phone}</p>}
              {a.email && <p className="truncate text-stone-600 dark:text-stone-400">{a.email}</p>}
              {a.niche && <p className="text-stone-600 sm:col-span-2 dark:text-stone-400">Nicho: {a.niche}</p>}
            </div>
            {(a.cpf || a.cnpj || a.pixKey || a.address) && (
              <div className={`${ui.inset} grid gap-1 text-xs`}>
                {(a.cpf || a.cnpj) && <p><span className="text-stone-500">CPF</span> {a.cpf ?? "—"} · <span className="text-stone-500">CNPJ</span> {a.cnpj ?? "—"}{a.companyName && ` (${a.companyName})`}</p>}
                {a.pixKey && <p><span className="text-stone-500">Pix</span> {a.pixKey}</p>}
                {a.address && <p className="flex gap-1.5"><MapPin className="mt-0.5 size-3 shrink-0 text-stone-500" /> {a.address}</p>}
              </div>
            )}
            {a.suggestedCoupon && <p className="text-xs text-stone-500">Cupom sugerido por ela: <span className="font-mono">{a.suggestedCoupon}</span></p>}
            {status === "NEW" && a.canDecide && (
              <div className="flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
                <ApproveForm applicationId={a.id} name={a.fullName} email={a.email} coupon={a.couponProposal} category={a.categoryProposal} />
                <RejectForm applicationId={a.id} />
              </div>
            )}
            {status === "APPROVED" && a.creatorId && <Link href={`/admin/creators/${a.creatorId}`} className={`${ui.link} text-sm`}>Abrir a ficha</Link>}
            {status === "REJECTED" && a.decisionNote && <p className={ui.hint}>Motivo: {a.decisionNote}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
