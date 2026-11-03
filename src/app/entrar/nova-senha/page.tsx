import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { supabaseServer } from "@/lib/supabase/server";
import { NewPasswordForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NovaSenhaPage({ searchParams }: { searchParams: Promise<{ provisoria?: string }> }) {
  const { provisoria } = await searchParams;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar/esqueci");
  return (
    <AuthFrame title="Nova senha">
      {/* D-ACCESSFIX: entrou com a senha provisória que a equipe mandou. */}
      {provisoria && <p className="text-sm text-stone-600 dark:text-stone-300">Você entrou com uma senha provisória. Crie agora a sua senha para continuar.</p>}
      <NewPasswordForm />
    </AuthFrame>
  );
}
