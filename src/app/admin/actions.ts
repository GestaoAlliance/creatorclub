"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_BRAND_COOKIE } from "@/lib/staff/context";

/**
 * Escolhe a marca do painel (A1, D-ALLIANCE): as telas passam a mostrar só ela. `next` leva direto para uma tela do
 * painel (só caminhos de /admin; o resto volta ao Início).
 */
export async function chooseBrandAction(form: FormData): Promise<void> {
  const slug = String(form.get("slug") ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
  (await cookies()).set(STAFF_BRAND_COOKIE, slug, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const next = String(form.get("next") ?? "");
  redirect(/^\/admin(\/[a-z0-9-]+)*(\?[a-zA-Z0-9=&-]*)?$/.test(next) ? (next as "/admin") : "/admin");
}
