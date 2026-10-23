import { db } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { touchLastSeen } from "./access";
import { loadActor, type Actor } from "./actor";

/** Actor da requisição atual (sessão do Supabase Auth). null = não entrou ou sem acesso. */
export async function currentActor(): Promise<Actor | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return null;
  const actor = await loadActor(db(), userId);
  // M4.4b (D-ACCESS): último acesso (no máximo uma escrita por hora; falha aqui não impede de entrar).
  if (actor) await touchLastSeen(db(), userId).catch(() => {});
  return actor;
}
