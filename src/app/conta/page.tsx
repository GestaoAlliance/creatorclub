import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../entrar/actions";

export const dynamic = "force-dynamic";

// Página mínima de quem entrou. Papéis e o que cada um vê chegam na E2.2.
export default async function ContaPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar?next=/conta");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Você entrou</h1>
      <p className="text-stone-600">{String(data.claims.email ?? "")}</p>
      <form action={signOut}>
        <button className="rounded border border-stone-300 px-3 py-2">Sair</button>
      </form>
    </main>
  );
}
