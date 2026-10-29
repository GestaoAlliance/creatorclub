import Link from "next/link";
import { PRIORITY_LABEL } from "@/domain";
import type { ApplicationFilter, listApplications } from "@/lib/onboarding/applications";
import { ApplicationCard } from "./card";
import { contractBadge } from "./contract";
import type { TemplateOption } from "./forms";
import type { CandidateRow } from "./table";

type Row = Awaited<ReturnType<typeof listApplications>>["rows"][number];

const KIND_LABEL: Record<string, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };
const STATUS_LABEL: Record<string, string> = { NEW: "nova", APPROVED: "aprovada", REJECTED: "recusada" };
const ORIGIN: Record<string, string> = { site_form: "Site", captacao_form: "Captação (Google)", hunter_form: "Hunter (Google)", staff_form: "Cadastro da equipe" };
const daysAgo = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
const compact = (n: number | null, raw: string | null) =>
  n === null ? raw : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",")} mi` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "").replace(".", ",")} mil` : String(n);

/** Tudo o que a candidata respondeu, com o aviso de repetida e aprovar/recusar (abre ao clicar na linha). */
function ApplicationDetail({ a, status, templates }: { a: Row; status: ApplicationFilter; templates: readonly TemplateOption[] }) {
  return (
    <>
      {a.duplicates.length > 0 && (
        <div className="rounded-2xl border border-red-300/60 bg-red-50/80 px-4 py-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-medium">Pode ser a mesma pessoa de:</p>
          <ul className="mt-1 list-disc pl-5">
            {a.duplicates.map((x) => (
              <li key={`${x.kind}-${x.id}`}>
                {x.kind === "creator" ? (
                  <Link href={`/admin/creators/${x.id}`} className="underline">{x.name} (já é creator)</Link>
                ) : (
                  <>{x.name} (candidata {STATUS_LABEL[x.status ?? ""] ?? ""})</>
                )}{" "}
                · mesmo {x.by.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ApplicationCard a={a} status={status} templates={templates} />
    </>
  );
}

/** Linha da tabela (dados prontos para o cliente) com o cartão completo já montado no servidor. */
export function candidateRow(a: Row, status: ApplicationFilter, templates: readonly TemplateOption[]): CandidateRow {
  return {
    id: a.id,
    name: a.fullName,
    phone: a.phone,
    instagram: a.instagram,
    tiktok: a.tiktok,
    followers: compact(a.followersCount, a.followers),
    kind: KIND_LABEL[a.categoryProposal] ?? a.categoryProposal,
    kindTone: a.categoryProposal === "PRESCRITOR" ? "sky" : a.categoryProposal === "UGC" ? "amber" : "neutral",
    origin: a.source === "site_form" && a.hasLogin ? "Site (com login)" : (ORIGIN[a.source] ?? a.source),
    hunter: a.hunter?.name ?? null,
    hunterCode: a.hunterCode,
    viaHunterForm: a.source === "hunter_form",
    campaign: a.campaignTag,
    heardFrom: a.heardFrom,
    brands: a.brands,
    duplicate: a.duplicates.length > 0,
    priority: { level: a.priority.level, label: PRIORITY_LABEL[a.priority.level], reasons: (a.priority.level === "REPETIDA" ? ["resolver por último"] : a.priority.reasons).join(" · ") },
    days: daysAgo(a.submittedAt),
    canDecide: status === "NEW" && a.canDecide,
    brandName: a.brandName,
    // D-AUTENTIQUE2: selo do contrato e aprovar só depois de assinado (marcas com Autentique).
    contract: a.autentique ? contractBadge(a.contract, a.contractError) : null,
    approvable: !a.autentique || a.contract?.status === "SIGNED",
    creatorId: status === "APPROVED" ? a.creatorId : null,
    detail: <ApplicationDetail a={a} status={status} templates={templates} />,
  };
}
