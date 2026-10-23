import { authorizationServerMetadata, originOf } from "@/lib/mcp/origin";

export const dynamic = "force-dynamic";

// M3.4b (D-MCP): endereços do login OAuth (RFC 8414).
export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(originOf(req)), { headers: { "Cache-Control": "public, max-age=300" } });
}
