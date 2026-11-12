import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { HistoryCard, SettingsHero } from "@/components/staff/settings-hero";
import { brandsWith, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { HISTORY_ACTIONS } from "@/lib/settings/health";
import { staffContext } from "@/lib/staff/context";
import { teamOverview } from "@/lib/team/invites";
import { TeamBoard } from "./board";

export const dynamic = "force-dynamic";

// Equipe: quem acessa o painel e com qual papel, marca por marca. Só super admin. Visual D-SETTINGSBOARD.
export default async function EquipePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/equipe");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/conta");
  const { brand } = await staffContext(actor);
  const { users, invites, brands } = await teamOverview(db(), actor);
  const brandName = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.name ?? "?") : "todas as marcas");
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <SettingsHero actor={actor} brandId={brand?.id ?? null} brandName={brand?.name ?? ""} active="equipe" title="Equipe">
        Quem acessa o painel e com qual papel, marca por marca. O convite gera um link de uso único; quem já está na equipe ganha papel em outra marca sem novo convite.
      </SettingsHero>
      <TeamBoard
        me={actor.userId}
        brands={brands}
        matrix={ROLE_PERMISSIONS}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, lastSeenAt: u.lastSeenAt?.toISOString() ?? null, roleGrants: u.roleGrants.map((g) => ({ id: g.id, role: g.role, brandId: g.brandId })) }))}
        invites={invites.map((i) => ({ id: i.id, name: i.name, email: i.email, role: i.role, brands: [i.brandId, ...i.extraBrandIds].map((b) => brandName(b)).join(", "), expires: i.expiresAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), emailed: Boolean(i.emailedAt) }))}
      />
      <HistoryCard brandId={null} prefixes={HISTORY_ACTIONS.equipe} />
    </GlassLight>
  );
}
