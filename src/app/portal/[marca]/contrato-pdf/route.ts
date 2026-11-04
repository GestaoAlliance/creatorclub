import { NextResponse } from "next/server";
import { ContractFileError, contractFileLocation } from "@/lib/contracts/attachment";
import { db } from "@/lib/db";
import { PortalError } from "@/lib/portal/context";
import { currentPortalContext } from "@/lib/portal/current";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// D-CONTRACTFILE: a creator abre o próprio contrato anexado pela equipe (link assinado de 5 minutos).
export async function GET(_req: Request, ctx: RouteContext<"/portal/[marca]/contrato-pdf">) {
  const { marca } = await ctx.params;
  try {
    const portal = await currentPortalContext(marca);
    const file = await contractFileLocation(db(), { portalCreatorId: portal.creatorId }, portal.creatorId);
    const { data, error } = await supabaseAdmin().storage.from(file.bucket).createSignedUrl(file.path, 300);
    if (error || !data) throw new Error(error?.message ?? "sem link");
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    if (error instanceof ContractFileError || error instanceof PortalError) return new NextResponse(error.message, { status: 404 });
    console.error("contract-file.portal", error);
    return new NextResponse("Não foi possível abrir o contrato agora.", { status: 502 });
  }
}
