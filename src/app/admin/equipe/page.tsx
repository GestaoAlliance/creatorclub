import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { teamOverview } from "@/lib/team/invites";
import { disableUserAction, revokeGrantAction, revokeInviteAction } from "./actions";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  GESTAO: "Gestão",
  ENVIO: "Envio",
  PAGAMENTO: "Pagamento",
  HUNTER: "Hunter",
};

export default async function EquipePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/equipe");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/conta");
  const { users, invites, brands } = await teamOverview(db(), actor);
  const brandName = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.name ?? "?") : "todas as marcas");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold">Equipe</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Convidar</h2>
        <InviteForm brands={brands} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Pessoas</h2>
        {users.map((u) => (
          <div key={u.id} className="rounded border border-stone-200 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span><strong>{u.name}</strong> · {u.email}</span>
              {u.id !== actor.userId && (
                <form action={disableUserAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="text-red-700 underline">Remover da equipe</button>
                </form>
              )}
            </div>
            <ul className="mt-1">
              {u.roleGrants.map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  {ROLE_LABEL[g.role]} ({brandName(g.brandId)})
                  {!(u.id === actor.userId && g.role === "SUPER_ADMIN") && (
                    <form action={revokeGrantAction}>
                      <input type="hidden" name="id" value={g.id} />
                      <button className="text-xs text-stone-500 underline">tirar papel</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Convites pendentes</h2>
        {invites.length === 0 && <p className="text-sm text-stone-500">Nenhum.</p>}
        {invites.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded border border-stone-200 p-3 text-sm">
            <span>{i.name} · {i.email} · {ROLE_LABEL[i.role]} ({brandName(i.brandId)}) · vence {i.expiresAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            <form action={revokeInviteAction}>
              <input type="hidden" name="id" value={i.id} />
              <button className="text-red-700 underline">Cancelar</button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}
