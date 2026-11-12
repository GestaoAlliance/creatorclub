import { GlassLight } from "@/components/ui/glass-light";
import { HistoryCard, SettingsHero } from "@/components/staff/settings-hero";
import { HISTORY_ACTIONS } from "@/lib/settings/health";
import { FilePen, FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, Kpi } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { termsOverview } from "@/lib/terms/terms";
import { PublishTermsForm } from "./form";

export const dynamic = "force-dynamic";

const date = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Termo de aceite da marca escolhida no topo (D-TERMS). Só super admin.
export default async function TermoPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/termo");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/conta");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const o = await termsOverview(db(), actor, brand.id);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <SettingsHero actor={actor} brandId={brand?.id ?? null} brandName={brand?.name ?? ""} active="termo" title="Termo de aceite">
        O termo que a creator aceita no primeiro acesso ao portal da {brand.name}. Publicar uma versão nova pede novo aceite de todas.
      </SettingsHero>
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Kpi label="Versão atual" value={o.current ? o.current.version : "—"} hint={o.current ? `publicada em ${date(o.current.createdAt)}` : "nenhum termo publicado"} />
          <Kpi label="Aceitaram a atual" value={`${o.accepted} de ${o.creators}`} hint="creators não desligadas" />
        </div>
      </Card>
      {o.current && (
        <Card title={o.current.title} icon={<FileText className="size-4" />}>
          <div className={`${ui.inset} max-h-96 overflow-y-auto whitespace-pre-line text-sm leading-relaxed`}>{o.current.body}</div>
          {o.versions.length > 1 && (
            <p className={ui.hint}>Histórico: {o.versions.map((v) => `v${v.version} (${date(v.createdAt)}, ${v.acceptances} aceites)`).join(" · ")}</p>
          )}
        </Card>
      )}
      <details className={ui.card}>
        <summary className={`${ui.h2} cursor-pointer`}><FilePen className="size-4" /> {o.current ? "Editar e publicar nova versão" : "Publicar o termo"}</summary>
        <PublishTermsForm brandId={brand.id} title={o.current?.title ?? ""} body={o.current?.body ?? ""} />
      </details>
      <HistoryCard brandId={brand?.id ?? null} prefixes={HISTORY_ACTIONS.termo} />
    </GlassLight>
  );
}
