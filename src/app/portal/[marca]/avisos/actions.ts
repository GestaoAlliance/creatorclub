"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ackNotice } from "@/lib/notifications/notify";
import { currentPortalContext } from "@/lib/portal/current";

/** D-PORTALNOTICES: "Entendi" num recado da equipe (sai do topo e do sino). */
export async function ackNoticeAction(f: FormData): Promise<void> {
  const marca = String(f.get("marca") ?? "");
  const ctx = await currentPortalContext(marca);
  await ackNotice(db(), ctx, String(f.get("id") ?? ""));
  revalidatePath(`/portal/${marca}`, "layout");
}
