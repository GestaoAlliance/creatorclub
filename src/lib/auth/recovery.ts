import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AccessError, type RecoveryTokenMaker } from "./access";

/** Código de nova senha gerado pelo Supabase (M4.4b): o link aponta para /auth/confirm, que confere no servidor. */
export const supabaseRecoveryToken: RecoveryTokenMaker = async (email) => {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "recovery", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new AccessError("Esta pessoa ainda não tem login no sistema.");
  return token;
};
