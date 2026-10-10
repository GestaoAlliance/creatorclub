import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/shell";
import { currentActor } from "@/lib/auth/current";
import { staffContext } from "@/lib/staff/context";
import { staffNav } from "@/lib/staff/nav";

export const dynamic = "force-dynamic";

// Moldura do painel da equipe (D-DESIGNALL). Só monta a tela: cada página confere o acesso (e manda entrar).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor || actor.grants.length === 0) return <>{children}</>;
  const ctx = await staffContext(actor);
  return (
    <StaffShell brand={ctx.brand} brands={ctx.brands} firstName={ctx.firstName} isCreator={ctx.isCreator} items={staffNav(actor.grants)}>
      {children}
    </StaffShell>
  );
}
