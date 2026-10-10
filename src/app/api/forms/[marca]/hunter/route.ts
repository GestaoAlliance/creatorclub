import { db } from "@/lib/db";
import { isAuthorizedBearer } from "@/lib/jobs/secret";
import { ApplicationError, receiveApplication } from "@/lib/onboarding/applications";

export const dynamic = "force-dynamic";

/**
 * Recebe uma resposta do formulário Hunter (D-ONBOARD), enviada pelo script do Google Forms
 * (`docs/forms/hunter-apps-script.gs`) com `Authorization: Bearer $FORMS_SECRET`. Mesma resposta duas vezes não
 * duplica. Corpo: `{ responseId, submittedAt, answers: { "pergunta": "resposta" } }`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/forms/[marca]/hunter">): Promise<Response> {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.FORMS_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const { marca } = await ctx.params;
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
    const r = await receiveApplication(db(), {
      brandSlug: marca,
      source: "hunter_form",
      externalKey: body.responseId,
      submittedAt,
      answers: body.answers as Record<string, unknown>,
    });
    return Response.json({ ok: true, ...r });
  } catch (error) {
    if (error instanceof ApplicationError) return Response.json({ ok: false, error: error.message }, { status: 422 });
    console.error("forms.hunter", error);
    return Response.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
