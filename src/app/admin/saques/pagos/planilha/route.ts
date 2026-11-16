import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { PaidListError, paidCsv, paidList } from "@/lib/withdrawals/paid";

export const dynamic = "force-dynamic";

// Planilha dos pagos do mês (D-PAIDLIST), marca escolhida no topo.
export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor) return new Response("Entre para baixar.", { status: 401 });
  const { brand } = await staffContext(actor);
  if (!brand) return new Response("Nenhuma marca.", { status: 404 });
  try {
    const data = await paidList(db(), actor, brand.id, new URL(req.url).searchParams.get("mes") ?? undefined);
    return new Response(paidCsv(data.rows, brand.name), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pagos-${brand.slug}-${data.month}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PaidListError) return new Response(error.message, { status: 403 });
    throw error;
  }
}
