import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NewPasswordForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function NovaSenhaPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar/esqueci");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Nova senha</h1>
      <NewPasswordForm />
    </main>
  );
}
