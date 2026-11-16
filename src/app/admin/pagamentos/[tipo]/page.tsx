import { notFound, redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { payMonthBoard, type PayKind, type PayTab } from "@/lib/payouts/month-board";
import { remessaPreview } from "@/lib/withdrawals/remessa";
import { aleloCardStatus } from "@/lib/withdrawals/alelo";
import { dayKey } from "@/domain";
import { AleloCardBox } from "../../saques/alelo-card";
import { RemessaBar, RetornoForm } from "../../saques/forms";
import { PayBoard } from "./board";

export const dynamic = "force-dynamic";

const KIND: Record<string, PayKind> = { cnpj: "CNPJ", cpf: "CPF" };
const TABS: PayTab[] = ["aprovar", "realizar", "realizados"];

// Pagamentos CNPJ e CPF (D-PAYFLOW): NF para aprovar → Saques a realizar → Saques realizados, pelo mês da comissão.
export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const { tipo } = await params;
  const kind = KIND[tipo];
  if (!kind) notFound();
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/pagamentos/${tipo}`);
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "withdrawals.view", brand.id)) redirect("/conta");
  const { aba, mes } = await searchParams;
  const tab: PayTab = TABS.includes(aba as PayTab) ? (aba as PayTab) : "aprovar";
  const inBrand = scopedActor(actor, brand.id);
  const data = await payMonthBoard(db(), inBrand, brand.id, kind, tab, mes);
  const manage = can(actor.grants, "withdrawals.manage", brand.id);
  const today = dayKey(new Date(), "America/Sao_Paulo");
  const remessa = tab === "realizar" && manage ? await remessaPreview(db(), actor, brand.id, today) : null;
  const alelo = kind === "CPF" && manage ? await aleloCardStatus(db(), actor, brand.id) : null;
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PayBoard brandName={brand.name} kind={kind} tipo={tipo} tab={tab} data={data} canMessage={can(actor.grants, "creators.edit", brand.id)} canPay={manage} canEditCalendar={brandsWith(actor.grants, "staff.manage") === "ALL"} />
      {remessa && remessa.count > 0 && <RemessaBar brandId={brand.id} count={remessa.count} cents={remessa.totalCents} today={today} problems={remessa.problems} />}
      {remessa && <RetornoForm brandId={brand.id} />}
      {alelo && <AleloCardBox ready={alelo.ready.length} incomplete={alelo.incomplete} />}
    </GlassLight>
  );
}
