import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { badge, ui } from "@/components/ui/styles";
import type { ApplicationFilter, listApplications } from "@/lib/onboarding/applications";
import { ApplicationCard } from "./card";

type Row = Awaited<ReturnType<typeof listApplications>>["rows"][number];

const KIND_LABEL: Record<string, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };
const STATUS_LABEL: Record<string, string> = { NEW: "nova", APPROVED: "aprovada", REJECTED: "recusada" };
const daysAgo = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
const compact = (n: number | null, raw: string | null) =>
  n === null ? (raw ?? "—") : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",")} mi` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "").replace(".", ",")} mil` : String(n);

/** Linha da lista compacta (F2): o essencial numa linha; clique abre o cartão completo com aprovar/recusar. */
export function ApplicationRow({ a, status }: { a: Row; status: ApplicationFilter }) {
  const d = daysAgo(a.submittedAt);
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{a.fullName}</span>
              {a.instagram && <span className="text-stone-500">@{a.instagram.replace(/^@/, "")}</span>}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <span className={badge.neutral}>{compact(a.followersCount, a.followers)} seguidores</span>
              <span className={a.categoryProposal === "PRESCRITOR" ? badge.sky : a.categoryProposal === "UGC" ? badge.amber : badge.neutral}>
                {KIND_LABEL[a.categoryProposal] ?? a.categoryProposal}
              </span>
              {a.hunter && <span className={badge.sky}>hunter: {a.hunter.name}</span>}
              {a.brands.map((b) => <span key={b} className={badge.green}>{b}</span>)}
              {a.duplicates.length > 0 && <span className={badge.red}>repetida</span>}
              <span className={ui.hint}>{a.source === "site_form" ? "site" : "Google"} · {d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`}</span>
            </p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 pb-4">
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
          <ApplicationCard a={a} status={status} />
        </div>
      </details>
    </li>
  );
}
