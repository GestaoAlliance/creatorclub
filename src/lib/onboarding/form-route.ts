import { db } from "@/lib/db";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { ApplicationError, receiveApplication } from "./applications";

/**
 * Recebe uma resposta de formulário do Google Forms (D-ONBOARD, D-CAPTACAO), enviada pelo script do formulário com
 * `Authorization: Bearer $FORMS_SECRET`. Mesma resposta duas vezes não duplica.
 * Corpo: `{ responseId, submittedAt, answers: { "pergunta": "resposta" } }`.
 */
export async function handleFormPost(request: Request, marca: string, source: "hunter_form" | "captacao_form"): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.FORMS_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  let body: { responseId?: unknown; submittedAt?: unknown; answers?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }
  const submittedAt = new Date(String(body.submittedAt ?? ""));
  if (typeof body.responseId !== "string" || Number.isNaN(submittedAt.getTime()) || !body.answers || typeof body.answers !== "object") {
    return Response.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }
  try {
    const r = await receiveApplication(db(), { brandSlug: marca, source, externalKey: body.responseId, submittedAt, answers: body.answers as Record<string, unknown> });
    return Response.json({ ok: true, ...r });
  } catch (error) {
    if (error instanceof ApplicationError) return Response.json({ ok: false, error: error.message }, { status: 422 });
    console.error(`forms.${source}`, error);
    return Response.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
