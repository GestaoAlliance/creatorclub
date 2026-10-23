import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ui } from "@/components/ui/styles";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { checkAuthorize, OAuthError } from "@/lib/mcp/oauth";
import { decideAction } from "./actions";

export const dynamic = "force-dynamic";

const FIELDS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

// M3.4b (D-MCP): tela de permitir o Claude a ler o Creator Club com o login de quem está aqui.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  let req;
  try {
    req = await checkAuthorize(db(), q);
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="text-xl font-semibold">Pedido de conexão inválido</h1>
        <p className={ui.muted}>{error.message} Tente adicionar o conector de novo no Claude.</p>
      </main>
    );
  }
  const actor = await currentActor();
  const here = `/oauth/authorize?${new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string")).toString()}`;
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(here)}`);
  const staff = actor.grants.length > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
      <section className={`${ui.card} gap-4`}>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5" /> Conectar o Claude ao Creator Club</h1>
        {staff ? (
          <>
            <p className="text-sm">
              <strong>{req.clientName}</strong> quer <strong>ler</strong> os dados do Creator Club que você já vê no painel (vendas, creators, saques,
              produtos e pendências das suas marcas) para responder às suas perguntas.
            </p>
            <ul className="list-disc pl-5 text-sm text-stone-600 dark:text-stone-400">
              <li>Só leitura: nada é criado, aprovado, pago ou mudado.</li>
              <li>Nada de CPF, CNPJ, Pix, endereço, e-mail ou telefone das creators.</li>
              <li>Você desconecta quando quiser, em Configurações → Claude.</li>
            </ul>
            <form action={decideAction} className="flex flex-wrap gap-2">
              {FIELDS.map((k) => (q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null))}
              <button name="decision" value="allow" className={ui.btn}>Permitir</button>
              <button name="decision" value="deny" className={ui.ghost}>Cancelar</button>
            </form>
          </>
        ) : (
          <p className={ui.muted}>O conector é só para a equipe do Creator Club. Sua conta não tem papel na equipe.</p>
        )}
      </section>
    </main>
  );
}
