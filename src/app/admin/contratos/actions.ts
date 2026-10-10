"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { ContractSignError, publishContract } from "@/lib/contracts/sign";
import { db } from "@/lib/db";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function publishContractAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { version } = await publishContract(db(), await currentActor(), {
      brandId: String(form.get("brandId") ?? ""),
      kind: String(form.get("kind") ?? ""),
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
    });
    revalidatePath("/admin/contratos");
    return { ok: `Versão ${version} publicada. Vale para quem ainda vai assinar; quem já assinou continua com o texto que assinou.` };
  } catch (error) {
    if (error instanceof ContractSignError) return { error: error.message };
    throw error;
  }
}
