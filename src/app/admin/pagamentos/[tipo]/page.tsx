import { notFound, redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { payMonthBoard, type PayKind } from "@/lib/payouts/month-board";
import { payCheckBoard } from "@/lib/payouts/check";
import { buildQueue, QUEUE_STAGES, queueCounts, type QueueStage } from "@/lib/payouts/queue";
import { remessaPreview } from "@/lib/withdrawals/remessa";
import { aleloCardStatus } from "@/lib/withdrawals/alelo";
import { calendarToday, dayKey } from "@/domain";
import { staffPeriod } from "@/lib/staff/period";
import { AleloCardBox } from "../../saques/alelo-card";
import { RemessaBar, RetornoForm } from "../../saques/forms";
import { PayQueue, type Filter } from "./queue";

export const dynamic = "force-dynamic";

const KIND: Record<string, PayKind> = { cnpj: "CNPJ", cpf: "CPF" };
// Endereços de antes da fila (D-PAYFLOW) continuam abrindo na etapa certa.
const OLD: Record<string, QueueStage> = { conferir: "conferir", aprovar: "aprovar", realizar: "pagar", realizados: "pago" };

/**
 * D-PAYQUEUE: Pagamentos CNPJ e CPF numa fila só (conferir → esperando o pedido → aprovar → pagar → pago), cada
 * creator com a próxima ação. Calendário, Mês a mês e remessas antigas ficam em Relatórios.
 */
export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ etapa?: string; aba?: string; p?: string; periodo?: string; de?: string; ate?: string }> }) {
  const { tipo } = await params;
  const kind = KIND[tipo];
  if (!kind) notFound();
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/pagamentos/${tipo}`);
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  if (!can(actor.grants, "withdrawals.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const asked = sp.etapa ?? (sp.aba ? OLD[sp.aba] : undefined);
  const filter: Filter = QUEUE_STAGES.includes(asked as QueueStage) ? (asked as QueueStage) : "abertos";
  const tz = (await db().brand.findUniqueOrThrow({ where: { id: brand.id }, select: { timezone: true } })).timezone;
  // D-PERIODPICK: o período só vale para os Pix que saíram (etapa Pagos); padrão: o mês corrente.
  const period = await staffPeriod(sp, tz);
  const inBrand = scopedActor(actor, brand.id);
  const [check, aprovar, pagar, pagos] = await Promise.all([
    payCheckBoard(db(), inBrand, brand.id, kind),
    payMonthBoard(db(), inBrand, brand.id, kind, "aprovar", period),
    payMonthBoard(db(), inBrand, brand.id, kind, "realizar", period),
    payMonthBoard(db(), inBrand, brand.id, kind, "realizados", period),
  ]);
  const items = buildQueue({ check: check.rows, aprovar: aprovar.rows, pagar: pagar.rows, pagos: pagos.rows });
  const manage = can(actor.grants, "withdrawals.manage", brand.id);
  const today = dayKey(new Date(), tz);
  const showBank = manage && filter === "pagar";
  const remessa = showBank ? await remessaPreview(db(), actor, brand.id, today) : null;
  const alelo = kind === "CPF" && showBank ? await aleloCardStatus(db(), actor, brand.id) : null;
  const t = calendarToday(aprovar.calendar.days, aprovar.calendar.today);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <PayQueue
        brandName={brand.name} kind={kind} tipo={tipo} items={items} counts={queueCounts(items)} filter={filter} month={check.month}
        today={{ day: aprovar.calendar.today, now: t.now, next: t.next }} windowEnd={aprovar.window.end}
        period={{ key: period.key ?? "", label: period.label ?? "", today }}
        can={{ check: can(actor.grants, "withdrawals.approve", brand.id), message: can(actor.grants, "creators.edit", brand.id), pay: manage }}
      />
      {/* Sempre montado na etapa Pagar: o arquivo chega depois que a lista já zerou (D-REMESSAFILE). */}
      {remessa && <RemessaBar brandId={brand.id} count={remessa.count} cnpj={remessa.cnpj} cpf={remessa.cpf} cents={remessa.totalCents} today={today} problems={remessa.problems} warnings={remessa.warnings} />}
      {remessa && <RetornoForm brandId={brand.id} />}
      {alelo && <AleloCardBox ready={alelo.ready.length} incomplete={alelo.incomplete} />}
    </GlassLight>
  );
}
