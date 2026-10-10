import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { badge, ui } from "@/components/ui/styles";
import { formatAddress, type Address } from "@/lib/shipments/address";
import { SHIPMENT_STATUS_LABEL, trackingUrl, type staffShipments } from "@/lib/shipments/shipments";
import { CancelForm, DeliveredForm, ShippedForm } from "./forms";

type Row = Omit<Awaited<ReturnType<typeof staffShipments>>[number], "address"> & { canManage: boolean; address: Address | null };

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const STATUS_BADGE = { PREPARING: badge.amber, SHIPPED: badge.sky, DELIVERED: badge.green, CANCELLED: badge.neutral } as const;

/** Envios da equipe, um cartão por envio. O endereço só aparece para quem tem `personal.address` na marca. */
export function ShipmentsTable({ shipments }: { shipments: Row[] }) {
  if (shipments.length === 0) return <p className={ui.muted}>Nenhum envio.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {shipments.map((s) => {
        const url = trackingUrl(s.carrier, s.trackingCode);
        return (
          <article key={s.id} className={ui.card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/admin/creators/${s.creator.id}`} className="font-semibold hover:underline">{s.creator.account.name}</Link>
                <p className={ui.hint}>registrado em {day(s.createdAt)}</p>
              </div>
              <span className={STATUS_BADGE[s.status]}>{SHIPMENT_STATUS_LABEL[s.status]}</span>
            </div>
            <ul className="text-sm">
              {s.items.map((it) => <li key={it.title}><span className="font-semibold tabular-nums">{it.quantity}×</span> {it.title}</li>)}
            </ul>
            {s.note && <p className={ui.hint}>{s.note}</p>}
            {s.address && (
              <div className={`${ui.inset} flex gap-2 text-xs`}>
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-stone-500" />
                <div>{formatAddress(s.address).map((l) => <div key={l}>{l}</div>)}</div>
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
                {s.cancelledAt && <span>cancelado em {day(s.cancelledAt)}</span>}
              </div>
            )}
            {s.canManage && (s.status === "PREPARING" || s.status === "SHIPPED") && (
              <div className="flex flex-col gap-2 border-t border-stone-200/70 pt-4 dark:border-white/10">
                {s.status === "PREPARING" && <ShippedForm shipmentId={s.id} />}
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
