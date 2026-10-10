import { handleFormPost } from "@/lib/onboarding/form-route";

export const dynamic = "force-dynamic";

/** Respostas do formulário de Captação Botanika + VermeFree (D-CAPTACAO), pelo script `docs/forms/captacao-apps-script.gs`. */
export async function POST(request: Request, ctx: RouteContext<"/api/forms/[marca]/captacao">): Promise<Response> {
  const { marca } = await ctx.params;
  return handleFormPost(request, marca, "captacao_form");
}
