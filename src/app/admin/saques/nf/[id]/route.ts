import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nfLocation, WithdrawalDecisionError } from "@/lib/withdrawals/decide";

export const dynamic = "force-dynamic";

// Abre a NF do saque: confere a permissão e manda para um link assinado de 5 minutos do bucket privado.
export async function GET(_req: Request, ctx: RouteContext<"/admin/saques/nf/[id]">) {
  const { id } = await ctx.params;
  try {
    const file = await nfLocation(db(), await currentActor(), id);
    const { data, error } = await supabaseAdmin().storage.from(file.bucket).createSignedUrl(file.path, 300);
    if (error || !data) throw new Error(error?.message ?? "sem link");
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    if (error instanceof WithdrawalDecisionError) return new NextResponse(error.message, { status: 404 });
    console.error("withdrawal.nf", error);
    return new NextResponse("Não foi possível abrir a nota agora.", { status: 502 });
  }
}
