import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { ImportForm } from "./form";

export const dynamic = "force-dynamic";

// Importação das creators do app antigo (D-IMPORT). Só super admin. Tela simples (D-ADMINUI).
export default async function ImportarPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/importar");
  if (brandsWith(actor.grants, "integrations.manage") !== "ALL") redirect("/conta");
  const brands = await db().brand.findMany({ where: { legacyId: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Importar creators do app antigo</h1>
      <p className="text-sm text-stone-600">
        Cria contas, participações, cupons (sem tipo), donas e taxas <strong>a confirmar</strong> pela Ana. Pode rodar de
        novo: nada é sobrescrito, e o resultado mostra o que mudou no app antigo.
      </p>
      {brands.length === 0 ? <p className="text-sm text-stone-500">Nenhuma marca ligada ao app antigo.</p> : <ImportForm brands={brands} />}
    </main>
  );
}
