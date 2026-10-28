import { UserPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { teamOverview } from "@/lib/team/invites";
import { disableUserAction, revokeGrantAction, revokeInviteAction } from "./actions";
import { GrantForm, PhoneForm, RoleSelect } from "./grant-form";
import { InviteForm } from "./invite-form";
import { AccessBox } from "@/components/staff/access-box";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  GESTAO: "Gestão",
  ENVIO: "Envio",
  PAGAMENTO: "Pagamento",
  HUNTER: "Hunter",
  TIKTOK: "TikTok",
};

export default async function EquipePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/equipe");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/conta");
  const { users, invites, brands } = await teamOverview(db(), actor);
  const brandName = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.name ?? "?") : "todas as marcas");

  return (
    <>
      <PageHeader title="Equipe">Quem acessa o painel e com qual papel, marca por marca. O convite gera um link de uso único; quem já está na equipe ganha papel em outra marca sem novo convite.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card title="Convidar" icon={<UserPlus className="size-4" />}>
          <InviteForm brands={brands} />
        </Card>
        <div className="flex flex-col gap-6">
          <Card title={`Pessoas (${users.length})`}>
            <ul className={ui.list}>
              {users.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{u.name}</p>
                      <p className={`${ui.hint} truncate`}>{u.email}</p>
                    </div>
                    {u.id !== actor.userId && (
                      <form action={disableUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className={ui.dangerSm}>Remover da equipe</button>
                      </form>
                    )}
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {u.roleGrants.map((g) => (
                      <li key={g.id} className={`${badge.neutral} inline-flex items-center gap-1.5`}>
                        {/* D-ROLECHANGE: função de marca troca na lista; super admin fica fixo. */}
                        {g.brandId && g.role !== "SUPER_ADMIN" ? <RoleSelect grantId={g.id} role={g.role} brandName={brandName(g.brandId)} /> : <>{ROLE_LABEL[g.role]} · {brandName(g.brandId)}</>}
                        {!(u.id === actor.userId && g.role === "SUPER_ADMIN") && (
                          <form action={revokeGrantAction} className="inline">
                            <input type="hidden" name="id" value={g.id} />
                            <button aria-label="Tirar papel" title="Tirar papel" className="text-stone-500 hover:text-red-700">×</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                  {/* M4.4b (D-ACCESS): último acesso e nova senha. */}
                  <AccessBox userId={u.id} lastSeenAt={u.lastSeenAt?.toISOString() ?? null} canReset={u.id !== actor.userId} name={u.name} phone={u.phone} />
                  {u.roleGrants.some((g) => g.role === "GESTAO" || g.role === "SUPER_ADMIN") && <PhoneForm userId={u.id} phone={u.phone} />}
                  {u.id !== actor.userId && !u.roleGrants.some((g) => g.role === "SUPER_ADMIN") && brands.length > 0 && <GrantForm userId={u.id} brands={brands} />}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Convites pendentes">
            {invites.length === 0 && <p className={ui.muted}>Nenhum.</p>}
            <ul className={ui.list}>
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{i.name}</p>
                    <p className={ui.hint}>
                      {i.email ?? "e-mail no primeiro acesso"} · {ROLE_LABEL[i.role]} ({[i.brandId, ...i.extraBrandIds].map((b) => brandName(b)).join(", ")}) · vence {i.expiresAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      {i.emailedAt && " · enviado por e-mail"}
                    </p>
                  </div>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className={ui.dangerSm}>Cancelar</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
