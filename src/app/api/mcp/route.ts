import { db } from "@/lib/db";
import { actorFromBearer } from "@/lib/mcp/oauth";
import { originOf } from "@/lib/mcp/origin";
import { handleRpc } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// M3.4b (D-MCP): conector do Creator Club no Claude (MCP por HTTP, sem sessão). Só leitura, com a visão de quem entrou.
export async function POST(req: Request) {
  const actor = await actorFromBearer(db(), req.headers.get("authorization"));
  if (!actor) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Entre com o login do Creator Club." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource"` } },
    );
  }
  const body = await req.json().catch(() => null);
  const out = await handleRpc(db(), actor, body);
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out);
}

export function GET() {
  return new Response("Use POST.", { status: 405, headers: { Allow: "POST" } });
}
