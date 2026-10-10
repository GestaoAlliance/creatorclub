import Link from "next/link";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { couponReview } from "@/lib/coupons/review";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { CouponsBoard } from "./board";

export const dynamic = "force-dynamic";

// Conferência da Ana (E4.3): tipo do cupom, dona e taxa, separados em abas (D-COUPONTABS).
export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/cupons");
  const allowed = brandsWith(actor.grants, "creators.edit");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const brands = await db().brand.findMany({
    where: { archivedAt: null, ...(allowed === "ALL" ? {} : { id: { in: allowed } }) },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
  const { marca } = await searchParams;
  const brand = brands.find((b) => b.slug === marca) ?? brands[0];
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const { rows, creators, progress } = await couponReview(db(), actor, brand.id);

  return (
    <>
      <PageHeader title="Cupons">
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
          <Kpi label="Cupons de creator" value={rows.filter((r) => r.kind === "CREATOR").length} />
          <Kpi label="Promocionais" value={rows.filter((r) => r.kind === "PROMO").length} />
        </div>
      </Card>
      <CouponsBoard rows={rows} creators={creators} />
    </>
  );
}
