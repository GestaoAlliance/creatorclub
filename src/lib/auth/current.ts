import { db } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { loadActor, type Actor } from "./actor";

/** Actor da requisição atual (sessão do Supabase Auth). null = não entrou ou sem acesso. */
export async function currentActor(): Promise<Actor | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return null;
  return loadActor(db(), userId);
}
