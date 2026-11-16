"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { changePixKey, PixError } from "@/lib/creators/pix";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";

export type PixState = { error?: string; ok?: string } | undefined;

/** D-PIXCHANGE: a creator troca a própria chave Pix. */
export async function changeMyPixAction(_p: PixState, f: FormData): Promise<PixState> {
  const marca = String(f.get("marca") ?? "");
  const actor = await currentActor();
  if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
  try {
    const ctx = await currentPortalContext(marca);
    const r = await changePixKey(db(), { kind: "creator", ctx, userId: actor.userId }, ctx.creatorId, String(f.get("pixKey") ?? ""));
    revalidatePath(`/portal/${marca}/saque`);
    return { ok: `Chave trocada para ${r.masked}. Você recebe um aviso de confirmação.` };
  } catch (error) {
    if (error instanceof PixError) return { error: error.message };
    throw error;
  }
}
