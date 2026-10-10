import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { supabaseServer } from "@/lib/supabase/server";
import { NewPasswordForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NovaSenhaPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar/esqueci");
  return (
    <AuthFrame title="Nova senha">
      <NewPasswordForm />
    </AuthFrame>
  );
}
