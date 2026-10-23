"use server";

import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { checkAuthorize, issueCode } from "@/lib/mcp/oauth";

const back = (redirectUri: string, params: Record<string, string | null>) => {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
};

/** M3.4b (D-MCP): a pessoa permitiu ou recusou; volta para o Claude com o código (ou o erro). */
export async function decideAction(form: FormData) {
  const q = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const req = await checkAuthorize(db(), q);
  if (q.decision !== "allow") redirect(back(req.redirectUri, { error: "access_denied", state: req.state }));
  const code = await issueCode(db(), await currentActor(), req);
  redirect(back(req.redirectUri, { code, state: req.state }));
}
