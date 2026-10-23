import { originOf, protectedResourceMetadata } from "@/lib/mcp/origin";

export const dynamic = "force-dynamic";

// M3.4b (D-MCP): onde o Claude descobre como entrar no conector (RFC 9728).
export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(originOf(req)), { headers: { "Cache-Control": "public, max-age=300" } });
}
