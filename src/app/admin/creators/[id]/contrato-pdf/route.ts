import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current";
import { ContractFileError, contractFileLocation } from "@/lib/contracts/attachment";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// D-CONTRACTFILE: abre o contrato anexado (equipe que vê a creator) por um link assinado de 5 minutos.
export async function GET(_req: Request, ctx: RouteContext<"/admin/creators/[id]/contrato-pdf">) {
  const { id } = await ctx.params;
  try {
    const file = await contractFileLocation(db(), { actor: await currentActor() }, id);
    const { data, error } = await supabaseAdmin().storage.from(file.bucket).createSignedUrl(file.path, 300);
    if (error || !data) throw new Error(error?.message ?? "sem link");
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    if (error instanceof ContractFileError) return new NextResponse(error.message, { status: 404 });
    console.error("contract-file.open", error);
    return new NextResponse("Não foi possível abrir o contrato agora.", { status: 502 });
  }
}
