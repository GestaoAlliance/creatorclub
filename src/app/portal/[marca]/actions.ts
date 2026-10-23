"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { setMyBirthDate, SocialError, updateMyTiktok } from "@/lib/portal/social";

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

/** M4.2 (D-TAGS): aniversário informado pela creator no Início. */
export async function saveBirthDateAction(_prev: TiktokState, form: FormData): Promise<TiktokState> {
  const marca = String(form.get("marca") ?? "");
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const ctx = await currentPortalContext(marca);
    await setMyBirthDate(db(), ctx, actor.userId, String(form.get("birthDate") ?? ""));
    revalidatePath(`/portal/${marca}`);
    return { ok: "Anotado. Obrigada!" };
  } catch (error) {
    if (error instanceof SocialError) return { error: error.message };
    throw error;
  }
}
