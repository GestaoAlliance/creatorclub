"use server";

import { revalidatePath } from "next/cache";
import { FirstKitNoticeError, startFirstKitNotices } from "@/lib/shipments/first-kit-notice";
import { staffContext } from "@/lib/staff/context";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { approveShipment, rejectShipment } from "@/lib/shipments/kits";
import type { AddressInput } from "@/lib/shipments/address";
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
    async () =>
      createShipment(db(), await currentActor(), {
        creatorId: String(form.get("creatorId") ?? ""),
        items,
        note: String(form.get("note") ?? ""),
        // D-SHIPANYONE: só vem quando a creator não tem endereço (campos abertos no formulário).
        address: form.has("zip")
          ? (Object.fromEntries(["zip", "street", "number", "complement", "district", "city", "state"].map((k) => [k, String(form.get(k) ?? "")])) as AddressInput)
          : undefined,
      }),
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
        freight: String(form.get("freight") ?? ""),
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

/** D-FIRSTKITNOTICE: o super admin dispara o aviso do 1º produto da marca escolhida no topo. */
export async function firstKitNoticeAction(_prev: ActionState): Promise<ActionState> {
  const actor = await currentActor();
  try {
    const brandId = actor ? (await staffContext(actor)).brand?.id : undefined;
    if (!brandId) return { error: "Escolha a marca no topo." };
    const r = await startFirstKitNotices(db(), actor, brandId);
    revalidatePath("/admin/envios");
    return { ok: `${r.queued} avisos na fila do WhatsApp.` };
  } catch (error) {
    if (error instanceof FirstKitNoticeError) return { error: error.message };
    throw error;
  }
}
