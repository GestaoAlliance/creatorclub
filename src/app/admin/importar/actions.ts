"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { importLegacyCreators, type ImportReport } from "@/lib/import/legacy";

export type ImportState = { error?: string; report?: ImportReport } | undefined;

const MAX_BYTES = 2 * 1024 * 1024;

export async function importAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo Creator_rows.csv." };
  if (file.size > MAX_BYTES) return { error: "Arquivo grande demais (máximo 2 MB)." };
  try {
    const report = await importLegacyCreators(db(), await currentActor(), { brandId: String(form.get("brandId") ?? ""), csv: await file.text() });
    revalidatePath("/admin/importar");
    return { report };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao importar." };
  }
}
