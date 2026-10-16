import { db } from "@/lib/db";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { pullCentral, pushCentral, SheetError, type CentralPushRow } from "@/lib/sheets/central";

export const dynamic = "force-dynamic";

// Planilhas sincronizadas (D-SHEETSYNC), chamadas pelo script da planilha com `Authorization: Bearer $FORMS_SECRET`
// (o mesmo segredo dos formulários do Google). POST: linhas editadas na planilha. GET ?desde=ISO: o que mudou no sistema.

function denied(request: Request) {
  return !isAuthorizedBearer(request.headers.get("authorization"), process.env.FORMS_SECRET);
}

function fail(error: unknown, planilha: string) {
  if (error instanceof SheetError) return Response.json({ ok: false, error: error.message }, { status: 422 });
  console.error(`sheets.${planilha}`, error);
  return Response.json({ ok: false, error: "erro" }, { status: 500 });
}

export async function POST(request: Request, ctx: RouteContext<"/api/sheets/[marca]/[planilha]">): Promise<Response> {
  if (denied(request)) return Response.json({ ok: false }, { status: 401 });
  const { marca, planilha } = await ctx.params;
  if (planilha !== "central") return Response.json({ ok: false, error: "planilha desconhecida" }, { status: 404 });
  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) return Response.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  try {
    return Response.json({ ok: true, results: await pushCentral(db(), marca, body.rows as CentralPushRow[]) });
  } catch (error) {
    return fail(error, planilha);
  }
}

export async function GET(request: Request, ctx: RouteContext<"/api/sheets/[marca]/[planilha]">): Promise<Response> {
  if (denied(request)) return Response.json({ ok: false }, { status: 401 });
  const { marca, planilha } = await ctx.params;
  if (planilha !== "central") return Response.json({ ok: false, error: "planilha desconhecida" }, { status: 404 });
  const desde = new URL(request.url).searchParams.get("desde");
  const since = desde ? new Date(desde) : null;
  if (since && Number.isNaN(since.getTime())) return Response.json({ ok: false, error: "desde inválido" }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await pullCentral(db(), marca, since)) });
  } catch (error) {
    return fail(error, planilha);
  }
}
