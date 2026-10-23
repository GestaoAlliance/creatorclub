"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { revokeAll } from "@/lib/mcp/oauth";

/** M3.4b (D-MCP): desconecta o Claude desta pessoa (cancela todas as chaves dela). */
export async function disconnectAction() {
  const actor = await currentActor();
  if (!actor) return;
  await revokeAll(db(), actor.userId);
  await db().auditLog.create({ data: { actorType: "USER", actorId: actor.userId, action: "mcp.disconnect", entity: "User", entityId: actor.userId } });
  revalidatePath("/admin/claude");
}
