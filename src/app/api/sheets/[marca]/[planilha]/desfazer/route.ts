import { db } from "@/lib/db";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { undoSheetChanges, type UndoSnapshot } from "@/lib/sheets/undo";

export const dynamic = "force-dynamic";

// Desfaz o que a Central mandou ao sistema (D-SHEETREADONLY). Chamado pelo workflow "Desfazer planilha", que lê os
// valores antigos da cópia de segurança, com `Authorization: Bearer $FORMS_SECRET`.
// Corpo: { since: ISO, apply: boolean, snapshot: UndoSnapshot[] }. Responde só contagens.

export async function POST(request: Request, ctx: RouteContext<"/api/sheets/[marca]/[planilha]/desfazer">): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.FORMS_SECRET)) return Response.json({ ok: false }, { status: 401 });
  const { marca, planilha } = await ctx.params;
  if (planilha !== "central") return Response.json({ ok: false, error: "planilha desconhecida" }, { status: 404 });
  let body: { since?: unknown; apply?: unknown; snapshot?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }
  const since = typeof body.since === "string" ? new Date(body.since) : null;
  if (!since || Number.isNaN(since.getTime()) || !Array.isArray(body.snapshot)) return Response.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  try {
    const report = await undoSheetChanges(db(), marca.toLowerCase(), since, body.snapshot as UndoSnapshot[], body.apply === true);
    return Response.json({ ok: true, applied: body.apply === true, ...report });
  } catch (error) {
    console.error("sheets.desfazer", error);
    return Response.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
