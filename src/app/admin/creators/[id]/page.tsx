import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { currentActor } from "@/lib/auth/current";
import { creatorStatement, StatementError } from "@/lib/commission/statement";
import { creatorProfile, ProfileError } from "@/lib/creators/profile";
import { db } from "@/lib/db";
import { creatorTermsStatus } from "@/lib/terms/terms";
import { creatorContractSignature } from "@/lib/contracts/sign";
import { CreatorProfileView } from "./view";

export const dynamic = "force-dynamic";

// Ficha da creator (E4.4), no visual do sistema (D-DESIGNALL).
export default async function CreatorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const { mes } = await searchParams;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/creators/${id}`);
  let p;
  try {
    p = await creatorProfile(db(), actor, id);
  } catch (error) {
    if (error instanceof ProfileError) notFound();
    throw error;
  }
  let st = null;
  if (p.adjustments) {
    try {
      st = await creatorStatement(db(), actor, id, mes ? { month: mes } : {});
    } catch (error) {
      if (!(error instanceof StatementError)) throw error;
      st = await creatorStatement(db(), actor, id);
    }
  }

  const [terms, contract] = await Promise.all([creatorTermsStatus(db(), p.id, p.brandId), creatorContractSignature(db(), p.id)]);
  return <CreatorProfileView p={p} st={st} terms={terms} contract={contract} requestId={randomUUID()} />;
}
