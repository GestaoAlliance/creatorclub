"use server";

import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { checkAuthorize, issueCode, OAuthError } from "@/lib/mcp/oauth";

const back = (redirectUri: string, params: Record<string, string | null>) => {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
};

/** M3.4b (D-MCP): a pessoa permitiu ou recusou; volta para o Claude com o código (ou o erro). */
export async function decideAction(form: FormData) {
  const q = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  let req: Awaited<ReturnType<typeof checkAuthorize>>;
  try {
    req = await checkAuthorize(db(), q);
  } catch (error) {
    // Pedido mudou ou ficou inválido entre abrir e clicar: a tela de permitir mostra o motivo (sem erro 500).
    if (!(error instanceof OAuthError)) throw error;
    const { decision: _d, ...rest } = q;
    void _d;
    redirect(`/oauth/authorize?${new URLSearchParams(rest).toString()}`);
  }
  if (q.decision !== "allow") redirect(back(req.redirectUri, { error: "access_denied", state: req.state }));
  let code: string;
  try {
    code = await issueCode(db(), await currentActor(), req);
  } catch (error) {
    // Sessão caiu ou a pessoa perdeu o papel: volta ao Claude com o erro, no endereço já conferido.
    if (!(error instanceof OAuthError)) throw error;
    redirect(back(req.redirectUri, { error: error.code, error_description: error.message, state: req.state }));
  }
  redirect(back(req.redirectUri, { code, state: req.state }));
}
