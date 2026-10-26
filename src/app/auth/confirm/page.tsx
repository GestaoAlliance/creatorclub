import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";
import { confirmRecoveryAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Link de nova senha gerado pela equipe (M4.4b, D-ACCESS). O código só é conferido no toque do botão: o WhatsApp abre
 * o link sozinho para montar a prévia e, quando a conferência era na abertura, o link de uso único chegava gasto.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const sp = await searchParams;
  const ok = Boolean(sp.token_hash) && sp.type === "recovery";
  return (
    <AuthFrame title="Nova senha" subtitle={ok ? "Toque no botão para criar a sua nova senha." : "Este link não está completo. Peça um novo à equipe."}>
      {ok && (
        <form action={confirmRecoveryAction} className="flex flex-col gap-3">
          <input type="hidden" name="token_hash" value={sp.token_hash} />
          <input type="hidden" name="next" value={sp.next ?? "/entrar/nova-senha"} />
          <button className={ui.btn}>Criar minha nova senha</button>
        </form>
      )}
    </AuthFrame>
  );
}
