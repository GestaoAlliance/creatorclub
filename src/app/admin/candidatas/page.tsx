import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listApplications, type ApplicationFilter } from "@/lib/onboarding/applications";
import { ApplicationCard } from "./card";

export const dynamic = "force-dynamic";

const TABS: [ApplicationFilter, string][] = [["NEW", "Novas"], ["APPROVED", "Aprovadas"], ["REJECTED", "Recusadas"]];

// Candidatas dos formulários Hunter (D-ONBOARD) e Captação (D-CAPTACAO): aprovar vira creator com cupom, taxa e convite.
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
        Respostas dos formulários Hunter e Captação. Confira, ajuste o cupom e aprove: o sistema cria a creator com cupom, taxa e o
        convite do portal.
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
          <ApplicationCard key={a.id} a={a} status={status} />
        ))}
      </div>
    </>
  );
}
