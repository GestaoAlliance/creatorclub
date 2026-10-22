import { dayKey, payoutCsv } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { withdrawalQueue } from "@/lib/withdrawals/decide";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const SEAL = { OK: "conferida", MANUAL: "a conferir" } as const;

// Planilha dos saques aprovados para o Pix em lote (M1.5, D-WDBATCH): só quem paga, na marca escolhida no topo.
export async function GET() {
  const actor = await currentActor();
  if (!actor) return new Response("Entre para baixar.", { status: 401 });
  const ctx = await staffContext(actor);
  const inBrand = scopedActor(actor, ctx.brand?.id);
  const pays = brandsWith(inBrand.grants, "withdrawals.manage");
  if (pays !== "ALL" && pays.length === 0) return new Response("Sem permissão.", { status: 403 });
  const rows = (await withdrawalQueue(db(), inBrand, "APPROVED")).filter((r) => r.canPay);
  const brands = new Map((await db().brand.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.brandId))] } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  const csv = payoutCsv(
    rows.map((r) => ({
      brand: brands.get(r.brandId) ?? "",
      name: r.name,
      document: r.document,
      pixKey: r.pixKey,
      amountCents: r.amountCents,
      requestedDay: day(r.requestedAt),
      approvedDay: r.approvedAt ? day(r.approvedAt) : null,
      seal: r.individual ? "recibo (pessoa física)" : r.nfCheck ? SEAL[r.nfCheck] : "sem conferência",
      id: r.id,
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="saques-aprovados-${ctx.brand?.slug ?? "todas"}-${dayKey(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
