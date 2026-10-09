import { db } from "@/lib/db";

// Readiness: confirma que o app alcança o banco. Sem detalhes do erro na resposta.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "erro" }, { status: 503 });
  }
}
