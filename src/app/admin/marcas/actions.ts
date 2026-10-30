"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { BrandError, createBrand, updateBrand } from "@/lib/brands/manage";
import { removeBrandAsset, setBrandAsset } from "@/lib/brands/assets";
import type { BrandAssetKind } from "@/domain";
import { db } from "@/lib/db";
import { ContractSendError, setContractLock } from "@/lib/autentique/applications";

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
  ...(form.has("shopDiscount") ? { shopDiscount: String(form.get("shopDiscount") ?? "") } : {}),
  ...(form.has("financeEmail") ? { financeEmail: String(form.get("financeEmail") ?? "") } : {}),
  ...Object.fromEntries((["bankConvenio", "bankAgency", "bankAgencyDv", "bankAccount", "bankAccountDv"] as const).filter((k) => form.has(k)).map((k) => [k, String(form.get(k) ?? "")])),
  // D-LABEL: remetente dos envios.
  ...(form.has("shipFromZip")
    ? { shipFrom: Object.fromEntries((["zip", "street", "number", "complement", "district", "city", "state", "phone"] as const).map((k) => [k, String(form.get(`shipFrom${k[0]!.toUpperCase()}${k.slice(1)}`) ?? "")])) as { zip: string; street: string; number: string; complement: string; district: string; city: string; state: string; phone: string } }
    : {}),
  ...(form.has("kitOptionsSent") ? { kitOptions: form.getAll("kitOption").map(String) } : {}),
  // D-WELCOMECHOICE: produtos do envio inicial.
  ...(form.has("welcomeSent")
    ? { welcome: { one: String(form.get("welcomeOne") ?? ""), two: [String(form.get("welcomeTwoA") ?? ""), String(form.get("welcomeTwoB") ?? "")] as [string, string] } }
    : {}),
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

/** D-CONTRACTSWITCH: liga/desliga a trava do contrato na aprovação; desligar libera quem está esperando. */
export async function contractLockAction(_prev: BrandState, form: FormData): Promise<BrandState> {
  const on = form.get("on") === "1";
  try {
    const r = await setContractLock(db(), await currentActor(), String(form.get("brandId") ?? ""), on);
    revalidatePath("/admin/marcas");
    revalidatePath("/admin/candidatas");
    if (on) return { ok: "Trava ligada: aprovar volta a esperar o contrato assinado." };
    const failed = r.failed.length ? ` Não liberou (tenta de novo sozinho em 5 min): ${r.failed.join(", ")}.` : "";
    return { ok: `Trava desligada: aprovar libera na hora. ${r.released} liberada(s) agora.${failed}` };
  } catch (error) {
    if (error instanceof ContractSendError) return { error: error.message };
    throw error;
  }
}
