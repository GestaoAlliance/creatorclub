import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/shell";
import { currentActor } from "@/lib/auth/current";
import { PortalError } from "@/lib/portal/context";
import { currentPortalContext } from "@/lib/portal/current";

export const dynamic = "force-dynamic";

// Portal da creator: confere o acesso (ou a visualização da equipe, D-VIEWAS) e monta a moldura.
export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/portal/${marca}`);
  let ctx;
  try {
    ctx = await currentPortalContext(marca);
  } catch (error) {
    if (!(error instanceof PortalError)) throw error;
    // Equipe sem a visualização ativa (ex.: abriu o link do portal em outro aparelho): manda escolher a creator.
    if (actor.grants.length > 0) redirect("/admin/creators?portal=1");
    notFound();
  }
  return <PortalShell ctx={ctx}>{children}</PortalShell>;
}
