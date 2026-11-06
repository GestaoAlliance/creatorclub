import { currentActor } from "@/lib/auth/current";
import { dayKey } from "@/domain";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { AleloError, aleloCardSheet } from "@/lib/withdrawals/alelo";

export const dynamic = "force-dynamic";

// D-ALELOCARD: planilha de pedido de cartão Alelo (pessoa física) da marca escolhida no topo; quem entra fica marcado.
export async function POST() {
  const actor = await currentActor();
  if (!actor) return new Response("Entre para baixar.", { status: 401 });
  const { brand } = await staffContext(actor);
  if (!brand) return new Response("Escolha a marca no topo.", { status: 400 });
  try {
    const { file } = await aleloCardSheet(db(), actor, brand.id);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="alelo-cartoes-${brand.slug}-${dayKey(new Date(), "America/Sao_Paulo")}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AleloError) return new Response(error.message, { status: 400 });
    throw error;
  }
}
