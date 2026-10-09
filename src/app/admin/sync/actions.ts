"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { startHistoricalImport } from "@/lib/shopify/backfill";
import { ConnectError, connectShopifyStore } from "@/lib/shopify/connect";
import { requestSyncNow } from "@/lib/shopify/reconcile";

export type FormState = { error?: string; ok?: string } | undefined;

export async function connectAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const h = await headers();
    const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const appUrl = prodHost ? `https://${prodHost}` : (h.get("origin") ?? "");
    const r = await connectShopifyStore(db(), await currentActor(), {
      brandId: String(form.get("brandId") ?? ""),
      shop: String(form.get("shop") ?? ""),
      clientId: String(form.get("clientId") ?? ""),
      clientSecret: String(form.get("clientSecret") ?? ""),
      appUrl,
    });
    revalidatePath("/admin/sync");
    const extra = [
      r.missingRecommended.length ? `Faltam permissões recomendadas: ${r.missingRecommended.join(", ")}.` : "",
      ...r.warnings,
    ].filter(Boolean);
    return { ok: `Loja ${r.shop} conectada; ${r.webhooksCreated} webhooks cadastrados. ${extra.join(" ")}`.trim() };
  } catch (error) {
    if (error instanceof ConnectError) return { error: error.message };
    if (error instanceof Error && /myshopify|Domínio/.test(error.message)) return { error: error.message };
    throw error;
  }
}

export async function syncNowAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const created = await requestSyncNow(db(), await currentActor(), String(form.get("brandId") ?? ""));
    revalidatePath("/admin/sync");
    return { ok: created ? "Sincronização pedida; roda em até 1 minuto." : "Já foi pedida neste minuto." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro." };
  }
}

export async function backfillAction(_prev: FormState, form: FormData): Promise<FormState> {
  const since = new Date(`${String(form.get("since") ?? "")}T00:00:00-03:00`);
  try {
    await startHistoricalImport(db(), await currentActor(), String(form.get("brandId") ?? ""), since);
    revalidatePath("/admin/sync");
    return { ok: "Carga histórica pedida. Acompanhe nas passadas abaixo." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro." };
  }
}
