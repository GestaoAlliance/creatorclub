import { notFound, redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { payMonthBoard, type PayKind, type PayTab } from "@/lib/payouts/month-board";
import { recentRemessas, remessaPreview } from "@/lib/withdrawals/remessa";
import { aleloCardStatus } from "@/lib/withdrawals/alelo";
import { dayKey } from "@/domain";
import { AleloCardBox } from "../../saques/alelo-card";
import { RemessaBar, RemessaHistory, RetornoForm } from "../../saques/forms";
import { MonthlyBoard } from "@/components/staff/monthly-board";
import { staffPeriod } from "@/lib/staff/period";
import { monthlyRange, payMonthly } from "@/lib/payouts/monthly";
import { PayBoard } from "./board";

export const dynamic = "force-dynamic";

const KIND: Record<string, PayKind> = { cnpj: "CNPJ", cpf: "CPF" };
const TABS: PayTab[] = ["aprovar", "realizar", "realizados"];

// Pagamentos CNPJ e CPF (D-PAYFLOW): NF para aprovar → Saques a realizar → Saques realizados, filas em aberto e Pix pelo período (D-PERIODPICK).
export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ aba?: string; p?: string; periodo?: string; de?: string; ate?: string }> }) {
  const { tipo } = await params;
  const kind = KIND[tipo];
  if (!kind) notFound();
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/pagamentos/${tipo}`);
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "withdrawals.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const aba = sp.aba;
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  // D-PERIODPICK: o período escolhido (o mesmo das outras abas) vale para os Pix que saíram e o Mês a mês.
  const period = await staffPeriod(sp, tz);
  const tab: PayTab = TABS.includes(aba as PayTab) ? (aba as PayTab) : "aprovar";
  const inBrand = scopedActor(actor, brand.id);
  const [data, monthly] = await Promise.all([
    payMonthBoard(db(), inBrand, brand.id, kind, tab, period),
    payMonthly(db(), inBrand, brand.id, kind, monthlyRange(period)),
  ]);
  const manage = can(actor.grants, "withdrawals.manage", brand.id);
  const today = dayKey(new Date(), tz);
  const remessa = tab === "realizar" && manage ? await remessaPreview(db(), actor, brand.id, today) : null;
  const remessas = tab === "realizar" && manage ? await recentRemessas(db(), actor, brand.id) : [];
  const alelo = kind === "CPF" && manage ? await aleloCardStatus(db(), actor, brand.id) : null;
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PayBoard brandName={brand.name} kind={kind} tipo={tipo} tab={tab} data={data} canMessage={can(actor.grants, "creators.edit", brand.id)} canPay={manage} canEditCalendar={brandsWith(actor.grants, "staff.manage") === "ALL"}
        periodKey={period.key ?? ""} periodLabel={period.label ?? ""} today={today}
        monthly={monthly && <MonthlyBoard data={monthly} path={`/admin/pagamentos/${tipo}`} selected={period.key?.startsWith("m:") ? period.key.slice(2) : null} title={`Mês a mês · ${kind}`} />} />
      {/* Sempre montado: o arquivo chega depois que a lista já zerou (D-REMESSAFILE). */}
      {remessa && <RemessaBar brandId={brand.id} count={remessa.count} cnpj={remessa.cnpj} cpf={remessa.cpf} cents={remessa.totalCents} today={today} problems={remessa.problems} warnings={remessa.warnings} />}
      {remessa && <RetornoForm brandId={brand.id} />}
      {remessa && <RemessaHistory items={remessas} />}
      {alelo && <AleloCardBox ready={alelo.ready.length} incomplete={alelo.incomplete} />}
    </GlassLight>
  );
}
