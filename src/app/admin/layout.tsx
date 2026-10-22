import type { ReactNode } from "react";
import { StaffFrame } from "@/components/staff/frame";
import { currentActor } from "@/lib/auth/current";
import { staffContext } from "@/lib/staff/context";
import { allianceNav, hasAlliancePanel, staffNav } from "@/lib/staff/nav";
import { brandsWith } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// Moldura do painel da equipe (D-DESIGNALL). Só monta a tela: cada página confere o acesso (e manda entrar).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor || actor.grants.length === 0) return <>{children}</>;
  const ctx = await staffContext(actor);
  return (
    <StaffFrame
      brand={ctx.brand}
      brands={ctx.brands}
      firstName={ctx.firstName}
      isCreator={ctx.isCreator}
      alliance={hasAlliancePanel(actor.grants, ctx.brands.length)}
      search={(() => { const b = brandsWith(actor.grants, "creators.view"); return b === "ALL" || b.length > 0; })()}
      brandItems={staffNav(actor.grants)}
      allianceItems={allianceNav(actor.grants)}
    >
      {children}
    </StaffFrame>
  );
}
