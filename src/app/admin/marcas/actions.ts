"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { BrandError, createBrand, updateBrand } from "@/lib/brands/manage";
import { removeBrandAsset, setBrandAsset } from "@/lib/brands/assets";
import type { BrandAssetKind } from "@/domain";
import { db } from "@/lib/db";

export type BrandState = { error?: string; ok?: string } | undefined;

const input = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  slug: String(form.get("slug") ?? ""),
  primaryColor: String(form.get("primaryColor") ?? ""),
  legalName: String(form.get("legalName") ?? ""),
  cnpj: String(form.get("cnpj") ?? ""),
  storeUrl: String(form.get("storeUrl") ?? ""),
  nfServiceCode: String(form.get("nfServiceCode") ?? ""),
  nfServiceDescription: String(form.get("nfServiceDescription") ?? ""),
  nfInstructions: String(form.get("nfInstructions") ?? ""),
  whatsappInstance: String(form.get("whatsappInstance") ?? ""),
  defaultRate: String(form.get("defaultRate") ?? ""),
  defaultDiscount: String(form.get("defaultDiscount") ?? ""),
  ...(form.has("approvalSuggestion") ? { approvalSuggestion: String(form.get("approvalSuggestion") ?? "") } : {}),
  ...(form.has("kitOptionsSent") ? { kitOptions: form.getAll("kitOption").map(String) } : {}),
});

export async function createBrandAction(_prev: BrandState, form: FormData): Promise<BrandState> {
  try {
    const b = await createBrand(db(), await currentActor(), input(form));
    revalidatePath("/admin/marcas");
    return { ok: `${b.name} criada. Próximo passo: conectar a loja em Shopify, com a marca escolhida no topo.` };
  } catch (error) {
    if (error instanceof BrandError) return { error: error.message };
    throw error;
  }
}

export async function updateBrandAction(_prev: BrandState, form: FormData): Promise<BrandState> {
  try {
    await updateBrand(db(), await currentActor(), String(form.get("brandId") ?? ""), input(form));
    revalidatePath("/admin/marcas");
    return { ok: "Salvo." };
  } catch (error) {
    if (error instanceof BrandError) return { error: error.message };
    throw error;
  }
}

/** M4.4a (D-BRANDLOGIN): logo da tela de entrar. */
export async function brandAssetAction(_prev: BrandState, form: FormData): Promise<BrandState> {
  const brandId = String(form.get("brandId") ?? "");
  const kind = String(form.get("kind") ?? "") as BrandAssetKind;
  if (kind !== "LOGO") return { error: "Tipo inválido." };
  try {
    if (form.get("remove")) {
      await removeBrandAsset(db(), await currentActor(), brandId, kind);
    } else {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return { error: "Escolha uma imagem." };
      await setBrandAsset(db(), await currentActor(), brandId, kind, new Uint8Array(await file.arrayBuffer()));
    }
    revalidatePath("/admin/marcas");
    return { ok: form.get("remove") ? "Imagem tirada." : "Imagem salva." };
  } catch (error) {
    if (error instanceof BrandError) return { error: error.message };
    throw error;
  }
}
