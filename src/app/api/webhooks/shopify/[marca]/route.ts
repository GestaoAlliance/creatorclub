import { db } from "@/lib/db";
import { receiveShopifyWebhook } from "@/lib/shopify/webhook";

// Webhook do Shopify por marca: valida HMAC, grava evento + tarefa na mesma transação e responde (D-QUEUE).
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/shopify/[marca]">): Promise<Response> {
  const { marca } = await ctx.params;
  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    const res = await receiveShopifyWebhook(db(), { brandSlug: marca, headers: request.headers, rawBody });
    return Response.json(res.body, { status: res.status });
  } catch {
    // Sem gravar, o Shopify tenta de novo mais tarde.
    return Response.json({ ok: false }, { status: 500 });
  }
}
