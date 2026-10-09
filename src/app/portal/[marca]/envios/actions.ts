"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { AddressError } from "@/lib/shipments/address";
import { confirmReceived, ShipmentError, updateMyAddress } from "@/lib/shipments/shipments";

export type EnviosState = { error?: string; ok?: string } | undefined;

async function run(marca: string, fn: (userId: string) => Promise<void>, ok: string): Promise<EnviosState> {
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    await fn(actor.userId);
    revalidatePath(`/portal/${marca}/envios`);
    return { ok };
  } catch (error) {
    if (error instanceof ShipmentError || error instanceof AddressError) return { error: error.message };
    throw error;
  }
}

export async function saveAddressAction(_prev: EnviosState, form: FormData): Promise<EnviosState> {
  const marca = String(form.get("marca") ?? "");
  const f = (k: string) => String(form.get(k) ?? "");
  return run(
    marca,
    async (userId) => {
      const ctx = await currentPortalContext(marca);
      await updateMyAddress(db(), ctx, userId, {
        zip: f("zip"),
        street: f("street"),
        number: f("number"),
        complement: f("complement"),
        district: f("district"),
        city: f("city"),
        state: f("state"),
      });
    },
    "Endereço salvo.",
  );
}

export async function confirmReceivedAction(_prev: EnviosState, form: FormData): Promise<EnviosState> {
  const marca = String(form.get("marca") ?? "");
  return run(
    marca,
    async (userId) => {
      const ctx = await currentPortalContext(marca);
      await confirmReceived(db(), ctx, userId, String(form.get("shipmentId") ?? ""));
    },
    "Recebimento confirmado. Obrigada!",
  );
}
