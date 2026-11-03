import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AccessError, type AuthAdmin, type RecoveryTokenMaker } from "./access";

/** Código de nova senha gerado pelo Supabase (M4.4b): o link aponta para /auth/confirm, que confere no servidor quando a pessoa toca no botão. */
export const supabaseRecoveryToken: RecoveryTokenMaker = async (email) => {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "recovery", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new AccessError("Esta pessoa ainda não tem login no sistema.");
  return token;
};

/** D-ACCESSFIX: senha e e-mail de login trocados direto no Supabase (e-mail já confirmado, sem mandar aviso). */
export const supabaseAuthAdmin: AuthAdmin = {
  async setPassword(userId, password) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
    if (error) throw new AccessError("Não foi possível criar a senha agora. Tente de novo.");
  },
  async setEmail(userId, email) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) throw new AccessError(/already|registered|exists/i.test(error.message) ? "Esse e-mail já tem login no Creator Club." : "Não foi possível trocar o e-mail agora. Tente de novo.");
  },
};
