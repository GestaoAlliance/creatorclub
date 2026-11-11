"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { addPost, PostError, removePost } from "@/lib/posts/posts";
import { BulkError, bulkMessage } from "@/lib/creators/bulk";
import { staffContext } from "@/lib/staff/context";

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

/** D-CONTENTBOARD: lembrete para quem não postou (portal + WhatsApp da marca ou e-mail), leva a "Meus posts". */
export async function remindPostsAction(creatorIds: string[], title: string, body: string): Promise<{ ok?: string; error?: string }> {
  const actor = await currentActor();
  const brand = actor ? (await staffContext(actor)).brand : null;
  if (!actor || !brand) return { error: "Sem permissão." };
  try {
    const r = await bulkMessage(db(), actor, brand.id, creatorIds, { title, body, path: "/posts", audit: { reason: "no_post" } });
    const n = r.sent === 1 ? "1 creator" : `${r.sent} creators`;
    return { ok: r.whatsapp ? `Lembrete enviado para ${n} pelo WhatsApp da marca (aos poucos, das 9h às 20h) e no portal.` : `Lembrete enviado para ${n} no portal e por e-mail.` };
  } catch (error) {
    if (error instanceof BulkError) return { error: error.message };
    throw error;
  }
}
