import { db } from "@/lib/db";
import { OAuthError, tokenGrant } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

// M3.4b (D-MCP): troca o código pela chave (PKCE) e renova a chave.
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const raw = type.includes("application/json") ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : Object.fromEntries(new URLSearchParams(await req.text()));
  const f = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  try {
    return Response.json(await tokenGrant(db(), f), { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof OAuthError) return Response.json({ error: error.code, error_description: error.message }, { status: error.code === "invalid_client" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
