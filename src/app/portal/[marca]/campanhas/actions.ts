"use server";

import { revalidatePath } from "next/cache";
import { CampaignError, joinCampaign } from "@/lib/campaigns/campaigns";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";

export type JoinState = { error?: string; ok?: string } | undefined;

/** M4.5 (D-CAMPAIGN): "Quero participar". */
export async function joinCampaignAction(_p: JoinState, f: FormData): Promise<JoinState> {
  const marca = String(f.get("marca") ?? "");
  try {
    const ctx = await currentPortalContext(marca);
    await joinCampaign(db(), ctx, String(f.get("campaignId") ?? ""));
  } catch (error) {
    if (error instanceof CampaignError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/portal/${marca}/campanhas`);
  return { ok: "Inscrição feita. Boas vendas!" };
}
