import { handleFormPost } from "@/lib/onboarding/form-route";

export const dynamic = "force-dynamic";

/** Respostas do formulário Hunter (D-ONBOARD), pelo script `docs/forms/hunter-apps-script.gs`. */
export async function POST(request: Request, ctx: RouteContext<"/api/forms/[marca]/hunter">): Promise<Response> {
  const { marca } = await ctx.params;
  return handleFormPost(request, marca, "hunter_form");
}
