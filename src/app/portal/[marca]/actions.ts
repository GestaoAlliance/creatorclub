"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { SocialError, updateMyTiktok } from "@/lib/portal/social";

export type TiktokState = { error?: string; ok?: string } | undefined;

export async function saveTiktokAction(_prev: TiktokState, form: FormData): Promise<TiktokState> {
  const marca = String(form.get("marca") ?? "");
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const ctx = await currentPortalContext(marca);
    await updateMyTiktok(db(), ctx, actor.userId, String(form.get("tiktok") ?? ""));
    revalidatePath(`/portal/${marca}`);
    return { ok: "TikTok salvo. Obrigada!" };
  } catch (error) {
    if (error instanceof SocialError) return { error: error.message };
    throw error;
  }
}
