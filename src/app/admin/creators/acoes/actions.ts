"use server";

import { revalidatePath } from "next/cache";
import { ActionError, markActionDone } from "@/lib/actions/queue";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";

export type DoneState = { error?: string; ok?: string } | undefined;

export async function doneAction(_prev: DoneState, form: FormData): Promise<DoneState> {
  const actor = await currentActor();
  const brand = actor ? (await staffContext(actor)).brand : null;
  if (!actor || !brand) return { error: "Sem permissão." };
  try {
    await markActionDone(db(), actor, brand.id, String(form.get("key") ?? ""));
    revalidatePath("/admin/creators/acoes");
    return { ok: "Feito." };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}
