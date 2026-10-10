import Link from "next/link";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listCreators, STATUS_LABEL } from "@/lib/creators/profile";

export const dynamic = "force-dynamic";

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<{ marca?: string; portal?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators");
  const allowed = brandsWith(actor.grants, "creators.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const brands = await db().brand.findMany({
    where: allowed === "ALL" ? {} : { id: { in: allowed } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
  const { marca, portal } = await searchParams;
  const brand = brands.find((b) => b.slug === marca) ?? brands[0];
  if (!brand) return <main className="px-6 py-10 text-sm">Nenhuma marca.</main>;
  const creators = await listCreators(db(), actor, brand.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Creators · {brand.name}</h1>
      {portal && (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O portal é de cada creator. Para ver como ela vê, abra a creator abaixo e clique em &quot;Ver o portal como esta
          creator&quot;. A visualização vale só neste aparelho, por 1 hora.
        </p>
      )}
      {brands.length > 1 && (
        <nav className="flex gap-3 text-sm">
          {brands.map((b) => <Link key={b.id} href={`/admin/creators?marca=${b.slug}`} className={b.id === brand.id ? "font-semibold" : "underline"}>{b.name}</Link>)}
        </nav>
      )}
      <ul className="flex flex-col gap-1 text-sm">
        {creators.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/creators/${c.id}`} className="underline">{c.name}</Link> · {STATUS_LABEL[c.status]}
            {c.fakeEmail && <span className="text-amber-700"> · e-mail a confirmar</span>}
            {c.hasLogin && " · no portal"}
          </li>
        ))}
      </ul>
    </main>
  );
}
