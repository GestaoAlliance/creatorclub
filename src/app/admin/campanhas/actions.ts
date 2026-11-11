"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { CampaignError, createCampaign, publishCampaign, settleCampaign, updateCampaign, type CampaignInput } from "@/lib/campaigns/campaigns";
import { db } from "@/lib/db";
import { formatBRL } from "@/domain";
import { staffContext } from "@/lib/staff/context";
import { campaignMessage, duplicateCampaign } from "@/lib/campaigns/board";
import { BulkError } from "@/lib/creators/bulk";

export type CampaignState = { error?: string; ok?: string } | undefined;

const input = (f: FormData): CampaignInput => ({
  name: String(f.get("name") ?? ""),
  briefing: String(f.get("briefing") ?? ""),
  startDay: String(f.get("startDay") ?? ""),
  endDay: String(f.get("endDay") ?? ""),
  categories: f.getAll("categories").map(String),
  tagIds: f.getAll("tagIds").map(String),
  rankingPrizes: f.getAll("rankingPrizes").map(String),
  goal: String(f.get("goal") ?? ""),
  goalPrize: String(f.get("goalPrize") ?? ""),
  allianceOsUrl: String(f.get("allianceOsUrl") ?? ""),
});

const fail = (error: unknown): CampaignState => {
  if (error instanceof CampaignError) return { error: error.message };
  throw error;
};

/** M4.5 (D-CAMPAIGN): criar (na marca do topo), salvar, publicar e confirmar prêmios. */
export async function saveCampaignAction(_p: CampaignState, f: FormData): Promise<CampaignState> {
  const id = String(f.get("id") ?? "");
  let created: string | null = null;
  try {
    const actor = await currentActor();
    if (id) await updateCampaign(db(), actor, id, input(f));
    else {
      const brand = actor ? (await staffContext(actor)).brand : null;
      if (!brand) return { error: "Escolha a marca no topo." };
      created = (await createCampaign(db(), actor, brand.id, input(f))).id;
    }
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/campanhas");
  if (created) redirect(`/admin/campanhas/${created}`);
  return { ok: "Salvo." };
}

export async function publishCampaignAction(_p: CampaignState, f: FormData): Promise<CampaignState> {
  try {
    await publishCampaign(db(), await currentActor(), String(f.get("id") ?? ""));
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/campanhas");
  return { ok: "Publicada: as creators do público já veem no portal." };
}

export async function settleCampaignAction(_p: CampaignState, f: FormData): Promise<CampaignState> {
  try {
    const r = await settleCampaign(db(), await currentActor(), String(f.get("id") ?? ""));
    revalidatePath("/admin/campanhas");
    return { ok: r.prizes ? `${r.prizes} prêmio(s) lançados no extrato (${formatBRL(r.totalCents)}), já disponíveis para saque.` : "Confirmado: ninguém atingiu prêmio." };
  } catch (error) {
    return fail(error);
  }
}

/** D-CAMPAIGNBOARD: convite (quem não se inscreveu) ou lembrete (inscritas) pelo WhatsApp da marca. */
export async function campaignMessageAction(campaignId: string, to: "invite" | "entrants", creatorIds: string[], title: string, body: string): Promise<{ ok?: string; error?: string }> {
  try {
    const r = await campaignMessage(db(), await currentActor(), campaignId, { to, creatorIds, title, body });
    revalidatePath(`/admin/campanhas/${campaignId}`);
    const n = r.sent === 1 ? "1 creator" : `${r.sent} creators`;
    return { ok: r.whatsapp ? `Enviado para ${n} pelo WhatsApp da marca (aos poucos, das 9h às 20h) e no portal.` : `Enviado para ${n} no portal e por e-mail.` };
  } catch (error) {
    if (error instanceof CampaignError || error instanceof BulkError) return { error: error.message };
    throw error;
  }
}

/** D-CAMPAIGNBOARD: duplica como rascunho e abre a cópia. */
export async function duplicateCampaignAction(campaignId: string): Promise<{ error?: string }> {
  let id: string;
  try {
    id = (await duplicateCampaign(db(), await currentActor(), campaignId)).id;
  } catch (error) {
    if (error instanceof CampaignError) return { error: error.message };
    throw error;
  }
  redirect(`/admin/campanhas/${id}`);
}
