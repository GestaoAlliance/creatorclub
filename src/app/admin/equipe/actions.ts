"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { createStaffInvite, disableStaffUser, revokeRoleGrant, revokeStaffInvite, TeamError } from "@/lib/team/invites";
import { emailStaffInvite } from "@/lib/team/invite-email";
import { configuredSender } from "@/lib/email/sender";

export type InviteState = { error?: string; link?: string; email?: string; mailed?: boolean; mailError?: string } | undefined;

export async function inviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  try {
    const actor = await currentActor();
    const { token, invite } = await createStaffInvite(db(), actor, {
      email: form.get("email"),
      name: form.get("name"),
      role: form.get("role"),
      brandId: form.get("brandId"),
    });
    const origin = (await headers()).get("origin") ?? "";
    const link = `${origin}/convite/${token}`;
    // D-EMAIL: com remetente configurado, o convite também vai por e-mail.
    const mail = await emailStaffInvite(db(), configuredSender(), { inviteId: invite.id, actorId: actor!.userId, link });
    revalidatePath("/admin/equipe");
    return { link, email: invite.email, ...(mail ? (mail.sent ? { mailed: true } : { mailError: mail.reason }) : {}) };
  } catch (error) {
    if (error instanceof TeamError) return { error: error.message };
    throw error;
  }
}

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof TeamError)) throw error;
    // Erro de regra (ex.: último super admin): a lista recarrega sem mudar nada.
  }
  revalidatePath("/admin/equipe");
}

export async function revokeInviteAction(form: FormData) {
  await run(async () => revokeStaffInvite(db(), await currentActor(), String(form.get("id"))));
}

export async function revokeGrantAction(form: FormData) {
  await run(async () => revokeRoleGrant(db(), await currentActor(), String(form.get("id"))));
}

export async function disableUserAction(form: FormData) {
  await run(async () => disableStaffUser(db(), await currentActor(), String(form.get("id"))));
}
