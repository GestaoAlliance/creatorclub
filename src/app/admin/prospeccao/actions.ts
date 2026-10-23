"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { addProspects, ProspectError, saveProspectMessages, updateProspect } from "@/lib/prospects/prospects";

export type ProspectState = { error?: string; ok?: string; warn?: string[] } | undefined;

const fmt = (day: string) => day.split("-").reverse().slice(0, 2).join("/");

/** U6 (D-PROSPECT): registra um ou vários @ abordados. Repetido avisa quem abordou e não duplica. */
export async function addProspectsAction(_p: ProspectState, f: FormData): Promise<ProspectState> {
  try {
    const r = await addProspects(db(), await currentActor(), String(f.get("brandId") ?? ""), {
      handles: String(f.get("handles") ?? ""),
      approachedOn: String(f.get("approachedOn") ?? ""),
      status: String(f.get("status") ?? ""),
      note: String(f.get("note") ?? ""),
    });
    revalidatePath("/admin/prospeccao");
    const warn = [
      ...r.duplicates.map((d) => `@${d.handle} já foi abordada por ${d.owner} em ${fmt(d.approachedOn)} (${d.status}).`),
      ...r.invalid.map((i) => `"${i}" não parece um @ do Instagram.`),
    ];
    return { ok: r.created.length ? `${r.created.length} ${r.created.length === 1 ? "perfil registrado" : "perfis registrados"}.` : "Nenhum perfil novo.", warn };
  } catch (error) {
    if (error instanceof ProspectError) return { error: error.message };
    throw error;
  }
}

export async function updateProspectAction(_p: ProspectState, f: FormData): Promise<ProspectState> {
  try {
    await updateProspect(db(), await currentActor(), String(f.get("id") ?? ""), {
      ...(f.has("status") ? { status: String(f.get("status")) } : {}),
      ...(f.has("note") ? { note: String(f.get("note")) } : {}),
    });
  } catch (error) {
    if (error instanceof ProspectError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/prospeccao");
  return { ok: "Salvo." };
}

export async function saveProspectMessagesAction(_p: ProspectState, f: FormData): Promise<ProspectState> {
  try {
    await saveProspectMessages(db(), await currentActor(), String(f.get("brandId") ?? ""), { first: String(f.get("first") ?? ""), proposal: String(f.get("proposal") ?? "") });
  } catch (error) {
    if (error instanceof ProspectError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/prospeccao");
  return { ok: "Mensagens salvas." };
}
