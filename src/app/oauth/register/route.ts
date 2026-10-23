import { db } from "@/lib/db";
import { OAuthError, registerClient } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

// M3.4b (D-MCP): cadastro dinâmico do aplicativo (RFC 7591), usado pelo Claude ao adicionar o conector.
export async function POST(req: Request) {
  try {
    return Response.json(await registerClient(db(), await req.json().catch(() => null)), { status: 201 });
  } catch (error) {
    if (error instanceof OAuthError) return Response.json({ error: error.code, error_description: error.message }, { status: 400 });
    throw error;
  }
}
