"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { BrandError, createBrand, updateBrand } from "@/lib/brands/manage";
import { db } from "@/lib/db";

export type BrandState = { error?: string; ok?: string } | undefined;

const input = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  slug: String(form.get("slug") ?? ""),
  primaryColor: String(form.get("primaryColor") ?? ""),
  legalName: String(form.get("legalName") ?? ""),
  cnpj: String(form.get("cnpj") ?? ""),
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
