import Link from "next/link";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { couponReview } from "@/lib/coupons/review";
import { Card, Kpi, MobileLabel, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { ClassifyForm, OwnerForm, RateForm } from "./forms";

export const dynamic = "force-dynamic";

// Conferência da Ana (E4.3): tipo do cupom, dona e taxa. Tela simples (D-ADMINUI).
export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/cupons");
  const allowed = brandsWith(actor.grants, "creators.edit");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const brands = await db().brand.findMany({
    where: allowed === "ALL" ? {} : { id: { in: allowed } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
  const { marca } = await searchParams;
  const brand = brands.find((b) => b.slug === marca) ?? brands[0];
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const { rows, creators, progress } = await couponReview(db(), actor, brand.id);

  return (
    <>
      <PageHeader title="Conferência de cupons">
        Tipo do cupom, dona e taxa. Cupom sem tipo ou com dona a confirmar deixa os pedidos dele pendentes; PROMO nunca leva pedido.
      </PageHeader>
      {brands.length > 1 && (
        <nav className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Link key={b.id} href={`/admin/cupons?marca=${b.slug}`} className={b.id === brand.id ? ui.pillOn : ui.pill}>{b.name}</Link>
          ))}
        </nav>
      )}
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Kpi label="Creators confirmadas" value={`${progress.confirmed} de ${progress.activeCreators}`} hint="cupom, dona e taxa" />
          <Kpi label="Cupons sem tipo" value={rows.filter((r) => r.kind === null).length} tone={rows.some((r) => r.kind === null) ? "amber" : undefined} />
          <Kpi label="Cupons" value={rows.length} />
        </div>
      </Card>
      <section className={ui.card}>
        <div className="hidden grid-cols-[8rem_4rem_1fr_1.4fr_1fr] gap-4 text-xs font-medium uppercase tracking-wide text-stone-500 md:grid">
          <span>Cupom</span><span>Pedidos</span><span>Tipo</span><span>Dona</span><span>Taxa</span>
        </div>
        <ul className={ui.list}>
          {rows.map((r) => (
            <li key={r.id} className="grid gap-3 py-4 first:pt-0 md:grid-cols-[8rem_4rem_1fr_1.4fr_1fr] md:items-start md:gap-4">
              <div className="flex items-center justify-between md:block">
                <span className="font-mono font-semibold">{r.code}</span>
                <span className={`${ui.hint} md:hidden`}>{r.uses} pedidos</span>
              </div>
              <span className="hidden text-sm tabular-nums md:block">{r.uses}</span>
              <div className="flex flex-col gap-1">
                <MobileLabel>Tipo</MobileLabel>
                {r.kind === null && <span className={`${badge.amber} self-start`}>sem tipo</span>}
                <ClassifyForm couponId={r.id} kind={r.kind} />
              </div>
              <div className="flex flex-col gap-1">
                <MobileLabel>Dona</MobileLabel>
                {r.kind !== "CREATOR" ? (
                  <span className={ui.hint}>{r.owner ? `${r.owner.name} (do app antigo; ignorada)` : "—"}</span>
                ) : r.owner?.confirmed ? (
                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Link href={`/admin/creators/${r.owner.creatorId}`} className={ui.link}>{r.owner.name}</Link>
                    <span className={badge.green}>confirmada</span>
                  </span>
                ) : (
                  <>
                    {r.owner && <span className={`${badge.amber} self-start`}>a confirmar: {r.owner.name}</span>}
                    <OwnerForm couponId={r.id} currentCreatorId={r.owner?.creatorId ?? null} needsSince={!r.owner} creators={creators} />
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <MobileLabel>Taxa</MobileLabel>
                {r.kind !== "CREATOR" || !r.rate ? (
                  <span className={ui.hint}>—</span>
                ) : r.rate.confirmed ? (
                  <span className="flex items-center gap-1.5 text-sm">
                    {(r.rate.rateBps / 100).toString().replace(".", ",")}% <span className={badge.green}>confirmada</span>
                  </span>
                ) : (
                  <>
                    <span className={`${badge.amber} self-start`}>a confirmar</span>
                    <RateForm policyId={r.rate.policyId} rateBps={r.rate.rateBps} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
