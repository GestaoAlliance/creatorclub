"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { addPost, PostError, removePost } from "@/lib/posts/posts";

export type PostState = { error?: string; ok?: string } | undefined;

/** M4.6 (D-POSTS): "Meus posts" no portal. */
export async function addMyPostAction(_p: PostState, f: FormData): Promise<PostState> {
  const marca = String(f.get("marca") ?? "");
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const ctx = await currentPortalContext(marca);
    await addPost(db(), { kind: "creator", ctx, userId: actor.userId }, ctx.creatorId, { url: String(f.get("url") ?? ""), postedDay: String(f.get("postedDay") ?? ""), campaignId: String(f.get("campaignId") ?? "") || null });
  } catch (error) {
    if (error instanceof PostError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/portal/${marca}/posts`);
  return { ok: "Post registrado. Em 3 dias você vê as vendas que vieram depois dele." };
}

export async function removeMyPostAction(_p: PostState, f: FormData): Promise<PostState> {
  const marca = String(f.get("marca") ?? "");
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const ctx = await currentPortalContext(marca);
    await removePost(db(), { kind: "creator", ctx, userId: actor.userId }, String(f.get("postId") ?? ""));
  } catch (error) {
    if (error instanceof PostError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/portal/${marca}/posts`);
  return { ok: "Post tirado." };
}
