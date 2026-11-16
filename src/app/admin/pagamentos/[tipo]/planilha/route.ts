import { dayKey } from "@/domain";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { payMonthBoard, PayFlowError, payRowsCsv, type PayTab } from "@/lib/payouts/month-board";

export const dynamic = "force-dynamic";

// Planilha da aba (D-PAYFLOW): as linhas do mês, ou só as selecionadas (`ids`).
export async function GET(req: Request, ctx: RouteContext<"/admin/pagamentos/[tipo]/planilha">) {
  const { tipo } = await ctx.params;
  const kind = tipo === "cpf" ? "CPF" : tipo === "cnpj" ? "CNPJ" : null;
  if (!kind) return new Response("Não encontrado.", { status: 404 });
  const actor = await currentActor();
  if (!actor) return new Response("Entre para baixar.", { status: 401 });
  const { brand } = await staffContext(actor);
  if (!brand) return new Response("Nenhuma marca.", { status: 404 });
  const q = new URL(req.url).searchParams;
  const tab = (["aprovar", "realizar", "realizados"].includes(q.get("aba") ?? "") ? q.get("aba") : "realizar") as PayTab;
  try {
    const data = await payMonthBoard(db(), scopedActor(actor, brand.id), brand.id, kind, tab, q.get("mes") ?? undefined);
    const ids = new Set((q.get("ids") ?? "").split(",").filter(Boolean));
    const rows = ids.size ? data.rows.filter((r) => r.withdrawalId && ids.has(r.withdrawalId)) : data.rows;
    return new Response(payRowsCsv(rows, brand.name, data.month), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pagamentos-${tipo}-${tab}-${brand.slug}-${data.month}-${dayKey(new Date())}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PayFlowError) return new Response(error.message, { status: 403 });
    throw error;
  }
}
