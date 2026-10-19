import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { dataReview } from "@/lib/creators/data-review";
import { staffContext } from "@/lib/staff/context";

export const dynamic = "force-dynamic";

// Cadastros a revisar (limpeza de 2026-10-19): nome com dados colados, nome de cupom, possível repetida e criadas pela
// planilha. Só lista; a correção é na ficha (editar o nome ou desligar a repetida).
export default async function DataReviewPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/creators/revisar");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "creators.edit", brand.id)) redirect("/conta");
  const rows = await dataReview(db(), brand.id);

  return (
    <>
      <PageHeader title="Cadastros a revisar">
        {rows.length === 0
          ? `Nada a revisar na ${brand.name}.`
          : `${rows.length} cadastros da ${brand.name} com sinal de erro. Abra a ficha para corrigir o nome ou desligar a repetida (desligar não apaga nada).`}
      </PageHeader>
      <p className={ui.hint}>
        Antes de desligar uma repetida, confira qual tem cupom, pedidos e saldo: essa é a que fica. A outra pode ser desligada.
      </p>
      {rows.length > 0 && (
        <Card title="Para revisar">
          <ul className={ui.list}>
            {rows.map((r) => (
              <li key={r.id} className={ui.row}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/creators/${r.id}`} className="min-w-0 break-words font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.status !== "ACTIVE" && <span className={badge.neutral}>inativa</span>}
                  {r.reasons.map((x) => (
                    <span key={x} className={badge.amber}>{x}</span>
                  ))}
                </div>
                <p className={ui.hint}>
                  {[
                    r.coupons.length ? `cupom ${r.coupons.join(", ")}` : "sem cupom",
                    `${r.orders} ${r.orders === 1 ? "pedido" : "pedidos"}`,
                    r.hasLedger ? "tem extrato" : "sem extrato",
                    r.email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {r.twins.length > 0 && (
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    Parecida com:{" "}
                    {r.twins.map((t, i) => (
                      <span key={t.id}>
                        {i > 0 && ", "}
                        <Link href={`/admin/creators/${t.id}`} className={ui.link}>{t.name}</Link> ({t.why})
                      </span>
                    ))}
                  </p>
                )}
                <div>
                  <Link href={`/admin/creators/${r.id}`} className={ui.ghostSm}>Abrir ficha</Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
