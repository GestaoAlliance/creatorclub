"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_BRAND_COOKIE } from "@/lib/staff/context";

/** Troca a marca do topo do painel (cor e nome). Os dados de cada tela continuam conferidos pela permissão. */
export async function chooseBrandAction(form: FormData): Promise<void> {
  const slug = String(form.get("slug") ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
  (await cookies()).set(STAFF_BRAND_COOKIE, slug, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/admin");
}
