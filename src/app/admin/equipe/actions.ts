"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { createStaffInvite, disableStaffUser, revokeRoleGrant, revokeStaffInvite, TeamError } from "@/lib/team/invites";

export type InviteState = { error?: string; link?: string; email?: string } | undefined;

export async function inviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  try {
    const { token, invite } = await createStaffInvite(db(), await currentActor(), {
      email: form.get("email"),
      name: form.get("name"),
      role: form.get("role"),
      brandId: form.get("brandId"),
    });
    const origin = (await headers()).get("origin") ?? "";
    revalidatePath("/admin/equipe");
    return { link: `${origin}/convite/${token}`, email: invite.email };
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
