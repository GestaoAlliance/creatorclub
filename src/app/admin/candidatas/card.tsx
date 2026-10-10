import { AtSign, Eye, MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";
import { badge, ui } from "@/components/ui/styles";
import type { ApplicationFilter, listApplications } from "@/lib/onboarding/applications";
import { ApproveForm, RejectForm } from "./forms";

type Row = Awaited<ReturnType<typeof listApplications>>["rows"][number];

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Cartão de uma candidata (Hunter ou Captação), com aprovar/recusar quando está "Nova". */
export function ApplicationCard({ a, status }: { a: Row; status: ApplicationFilter }) {
  return (
    <article className={ui.card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{a.fullName}</p>
          <p className={ui.hint}>
            {a.source === "site_form" ? "Inscrição pelo site" : a.source === "captacao_form" ? "Captação (Google)" : "Hunter (Google)"} · respondeu em {day(a.submittedAt)}{a.decidedAt && ` · decidida em ${day(a.decidedAt)}`}
          </p>
        </div>
        <span className="flex flex-wrap justify-end gap-1.5">
          {a.brands.map((b) => <span key={b} className={badge.green}>{b}</span>)}
          <span className={a.categoryProposal === "PRESCRITOR" ? badge.sky : a.categoryProposal === "UGC" ? badge.amber : badge.neutral}>
            {a.kindAnswer ?? "tipo não informado"}
          </span>
        </span>
      </div>
      {a.hunter && <p className="text-sm">Trazida por <span className="font-medium">{a.hunter.name}</span> <span className={ui.hint}>(link {a.hunter.code})</span></p>}
      {a.note && <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{a.note}</p>}
      <div className="grid gap-1.5 text-sm sm:grid-cols-2">
        {a.instagram && <p className="flex items-center gap-1.5"><AtSign className="size-3.5 text-stone-500" /> {a.instagram.replace(/^@/, "")}</p>}
        {a.followers && <p className="flex items-center gap-1.5"><Users className="size-3.5 text-stone-500" /> {a.followers} seguidores</p>}
        {a.storiesViews && <p className="flex items-center gap-1.5"><Eye className="size-3.5 text-stone-500" /> {a.storiesViews} views nos stories</p>}
        {a.collabInterest && <p className="text-stone-600 dark:text-stone-400">Collab com a marca: {a.collabInterest}</p>}
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
      {a.extras.length > 0 && (
        <details className={`${ui.inset} text-sm`}>
          <summary className="cursor-pointer text-xs font-medium text-stone-500">Mais respostas ({a.extras.length})</summary>
          <dl className="mt-2 flex flex-col gap-2">
            {a.extras.map((x) => (
              <div key={x.question}>
                <dt className="text-xs text-stone-500">{x.question}</dt>
                <dd className="whitespace-pre-line">{x.answer}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {status === "NEW" && a.canDecide && (
        <div className="flex flex-col gap-3 border-t border-stone-200/70 pt-4 dark:border-white/10">
          <ApproveForm applicationId={a.id} name={a.fullName} email={a.email} coupon={a.couponProposal} category={a.categoryProposal} />
          <RejectForm applicationId={a.id} />
        </div>
      )}
      {status === "APPROVED" && a.creatorId && <Link href={`/admin/creators/${a.creatorId}`} className={`${ui.link} text-sm`}>Abrir a ficha</Link>}
      {status === "REJECTED" && a.decisionNote && <p className={ui.hint}>Motivo: {a.decisionNote}</p>}
    </article>
  );
}
