"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { startHistoricalImport } from "@/lib/shopify/backfill";
import { ConnectError, connectShopifyStore } from "@/lib/shopify/connect";
import { requestProductSync } from "@/lib/shopify/products";
import { AutentiqueConnectError, connectAutentique } from "@/lib/autentique/credentials";
import { requestSyncNow } from "@/lib/shopify/reconcile";

export type FormState = { error?: string; ok?: string } | undefined;

export async function connectAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const h = await headers();
    const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const appUrl = prodHost ? `https://${prodHost}` : (h.get("origin") ?? "");
    const actor = await currentActor();
    const brandId = String(form.get("brandId") ?? "");
    const r = await connectShopifyStore(db(), actor, {
      brandId,
      shop: String(form.get("shop") ?? ""),
      clientId: String(form.get("clientId") ?? ""),
      clientSecret: String(form.get("clientSecret") ?? ""),
      appUrl,
    });
    await requestProductSync(db(), actor, brandId); // catálogo da loja logo depois de conectar
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

export async function productSyncAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const created = await requestProductSync(db(), await currentActor(), String(form.get("brandId") ?? ""));
    revalidatePath("/admin/sync");
    return { ok: created ? "Atualização do catálogo pedida; roda em até 1 minuto." : "Já foi pedida neste minuto." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro." };
  }
}

/** D-AUTENTIQUE: conecta a conta do Autentique da marca (chave da API) e confere a chave na hora. */
export async function autentiqueConnectAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const r = await connectAutentique(db(), await currentActor(), {
      brandId: String(form.get("brandId") ?? ""),
      token: String(form.get("token") ?? ""),
      sandbox: form.get("sandbox") === "on",
    });
    revalidatePath("/admin/sync");
    return { ok: `Autentique conectado (conta ${r.account}).` };
  } catch (error) {
    if (error instanceof AutentiqueConnectError) return { error: error.message };
    throw error;
  }
}

/** M4.7 (D-SHEETOFF): desligar ou religar a leitura de uma planilha (só super admin). */
export async function sheetSwitchAction(form: FormData): Promise<void> {
  const { setSheetReading } = await import("@/lib/sheets/switch");
  await setSheetReading(db(), await currentActor(), String(form.get("brandId") ?? ""), String(form.get("sheet") ?? ""), form.get("on") === "1");
  revalidatePath("/admin/sync");
}
