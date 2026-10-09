import Link from "next/link";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { couponReview } from "@/lib/coupons/review";
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
  if (!brand) return <main className="px-6 py-10 text-sm">Nenhuma marca.</main>;
  const { rows, creators, progress } = await couponReview(db(), actor, brand.id);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Conferência de cupons</h1>
      {brands.length > 1 && (
        <nav className="flex gap-3 text-sm">
          {brands.map((b) => (
            <Link key={b.id} href={`/admin/cupons?marca=${b.slug}`} className={b.id === brand.id ? "font-semibold" : "underline"}>{b.name}</Link>
          ))}
        </nav>
      )}
      <p className="text-sm">
        <strong>{progress.confirmed}</strong> de {progress.activeCreators} creators ativas com cupom, dona e taxa confirmados.
        Cupom sem tipo ou dona a confirmar deixa os pedidos dele pendentes; PROMO nunca leva pedido.
      </p>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left">
            <th className="py-2 pr-3">Cupom</th>
            <th className="py-2 pr-3">Pedidos</th>
            <th className="py-2 pr-3">Tipo</th>
            <th className="py-2 pr-3">Dona</th>
            <th className="py-2">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-stone-100 align-top">
              <td className="py-2 pr-3 font-mono">{r.code}</td>
              <td className="py-2 pr-3">{r.uses}</td>
              <td className="py-2 pr-3">
                {r.kind === null && <div className="mb-1 text-xs text-amber-700">sem tipo</div>}
                <ClassifyForm couponId={r.id} kind={r.kind} />
              </td>
              <td className="py-2 pr-3">
                {r.kind !== "CREATOR" ? (
                  <span className="text-xs text-stone-500">{r.owner ? `${r.owner.name} (do app antigo; ignorada)` : "—"}</span>
                ) : r.owner?.confirmed ? (
                  <span><Link href={`/admin/creators/${r.owner.creatorId}`} className="underline">{r.owner.name}</Link> <span className="text-xs text-green-800">confirmada</span></span>
                ) : (
                  <>
                    {r.owner && <div className="mb-1 text-xs text-amber-700">a confirmar: {r.owner.name}</div>}
                    <OwnerForm couponId={r.id} currentCreatorId={r.owner?.creatorId ?? null} needsSince={!r.owner} creators={creators} />
                  </>
                )}
              </td>
              <td className="py-2">
                {r.kind !== "CREATOR" || !r.rate ? (
                  <span className="text-xs text-stone-500">—</span>
                ) : r.rate.confirmed ? (
                  <span>{(r.rate.rateBps / 100).toString().replace(".", ",")}% <span className="text-xs text-green-800">confirmada</span></span>
                ) : (
                  <>
                    <div className="mb-1 text-xs text-amber-700">a confirmar</div>
                    <RateForm policyId={r.rate.policyId} rateBps={r.rate.rateBps} />
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
