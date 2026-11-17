"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { requestDataFix, SELF_EDIT_LABEL, updateMyBirthDate, updateMyInstagram, updateMyPersonal, type SelfEditField } from "@/lib/portal/profile";
import { supabaseAuthAdmin } from "@/lib/auth/recovery";
import { AccessError } from "@/lib/auth/access";
import { SocialError, updateMyTiktok } from "@/lib/portal/social";

export type ProfileState = { error?: string; ok?: string } | undefined;

async function run(form: FormData, ok: string, fn: (ctx: Awaited<ReturnType<typeof currentPortalContext>>, userId: string) => Promise<unknown>): Promise<ProfileState> {
  const marca = String(form.get("marca") ?? "");
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Sua sessão expirou. Entre de novo." };
    const ctx = await currentPortalContext(marca);
    await fn(ctx, actor.userId);
    revalidatePath(`/portal/${marca}/cadastro`);
    return { ok };
  } catch (error) {
    if (error instanceof SocialError || error instanceof AccessError) return { error: error.message };
    throw error;
  }
}

/** D-PORTALPROFILE: Instagram, TikTok e aniversário no "Meu cadastro". */
export async function saveSocialAction(_p: ProfileState, form: FormData): Promise<ProfileState> {
  const field = String(form.get("field") ?? "");
  const value = String(form.get("value") ?? "");
  return run(form, "Salvo. Obrigada!", (ctx, userId) =>
    field === "instagram" ? updateMyInstagram(db(), ctx, userId, value) : field === "tiktok" ? updateMyTiktok(db(), ctx, userId, value) : updateMyBirthDate(db(), ctx, userId, value),
  );
}

/** D-DATAFIX: pedido de correção à equipe. */
export async function requestFixAction(_p: ProfileState, form: FormData): Promise<ProfileState> {
  return run(form, "Pedido enviado. A equipe corrige e te avisa.", (ctx, userId) => requestDataFix(db(), ctx, userId, String(form.get("field") ?? ""), String(form.get("message") ?? "")));
}

/** D-SELFEDIT: nome, telefone, e-mail (e o login), CPF e CNPJ, salvos na hora. */
export async function savePersonalAction(_p: ProfileState, form: FormData): Promise<ProfileState> {
  const field = String(form.get("field") ?? "");
  const label = SELF_EDIT_LABEL[field as SelfEditField] ?? "dado";
  return run(form, field === "email" ? "E-mail salvo. A partir de agora você entra com ele." : `Pronto, ${label} atualizado.`, (ctx, userId) =>
    updateMyPersonal(db(), ctx, userId, field, String(form.get("value") ?? ""), (id, email) => supabaseAuthAdmin.setEmail(id, email)),
  );
}
