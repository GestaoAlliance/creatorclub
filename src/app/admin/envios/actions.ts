"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { approveShipment, rejectShipment } from "@/lib/shipments/kits";
import { cancelShipment, createShipment, markDeliveredByStaff, markShipped, ShipmentError } from "@/lib/shipments/shipments";

export type ActionState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<unknown>, ok: string): Promise<ActionState> {
  try {
    await fn();
    revalidatePath("/admin/envios");
    return { ok };
  } catch (error) {
    if (error instanceof ShipmentError) return { error: error.message };
    throw error;
  }
}

export async function createShipmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const items = [...form.entries()]
    .filter(([k]) => k.startsWith("qty:"))
    .map(([k, v]) => ({ productId: k.slice(4), quantity: Number(String(v) || "0") }))
    .filter((i) => i.quantity !== 0);
  return run(
    async () => createShipment(db(), await currentActor(), { creatorId: String(form.get("creatorId") ?? ""), items, note: String(form.get("note") ?? "") }),
    "Envio registrado.",
  );
}

export async function shippedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    async () =>
      markShipped(db(), await currentActor(), {
        shipmentId: String(form.get("shipmentId")),
        carrier: String(form.get("carrier") ?? ""),
        trackingCode: String(form.get("trackingCode") ?? ""),
      }),
    "Marcado como enviado.",
  );
}

export async function deliveredAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => markDeliveredByStaff(db(), await currentActor(), String(form.get("shipmentId"))), "Marcado como entregue.");
}

export async function cancelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => cancelShipment(db(), await currentActor(), String(form.get("shipmentId"))), "Envio cancelado.");
}

/** D-KITAPPROVAL: a Gestão aprova o pedido da creator (vai para o Envio). */
export async function approveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => approveShipment(db(), await currentActor(), String(form.get("shipmentId"))), "Pedido aprovado: foi para o Envio.");
}

/** D-KITAPPROVAL: a Gestão recusa com motivo (o kit volta para ela escolher de novo). */
export async function rejectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => rejectShipment(db(), await currentActor(), String(form.get("shipmentId")), String(form.get("reason") ?? "")), "Pedido recusado.");
}
