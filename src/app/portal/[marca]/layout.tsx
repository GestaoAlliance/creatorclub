import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/shell";
import { currentActor } from "@/lib/auth/current";
import { PortalError } from "@/lib/portal/context";
import { currentPortalContext } from "@/lib/portal/current";
import { TermsGate } from "@/components/portal/terms-gate";
import { db } from "@/lib/db";
import { pendingTerms } from "@/lib/terms/terms";
import { ContractGate } from "@/components/portal/contract-gate";
import { pendingContract } from "@/lib/contracts/sign";
import { unreadCount } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

// Portal da creator: confere o acesso (ou a visualização da equipe, D-VIEWAS), o termo (D-TERMS) e monta a moldura.
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
  const unread = await unreadCount(db(), ctx);
  // Contrato pendente (D-SIGNCONTRACT): quem foi aprovada em Candidatas assina antes de tudo, depois vem o termo.
  const contract = ctx.viewAs ? null : await pendingContract(db(), ctx);
  if (contract) {
    return (
      <PortalShell ctx={ctx} unread={unread}>
        <ContractGate marca={ctx.brand.slug} brandName={ctx.brand.name} contract={contract} />
      </PortalShell>
    );
  }
  // Termo pendente (D-TERMS): a creator só vê o termo até aceitar. A equipe vendo o portal não é bloqueada.
  const terms = ctx.viewAs ? null : await pendingTerms(db(), ctx);
  if (terms) {
    const renewal = (await db().termsAcceptance.count({ where: { creatorId: ctx.creatorId } })) > 0;
    return (
      <PortalShell ctx={ctx} unread={unread}>
        <TermsGate marca={ctx.brand.slug} brandName={ctx.brand.name} terms={terms} defaultName={ctx.name} renewal={renewal} />
      </PortalShell>
    );
  }
  return <PortalShell ctx={ctx} unread={unread}>{children}</PortalShell>;
}
