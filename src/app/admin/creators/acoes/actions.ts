"use server";

import { revalidatePath } from "next/cache";
import { ActionError, markActionDone, sendActionMessages } from "@/lib/actions/queue";
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

export type SendState = { error?: string; ok?: string };

/** D-ACTIONSBOARD: manda as mensagens pelo WhatsApp da marca (uma tarefa ou todas de um tipo) e marca como feitas. */
export async function sendAction(items: { key: string; title: string; text: string }[]): Promise<SendState> {
  const actor = await currentActor();
  const brand = actor ? (await staffContext(actor)).brand : null;
  if (!actor || !brand) return { error: "Sem permissão." };
  try {
    const r = await sendActionMessages(db(), actor, brand.id, items);
    revalidatePath("/admin/creators/acoes");
    const n = r.sent === 1 ? "1 mensagem enviada" : `${r.sent} mensagens enviadas`;
    return { ok: r.whatsapp ? `${n} pelo WhatsApp da marca (sai aos poucos, das 9h às 20h) e no portal.` : `${n} no portal e por e-mail (WhatsApp da marca não está ligado).` };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}
