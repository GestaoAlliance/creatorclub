import { ArrowLeft, FileSpreadsheet, Scale } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { Card, PageHeader } from "@/components/ui/page";
import { PayCalendar } from "@/components/ui/pay-calendar";
import { ui } from "@/components/ui/styles";
import { MonthlyBoard } from "@/components/staff/monthly-board";
import { PeriodPicker } from "@/components/staff/period-picker";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { calendarOf } from "@/lib/brands/calendar";
import { db } from "@/lib/db";
import { monthlyRange, payMonthly } from "@/lib/payouts/monthly";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { staffPeriod } from "@/lib/staff/period";
import { recentRemessas } from "@/lib/withdrawals/remessa";
import { dayKey, monthKey } from "@/domain";
import { RemessaHistory } from "../../saques/forms";

export const dynamic = "force-dynamic";

/**
 * D-PAYQUEUE: o que saiu da tela principal de Pagamentos, para consultar: calendário do mês, Mês a mês (CNPJ e CPF),
 * remessas já geradas (baixar de novo), saldo de abertura e conferência da planilha.
 */
export default async function PayReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; periodo?: string; de?: string; ate?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/pagamentos/relatorios");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "withdrawals.view", brand.id)) redirect("/conta");
  const b = await db().brand.findUniqueOrThrow({
    where: { id: brand.id },
    select: { timezone: true, withdrawalWindowStartDay: true, withdrawalWindowEndDay: true, withdrawalPayFromDay: true, withdrawalPayByDay: true, windowExtensionMonth: true, windowNormalEndDay: true },
  });
  const now = new Date();
  const period = await staffPeriod(await searchParams, b.timezone);
  const inBrand = scopedActor(actor, brand.id);
  const months = monthlyRange(period);
  const manage = can(actor.grants, "withdrawals.manage", brand.id);
  const [cnpj, cpf, remessas] = await Promise.all([
    payMonthly(db(), inBrand, brand.id, "CNPJ", months),
    payMonthly(db(), inBrand, brand.id, "CPF", months),
    manage ? recentRemessas(db(), actor, brand.id, 12) : Promise.resolve([]),
  ]);
  const cal = calendarOf(b, now);
  const today = dayKey(now, b.timezone);
  const selected = period.key?.startsWith("m:") ? period.key.slice(2) : null;
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PageHeader title="Relatórios de pagamentos" actions={<Link href="/admin/pagamentos/cnpj" className={ui.ghostSm}><ArrowLeft className="size-3.5" />Voltar para Pagamentos</Link>}>
        Para consultar. O trabalho do dia a dia fica em Pagamentos CNPJ e CPF.
      </PageHeader>

      <Card title={`Calendário do mês${cal.extended ? ` · pedido estendido até o dia ${cal.days.end}` : ""}`}>
        <div className="@container">
          <PayCalendar month={monthKey(now, b.timezone)} days={cal.days} normalEnd={cal.normalEnd} today={Number(today.slice(8, 10))} />
        </div>
        {brandsWith(actor.grants, "staff.manage") === "ALL" && <Link href="/admin/marcas" className="mt-3 inline-block text-xs text-stone-500 underline">Mudar as datas (Configurações → Marcas)</Link>}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Mês a mês</h2>
        <PeriodPicker value={period.key ?? ""} today={today} />
      </div>
      {cnpj && <MonthlyBoard data={cnpj} path="/admin/pagamentos/relatorios" selected={selected} title="Mês a mês · CNPJ (nota fiscal)" />}
      {cpf && <MonthlyBoard data={cpf} path="/admin/pagamentos/relatorios" selected={selected} title="Mês a mês · CPF (recibo)" />}

      {manage && <RemessaHistory items={remessas} />}

      {manage && (
        <Card title="Consultas de antes do Creator Club">
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/abertura" className={ui.ghostSm}><Scale className="size-3.5" />Saldo de abertura</Link>
            <Link href="/admin/saques/conferencia" className={ui.ghostSm}><FileSpreadsheet className="size-3.5" />Conferência da planilha</Link>
          </div>
        </Card>
      )}
    </GlassLight>
  );
}
