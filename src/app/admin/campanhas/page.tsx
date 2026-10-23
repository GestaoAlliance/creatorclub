import { Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { CAMPAIGN_PHASE_LABEL, formatBRL } from "@/domain";
import { PHASE_TONE } from "./tone";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { staffCampaigns } from "@/lib/campaigns/campaigns";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";

export const dynamic = "force-dynamic";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// Campanhas e desafios (M4.5, D-CAMPAIGN), na marca do topo.
export default async function CampanhasPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/campanhas");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "creators.view", brand.id)) redirect("/conta");
  const list = await staffCampaigns(db(), actor, brand.id);
  const canEdit = can(actor.grants, "creators.edit", brand.id);
  return (
    <>
      <PageHeader
        title="Campanhas"
        actions={canEdit && <Link href="/admin/campanhas/nova" className={`${ui.btnSm} inline-flex items-center gap-1.5`}><Plus className="size-4" /> Nova campanha</Link>}
      >
        Desafios da {brand.name} para as creators: briefing, inscrição no portal e placar de vendas. Prêmio em dinheiro entra no saldo quando a
        Gestão confirma as ganhadoras.
      </PageHeader>
      <Card>
        {list.length === 0 ? (
          <p className={ui.muted}>Nenhuma campanha ainda.</p>
        ) : (
          <ul className={ui.list}>
            {list.map((c) => (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <Link href={`/admin/campanhas/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 hover:opacity-80">
                  <span className="flex min-w-0 items-center gap-3">
                    <Trophy className="size-4 shrink-0 text-amber-600" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className={ui.hint}>
                        {br(c.startDay)} a {br(c.endDay)} · {c.entriesCount} inscrita{c.entriesCount === 1 ? "" : "s"}
                        {c.rankingPrizes.length > 0 && ` · ranking: ${c.rankingPrizes.map((p, i) => `${i + 1}º ${formatBRL(p)}`).join(", ")}`}
                        {c.goalCents && ` · meta ${formatBRL(c.goalCents)} → ${formatBRL(c.goalPrizeCents ?? 0)}`}
                      </span>
                    </span>
                  </span>
                  <span className={PHASE_TONE[c.phase]}>{CAMPAIGN_PHASE_LABEL[c.phase]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
