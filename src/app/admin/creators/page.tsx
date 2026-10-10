import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listCreators, STATUS_LABEL } from "@/lib/creators/profile";
import { CreatorList } from "./list";

export const dynamic = "force-dynamic";

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<{ marca?: string; portal?: string; contrato?: string; semvenda?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators");
  const allowed = brandsWith(actor.grants, "creators.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const brands = await db().brand.findMany({
    where: { archivedAt: null, ...(allowed === "ALL" ? {} : { id: { in: allowed } }) },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
  const { marca, portal, contrato, semvenda } = await searchParams;
  const brand = brands.find((b) => b.slug === marca) ?? brands[0];
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const creators = await listCreators(db(), actor, brand.id);
  const active = creators.filter((c) => c.status === "ACTIVE").length;

  return (
    <>
      <PageHeader title="Creators">
        {creators.length} creators na {brand.name} · {active} ativas. Toque numa creator para ver a ficha.
      </PageHeader>
      {portal && (
        <p role="status" className="rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          O portal é de cada creator. Para ver como ela vê, abra a creator abaixo e toque em &quot;Ver o portal como esta creator&quot;. A
          visualização vale só neste aparelho, por 1 hora.
        </p>
      )}
      {brands.length > 1 && (
        <nav className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Link key={b.id} href={`/admin/creators?marca=${b.slug}`} className={b.id === brand.id ? ui.pillOn : ui.pill}>{b.name}</Link>
          ))}
        </nav>
      )}
      <CreatorList rows={creators.map((c) => ({ ...c, statusLabel: STATUS_LABEL[c.status] }))} contractsOnly={contrato === "1"} idleOnly={semvenda === "1"} />
    </>
  );
}
