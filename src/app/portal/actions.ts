"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { startViewAs } from "@/lib/portal/context";
import { VIEW_AS_COOKIE } from "@/lib/portal/current";

// "Ver como creator" (D-VIEWAS): só super admin; só leitura; registrado na auditoria.
export async function viewAsAction(form: FormData): Promise<void> {
  const creatorId = String(form.get("creatorId") ?? "");
  const slug = await startViewAs(db(), await currentActor(), creatorId);
  (await cookies()).set(VIEW_AS_COOKIE, creatorId, { httpOnly: true, secure: true, sameSite: "lax", path: "/portal", maxAge: 60 * 60 });
  redirect(`/portal/${slug}`);
}

export async function stopViewAsAction(form: FormData): Promise<void> {
  const creatorId = String(form.get("creatorId") ?? "");
  (await cookies()).delete({ name: VIEW_AS_COOKIE, path: "/portal" });
  redirect(creatorId ? `/admin/creators/${creatorId}` : "/conta");
}
