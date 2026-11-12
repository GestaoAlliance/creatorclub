"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { PhotoError, removePhoto, supabasePhotoStore, uploadPhoto, type PhotoWho } from "@/lib/photos/photos";
import { currentPortalContext } from "@/lib/portal/current";

export type PhotoState = { error?: string; ok?: string } | undefined;

/** D-PHOTO: quem está mexendo (creator no portal da marca ou equipe na ficha). */
async function who(f: FormData): Promise<{ who: PhotoWho; creatorId: string } | { error: string }> {
  const actor = await currentActor();
  if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
  const marca = String(f.get("marca") ?? "");
  if (marca) {
    const ctx = await currentPortalContext(marca);
    return { who: { kind: "creator", ctx, userId: actor.userId }, creatorId: ctx.creatorId };
  }
  return { who: { kind: "staff", actor }, creatorId: String(f.get("creatorId") ?? "") };
}

export async function uploadPhotoAction(f: FormData): Promise<PhotoState> {
  const w = await who(f);
  if ("error" in w) return w;
  const file = f.get("photo");
  if (!(file instanceof File)) return { error: "Escolha uma foto." };
  try {
    await uploadPhoto(db(), w.who, w.creatorId, new Uint8Array(await file.arrayBuffer()), supabasePhotoStore());
  } catch (error) {
    if (error instanceof PhotoError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: "Foto atualizada." };
}

export async function removePhotoAction(f: FormData): Promise<PhotoState> {
  const w = await who(f);
  if ("error" in w) return w;
  try {
    await removePhoto(db(), w.who, w.creatorId);
  } catch (error) {
    if (error instanceof PhotoError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: "Foto tirada." };
}
