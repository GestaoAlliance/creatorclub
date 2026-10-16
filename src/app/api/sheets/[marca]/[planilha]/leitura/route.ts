import { db } from "@/lib/db";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { readCentral, SheetError, type CentralReadRow } from "@/lib/sheets/central";
import { readEnvios, type EnviosReadRow } from "@/lib/sheets/envios";

export const dynamic = "force-dynamic";

// Leitura das planilhas (D-SHEETREADONLY): `central` e `envios`, chamada a cada 15 min por um script na conta da marca, fora da planilha,
// com `Authorization: Bearer $FORMS_SECRET`. Corpo: { rows: [{ tab, row, values }] }. Nada é escrito na planilha.

export async function POST(request: Request, ctx: RouteContext<"/api/sheets/[marca]/[planilha]/leitura">): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.FORMS_SECRET)) return Response.json({ ok: false }, { status: 401 });
  const { marca, planilha } = await ctx.params;
  if (planilha !== "central" && planilha !== "envios") return Response.json({ ok: false, error: "planilha desconhecida" }, { status: 404 });
  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) return Response.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  try {
    const result = planilha === "central" ? await readCentral(db(), marca, body.rows as CentralReadRow[]) : await readEnvios(db(), marca, body.rows as EnviosReadRow[]);
    return Response.json({ ok: true, planilha, ...result });
  } catch (error) {
    if (error instanceof SheetError) return Response.json({ ok: false, error: error.message }, { status: 422 });
    console.error("sheets.leitura", error);
    return Response.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
