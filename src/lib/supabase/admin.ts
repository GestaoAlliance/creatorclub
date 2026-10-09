import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "./env";

/**
 * Cliente com a chave secreta do Supabase (só no servidor): cria o login de quem aceita convite.
 * Nunca importar em componente de cliente.
 */
export function supabaseAdmin() {
  const { url } = supabasePublicEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
