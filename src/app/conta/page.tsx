import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
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
  // D-SIGNUPACCOUNT: quem se cadastrou pelo site entra antes de ser aprovada e vê em que pé está o cadastro.
  const applications = actor
    ? await db().creatorApplication.findMany({
        where: { account: { userId: actor.userId } },
        orderBy: { submittedAt: "desc" },
        select: { id: true, status: true, suggestedCoupon: true, brand: { select: { name: true } } },
      })
    : [];
  if (applications.length > 0) {
    const name = String(data.claims.email ?? "");
    return (
      <AuthFrame title={applications.some((a) => a.status === "NEW") ? "Cadastro em análise" : "Seu cadastro"}>
        {applications.map((a) =>
          a.status === "NEW" ? (
            <div key={a.id} className="flex flex-col gap-2 text-sm text-stone-700 dark:text-stone-300">
              <p>
                Recebemos o seu cadastro na <strong>{a.brand.name}</strong>. A equipe vai analisar e, quando aprovar, você recebe o contrato no seu
                e-mail para assinar.
              </p>
              <p>
                Depois de assinado, o seu cupom {a.suggestedCoupon && <strong className="font-mono">{a.suggestedCoupon}</strong>} é ativado e este
                portal mostra as suas vendas, o saldo e o saque.
              </p>
            </div>
          ) : (
            <p key={a.id} className="text-sm text-stone-700 dark:text-stone-300">
              O seu cadastro na <strong>{a.brand.name}</strong> não foi aprovado desta vez.
            </p>
          ),
        )}
        <p className={ui.hint}>Você entrou como {name}.</p>
        <form action={signOut}>
          <button className={`${ui.ghost} w-full`}>Sair</button>
        </form>
      </AuthFrame>
    );
  }
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
