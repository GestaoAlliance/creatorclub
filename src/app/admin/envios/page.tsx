import { Download } from "lucide-react";
import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { formatDoc } from "@/domain";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { productImages } from "@/lib/reports/product-images";
import { formatAddress, type ShipmentAddress } from "@/lib/shipments/address";
import { shipmentBoard } from "@/lib/shipments/board";
import { firstKitAudience, firstKitPreview } from "@/lib/shipments/first-kit-notice";
import { kitReminderAudience, kitReminderPreview } from "@/lib/shipments/kit-reminder";
import { RECEIPT_CHECK_DAYS } from "@/lib/shipments/reminders";
import { SHIPMENT_STATUS_LABEL, shipmentFormData, staffShipments, trackingUrl, type ShipmentStatusValue } from "@/lib/shipments/shipments";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { ShipExtras, ShipHero, ShipQueue, type ShipRow } from "./board";
import { FirstKitNotice, KitReminder, NewShipmentForm } from "./forms";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatusValue[];
const KIT_LABEL: Record<string, string> = { WELCOME: "kit de boas-vindas", MONTHLY: "kit do mês", GOAL: "kit da meta" };

// Envios de produtos às creators (E7.8): Envio, Gestão e super admin. Visual D-SHIPBOARD.
export default async function EnviosPage({ searchParams }: { searchParams: Promise<{ situacao?: string; parado?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/envios");
  const view = brandsWith(actor.grants, "shipping.view");
  if (view !== "ALL" && view.length === 0) redirect("/conta");
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const inBrand = scopedActor(actor, brand.id);
  const { situacao, parado } = await searchParams;
  // D-TRACKING: "Sem Recebi há 10+ dias" (enviados, possível extravio).
  const stale = parado === "1";
  const now = new Date();
  const staleBefore = new Date(now.getTime() - RECEIPT_CHECK_DAYS * 86_400_000);
  // Sem escolher: abre no que tem trabalho (aguardando, depois preparando).
  const counts0 = await db().shipment.groupBy({ by: ["status"], where: { brandId: brand.id, status: { in: ["AWAITING_APPROVAL", "PREPARING"] } }, _count: true });
  const fallback: ShipmentStatusValue | undefined = counts0.some((c) => c.status === "AWAITING_APPROVAL") ? "AWAITING_APPROVAL" : counts0.some((c) => c.status === "PREPARING") ? "PREPARING" : undefined;
  const status = stale ? undefined : (STATUSES.find((s) => s === situacao) ?? (situacao === undefined ? fallback : undefined));
  const canManage = can(actor.grants, "shipping.manage", brand.id);
  const [shipments, staleList, form, imageOf] = await Promise.all([
    staffShipments(db(), inBrand, stale ? { staleBefore } : status ? { status } : {}),
    staffShipments(db(), inBrand, { staleBefore }),
    canManage ? shipmentFormData(db(), inBrand) : null,
    productImages(db(), brand.id),
  ]);
  const board = await shipmentBoard(db(), actor, brand.id, shipments.map((s) => s.creator.id), now);
  // D-FIRSTKITNOTICE: aviso do 1º produto, pronto e esperando o clique do super admin.
  const firstKit = brandsWith(actor.grants, "staff.manage") === "ALL" ? await firstKitAudience(db(), brand.id) : null;
  // D-KITREMINDER: lembrete dos produtos parados, para a Gestão da marca.
  const kitReminder = can(actor.grants, "creators.edit", brand.id) ? await kitReminderAudience(db(), brand.id) : null;
  const canPrint = can(actor.grants, "shipping.view", brand.id) && can(actor.grants, "personal.address", brand.id);
  const personal = can(actor.grants, "personal.address", brand.id);

  const rows: ShipRow[] = shipments.map((s) => {
    const { cpf, cnpj, phone, email, name, allergies } = s.creator.account;
    const address = personal ? (s.address as ShipmentAddress) : null;
    return {
      id: s.id,
      status: s.status,
      note: s.note,
      carrier: s.carrier,
      trackingCode: s.trackingCode,
      trackingUrl: trackingUrl(s.carrier, s.trackingCode),
      createdAt: s.createdAt,
      approvedAt: s.approvedAt,
      olistSentAt: s.olistSentAt,
      shippedAt: s.shippedAt,
      deliveredAt: s.deliveredAt,
      deliveredBy: s.deliveredBy,
      cancelledAt: s.cancelledAt,
      rejectReason: s.rejectReason,
      olistOrderNumber: s.olistOrderNumber,
      olistError: s.olistError,
      freightCents: canManage ? s.freightCents : null,
      kitLabel: s.balanceCents !== null ? "compra com o saldo" : s.kit ? (KIT_LABEL[s.kit.kind] ?? "kit") : null,
      items: s.items.map((it) => ({ ...it, image: imageOf(it.title) })),
      creator: { id: s.creator.id, name, allergies },
      address,
      addressLines: address && ("raw" in address || address.zip) ? formatAddress(address) : [],
      // D-SHIPRECIPIENT: quem vê o endereço (Envio, Gestão) vê também os dados do destinatário.
      recipient: personal ? { cpf: cpf ? formatDoc(cpf) : null, cnpj: cnpj ? formatDoc(cnpj) : null, phone, email } : null,
      canManage,
      canApprove: can(actor.grants, "creators.edit", brand.id),
      context: board.context.get(s.creator.id) ?? null,
    };
  });
  // Nas etapas de trabalho, o mais antigo primeiro (fila); nas outras, o mais recente.
  if (status === "AWAITING_APPROVAL" || status === "PREPARING") rows.reverse();
  const current = stale ? "parado" : (status ?? "");

  return (
    <GlassLight className="dash flex flex-col gap-4">
      <ShipHero
        brandName={brand.name}
        current={current}
        counts={board.counts}
        canCreate={Boolean(form)}
        canPrintAll={canPrint}
        newForm={form ? <NewShipmentForm creators={form.creators} products={form.products} /> : null}
      />
      {firstKit && firstKit.grantIds.length > 0 && <FirstKitNotice count={firstKit.grantIds.length} names={firstKit.names} text={firstKitPreview(firstKit.brand)} hasWhatsApp={Boolean(firstKit.brand.whatsappInstance)} />}
      {kitReminder && kitReminder.grantIds.length > 0 && <KitReminder count={kitReminder.grantIds.length} names={kitReminder.names} text={kitReminderPreview(kitReminder.brand)} hasWhatsApp={Boolean(kitReminder.brand.whatsappInstance)} />}
      <nav aria-label="Outras situações" className="flex flex-wrap items-center gap-1.5 text-sm">
        <a href="/admin/envios?situacao=" className={`rounded-full px-3 py-1.5 ${current === "" ? "bg-brand font-semibold text-white dark:bg-brand-2 dark:text-stone-900" : "bg-stone-500/10 hover:bg-stone-500/20"}`}>Todos</a>
        {(["DELIVERED", "CANCELLED"] as const).map((s) => (
          <a key={s} href={`/admin/envios?situacao=${s}`} className={`rounded-full px-3 py-1.5 ${current === s ? "bg-brand font-semibold text-white dark:bg-brand-2 dark:text-stone-900" : "bg-stone-500/10 hover:bg-stone-500/20"}`}>{SHIPMENT_STATUS_LABEL[s]}</a>
        ))}
        {/* D-SHIPCSV: planilha dos envios com a situação escolhida e, se quiser, o período (data do pedido). */}
        {canPrint && (
          <form action="/admin/envios/csv" method="get" className="ml-auto flex flex-wrap items-center gap-1.5">
            {status && <input type="hidden" name="situacao" value={status} />}
            <input type="date" name="de" aria-label="Pedidos de" className={ui.inputSm} />
            <input type="date" name="ate" aria-label="até" className={ui.inputSm} />
            <button className={`${ui.ghostSm} inline-flex items-center gap-1.5`}><Download className="size-4" />Planilha ({status ? SHIPMENT_STATUS_LABEL[status] : stale ? "todos" : "todos"})</button>
          </form>
        )}
      </nav>
      <ShipQueue key={current} rows={rows} canPrint={canPrint} emptyText={stale ? "Ninguém sem confirmar há 10+ dias. 🎉" : status ? `Nenhum envio em ${SHIPMENT_STATUS_LABEL[status]}.` : "Nenhum envio."} />
      <ShipExtras
        olistLate={board.olistLate}
        month={board.month}
        stale={staleList.map((s) => ({ id: s.id, creatorId: s.creator.id, name: s.creator.account.name, days: Math.floor((now.getTime() - (s.shippedAt ?? s.createdAt).getTime()) / 86_400_000) }))}
        canMessage={can(actor.grants, "creators.edit", brand.id)}
      />
    </GlassLight>
  );
}
