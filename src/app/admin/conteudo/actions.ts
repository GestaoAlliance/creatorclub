"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { addPost, PostError, removePost } from "@/lib/posts/posts";

export type PostState = { error?: string; ok?: string } | undefined;

/** M4.6 (D-POSTS): a Gestão registra um post em nome da creator (ficha) ou tira um post. */
export async function staffAddPostAction(_p: PostState, f: FormData): Promise<PostState> {
  const creatorId = String(f.get("creatorId") ?? "");
  try {
    await addPost(db(), { kind: "staff", actor: await currentActor() }, creatorId, { url: String(f.get("url") ?? ""), postedDay: String(f.get("postedDay") ?? ""), campaignId: String(f.get("campaignId") ?? "") || null });
  } catch (error) {
    if (error instanceof PostError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/admin/creators/${creatorId}`);
  return { ok: "Post registrado." };
}

export async function staffRemovePostAction(_p: PostState, f: FormData): Promise<PostState> {
  try {
    await removePost(db(), { kind: "staff", actor: await currentActor() }, String(f.get("postId") ?? ""));
  } catch (error) {
    if (error instanceof PostError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin");
  return { ok: "Post tirado." };
}
