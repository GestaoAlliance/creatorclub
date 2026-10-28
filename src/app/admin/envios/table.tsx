import { ExternalLink, IdCard, MapPin } from "lucide-react";
import Link from "next/link";
import { HelpTip } from "@/components/ui/tour";
import { badge, ui } from "@/components/ui/styles";
import { formatAddress, type ShipmentAddress } from "@/lib/shipments/address";
import { SHIPMENT_STATUS_LABEL, trackingUrl, type staffShipments } from "@/lib/shipments/shipments";
import { ApprovalForms, CancelForm, DeliveredForm, ShippedForm } from "./forms";

type Base = Awaited<ReturnType<typeof staffShipments>>[number];
type Recipient = { cpf: string | null; cnpj: string | null; phone: string | null; email: string };
type Row = Omit<Base, "address" | "creator"> & {
  creator: { id: string; account: { name: string; allergies: string | null } };
  canManage: boolean;
  canApprove: boolean;
  address: ShipmentAddress | null;
  recipient: Recipient | null;
};

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const STATUS_BADGE = { AWAITING_APPROVAL: badge.red, PREPARING: badge.amber, SHIPPED: badge.sky, DELIVERED: badge.green, CANCELLED: badge.neutral } as const;

/** Envios da equipe, um cartão por envio. Endereço e dados do destinatário só para quem tem `personal.address` na marca. */
export function ShipmentsTable({ shipments }: { shipments: Row[] }) {
  if (shipments.length === 0) return <p className={ui.muted}>Nenhum envio.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {shipments.map((s, i) => {
        const url = trackingUrl(s.carrier, s.trackingCode);
        return (
          <article key={s.id} data-tour="en-cartao" className={ui.card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/admin/creators/${s.creator.id}`} className="font-semibold hover:underline">{s.creator.account.name}</Link>
                <p className={ui.hint}>registrado em {day(s.createdAt)}</p>
                {s.creator.account.allergies && (
                  <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">Alergias/restrições: {s.creator.account.allergies}</p>
                )}
              </div>
              <span className="flex items-center gap-1">
                <span className={STATUS_BADGE[s.status]}>{SHIPMENT_STATUS_LABEL[s.status]}</span>
                {i === 0 && <HelpTip id="en-cartao" className="-my-1" />}
              </span>
            </div>
            <ul className="text-sm">
              {s.items.map((it) => <li key={it.title}><span className="font-semibold tabular-nums">{it.quantity}×</span> {it.title}</li>)}
            </ul>
            {s.note && <p className={ui.hint}>{s.note}</p>}
            {(s.address || s.recipient) && (
              <div className={`${ui.inset} flex flex-col gap-2 text-xs`}>
                {s.recipient && (
                  <div className="flex gap-2">
                    <IdCard className="mt-0.5 size-3.5 shrink-0 text-stone-500" />
                    <div>
                      <div>
                        {s.recipient.cpf ? <>CPF <span className="font-mono">{s.recipient.cpf}</span></> : "CPF não informado"}
                        {s.recipient.cnpj && <> · CNPJ <span className="font-mono">{s.recipient.cnpj}</span></>}
                      </div>
                      <div>{[s.recipient.phone, s.recipient.email].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                )}
                {s.address && (
                  <div className="flex gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-stone-500" />
                    <div>{formatAddress(s.address).map((l) => <div key={l}>{l}</div>)}</div>
                  </div>
                )}
              </div>
            )}
            {(s.trackingCode || s.deliveredAt || s.cancelledAt) && (
              <div className="flex flex-col gap-0.5 text-xs text-stone-600 dark:text-stone-400">
                {s.trackingCode && (
                  <span>
                    {s.carrier}:{" "}
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className={`${ui.link} inline-flex items-center gap-1 font-mono`}>
                        {s.trackingCode} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="font-mono">{s.trackingCode}</span>
                    )}
                    {s.shippedAt && ` · enviado em ${day(s.shippedAt)}`}
                  </span>
                )}
                {s.deliveredAt && <span>entregue em {day(s.deliveredAt)} ({s.deliveredBy === "CREATOR" ? "confirmado pela creator" : "pela equipe"})</span>}
                {s.cancelledAt && <span>{s.rejectReason ? `recusado em ${day(s.cancelledAt)}: ${s.rejectReason}` : `cancelado em ${day(s.cancelledAt)}`}</span>}
              </div>
            )}
            {s.status === "AWAITING_APPROVAL" && (
              <div className="flex flex-col gap-2 border-t border-stone-200/70 pt-4 dark:border-white/10">
                {s.canApprove ? (
                  <div data-tour="en-aprovar" className="flex items-start justify-between gap-2">
                    <ApprovalForms shipmentId={s.id} />
                    <HelpTip id="en-aprovar" />
                  </div>
                ) : (
                  <p className={ui.hint}>Pedido da creator esperando a aprovação da Gestão.</p>
                )}
              </div>
            )}
            {s.approvedAt && <p className={ui.hint}>Pedido da creator aprovado em {day(s.approvedAt)}.</p>}
            {s.canManage && (s.status === "PREPARING" || s.status === "SHIPPED") && (
              <div className="flex flex-col gap-2 border-t border-stone-200/70 pt-4 dark:border-white/10">
                {s.status === "PREPARING" && (
                  <div data-tour="en-enviado" className="flex items-start justify-between gap-2">
                    <ShippedForm shipmentId={s.id} />
                    <HelpTip id="en-enviado" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {s.status === "SHIPPED" && <DeliveredForm shipmentId={s.id} />}
                  <CancelForm shipmentId={s.id} />
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
