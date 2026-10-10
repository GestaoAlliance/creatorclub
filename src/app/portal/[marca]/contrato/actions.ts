"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { ContractSignError, signContract } from "@/lib/contracts/sign";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";

export type ContractState = { error?: string } | undefined;

export async function signContractAction(_prev: ContractState, form: FormData): Promise<ContractState> {
  const marca = String(form.get("marca") ?? "");
  try {
    const ctx = await currentPortalContext(marca);
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const h = await headers();
    await signContract(db(), ctx, {
      actorUserId: actor.userId,
      documentId: String(form.get("documentId") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
      cpf: String(form.get("cpf") ?? ""),
      address: String(form.get("address") ?? ""),
      cnpj: String(form.get("cnpj") ?? ""),
      companyName: String(form.get("companyName") ?? ""),
      accept: form.get("accept") === "on",
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });
  } catch (error) {
    if (error instanceof ContractSignError) return { error: error.message };
    throw error;
  }
  redirect(`/portal/${marca}`);
}
