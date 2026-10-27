"use server";

import { headers } from "next/headers";
import { publicOrigin } from "@/lib/site";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { configuredSender } from "@/lib/email/sender";
import { staffContext } from "@/lib/staff/context";
import { TeamError } from "@/lib/team/invites";
import { inviteCreatorsInBulk, type BulkInviteResult } from "@/lib/team/creator-invites";

export type BulkInviteState = { results?: BulkInviteResult[]; error?: string } | undefined;

/** D-ACCESSREQ: convites do portal em massa para as creators marcadas (na marca escolhida no topo). */
export async function bulkInviteAction(creatorIds: string[]): Promise<BulkInviteState> {
  const actor = await currentActor();
  if (!actor) return { error: "Sem permissão." };
  const { brand } = await staffContext(actor);
  if (!brand) return { error: "Escolha a marca no topo." };
  const h = await headers();
  const origin = publicOrigin(h);
  try {
    return { results: await inviteCreatorsInBulk(db(), actor, brand.id, creatorIds, { origin, email: configuredSender() }) };
  } catch (error) {
    if (error instanceof TeamError) return { error: error.message };
    throw error;
  }
}
