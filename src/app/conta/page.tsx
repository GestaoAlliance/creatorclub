import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";
import { currentActor } from "@/lib/auth/current";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../entrar/actions";

export const dynamic = "force-dynamic";

// Depois de entrar: equipe vai para o painel, creator para o portal. Sem acesso liberado: aviso e sair.
export default async function ContaPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar?next=/conta");
  const actor = await currentActor();
  if (actor && actor.grants.length > 0) redirect("/admin");
  if (actor && Object.keys(actor.creatorIds).length > 0) redirect("/portal");
  return (
    <AuthFrame title="Quase lá">
      <p className={ui.muted}>
        Você entrou como <strong>{String(data.claims.email ?? "")}</strong>, mas seu acesso ainda não foi liberado. Fale com a equipe da
        marca.
      </p>
      <form action={signOut}>
        <button className={`${ui.ghost} w-full`}>Sair</button>
      </form>
    </AuthFrame>
  );
}
