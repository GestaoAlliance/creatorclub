"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { BulkError, bulkMessage, bulkTag } from "@/lib/creators/bulk";
import { creatorPeek, PeekError, type CreatorPeek } from "@/lib/creators/peek";
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

export type BulkResult = { ok?: string; error?: string };

/** D-CREATORLIST: põe ou tira uma tag das creators marcadas. */
export async function bulkTagAction(creatorIds: string[], op: { add: string } | { remove: string }): Promise<BulkResult> {
  const actor = await currentActor();
  const { brand } = actor ? await staffContext(actor) : { brand: null };
  if (!actor || !brand) return { error: "Sem permissão." };
  try {
    const r = await bulkTag(db(), actor, brand.id, creatorIds, op);
    revalidatePath("/admin/creators");
    const n = r.changed;
    return { ok: "add" in op ? `Tag "${r.tag}" posta em ${n} creator${n === 1 ? "" : "s"}.` : `Tag "${r.tag}" tirada de ${n} creator${n === 1 ? "" : "s"}.` };
  } catch (error) {
    if (error instanceof BulkError) return { error: error.message };
    throw error;
  }
}

/** D-BULKMSG: mensagem da equipe para as marcadas (portal + WhatsApp da marca ou e-mail). */
export async function bulkMessageAction(creatorIds: string[], title: string, body: string): Promise<BulkResult> {
  const actor = await currentActor();
  const { brand } = actor ? await staffContext(actor) : { brand: null };
  if (!actor || !brand) return { error: "Sem permissão." };
  try {
    const r = await bulkMessage(db(), actor, brand.id, creatorIds, { title, body });
    const where = r.whatsapp ? "no portal e no WhatsApp da marca (sai aos poucos, das 9h às 20h)" : "no portal e por e-mail";
    return { ok: `Mensagem enviada para ${r.sent} creator${r.sent === 1 ? "" : "s"}, ${where}.` };
  } catch (error) {
    if (error instanceof BulkError) return { error: error.message };
    throw error;
  }
}

/** D-CREATORLIST: resumo do painel lateral (saldo, contrato, último envio, últimos acontecimentos). */
export async function peekAction(creatorId: string): Promise<CreatorPeek | null> {
  const actor = await currentActor();
  try {
    return await creatorPeek(db(), actor, creatorId);
  } catch (error) {
    if (error instanceof PeekError) return null;
    throw error;
  }
}
