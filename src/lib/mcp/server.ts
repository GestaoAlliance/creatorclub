import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { callTool, ToolError, TOOLS } from "./tools";

/**
 * Protocolo MCP (JSON-RPC 2.0) do conector, sem sessão: `initialize`, `tools/list`, `tools/call`, `ping`. Notificações
 * (sem id) não têm resposta. Erro de ferramenta volta como resultado com `isError` (o Claude lê e explica).
 */

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function one(prisma: PrismaClient, actor: Actor, m: Rpc) {
  if (m.id === undefined) return null; // notificação
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id, error: { code, message } });
  switch (m.method) {
    case "initialize": {
      const asked = typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : VERSIONS[0]!;
      return reply({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "creator-club", version: "1.0.0" },
        instructions:
          "Creator Club da Alliance (Botanika, VermeFree, Revita Derma). Só leitura, com a visão de quem entrou. Valores em reais; vendas contam pela data do pagamento. Responda em português do Brasil.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = typeof m.params?.name === "string" ? m.params.name : "";
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await callTool(prisma, actor, name, args);
        return reply({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });
      } catch (error) {
        if (error instanceof ToolError) return reply({ content: [{ type: "text", text: error.message }], isError: true });
        console.error("mcp.tool", name, error);
        return reply({ content: [{ type: "text", text: "Não foi possível consultar agora. Tente de novo." }], isError: true });
      }
    }
    default:
      return fail(-32601, "Método não suportado.");
  }
}

export async function handleRpc(prisma: PrismaClient, actor: Actor, body: unknown) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => one(prisma, actor, (m ?? {}) as Rpc)))).filter((x) => x !== null);
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } };
  return one(prisma, actor, body as Rpc);
}
