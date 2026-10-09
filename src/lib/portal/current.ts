import "server-only";
import { cookies } from "next/headers";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { portalContext } from "./context";

/** Cookie da visualização "ver como creator" (D-VIEWAS). Guarda só o id; a permissão é conferida a cada página. */
export const VIEW_AS_COOKIE = "cc_view_as";

/** Contexto do portal para a requisição atual (sessão + cookie de visualização). */
export async function currentPortalContext(brandSlug: string) {
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? null;
  return portalContext(db(), await currentActor(), brandSlug, viewAs);
}
