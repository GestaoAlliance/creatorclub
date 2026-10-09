import Link from "next/link";
import { formatAddress, type Address } from "@/lib/shipments/address";
import { SHIPMENT_STATUS_LABEL, trackingUrl, type staffShipments } from "@/lib/shipments/shipments";
import { CancelForm, DeliveredForm, ShippedForm } from "./forms";

type Row = Omit<Awaited<ReturnType<typeof staffShipments>>[number], "address"> & { canManage: boolean; address: Address | null };

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Lista de envios da equipe. O endereço só aparece para quem tem `personal.address` na marca. */
export function ShipmentsTable({ shipments }: { shipments: Row[] }) {
  return (
    <>
      {shipments.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhum envio.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left">
              <th className="py-2 pr-3">Creator</th>
              <th className="py-2 pr-3">Produtos</th>
              <th className="py-2 pr-3">Endereço</th>
              <th className="py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => {
              const url = trackingUrl(s.carrier, s.trackingCode);
              return (
                <tr key={s.id} className="border-b border-stone-100 align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/creators/${s.creator.id}`} className="underline">{s.creator.account.name}</Link>
                    <div className="text-xs text-stone-500">registrado em {day(s.createdAt)}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {s.items.map((it) => <div key={it.title}>{it.quantity}× {it.title}</div>)}
                    {s.note && <div className="text-xs text-stone-500">{s.note}</div>}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {s.address
                      ? formatAddress(s.address).map((l) => <div key={l}>{l}</div>)
                      : <span className="text-stone-500">—</span>}
                  </td>
                  <td className="flex flex-col gap-1 py-2">
                    <span className="font-semibold">{SHIPMENT_STATUS_LABEL[s.status]}</span>
                    {s.trackingCode && (
                      <span className="text-xs">
                        {s.carrier}: {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono underline">{s.trackingCode}</a> : <span className="font-mono">{s.trackingCode}</span>}
                        {s.shippedAt && ` · enviado em ${day(s.shippedAt)}`}
                      </span>
                    )}
                    {s.deliveredAt && <span className="text-xs">entregue em {day(s.deliveredAt)} ({s.deliveredBy === "CREATOR" ? "confirmado pela creator" : "pela equipe"})</span>}
                    {s.cancelledAt && <span className="text-xs">cancelado em {day(s.cancelledAt)}</span>}
                    {s.canManage && s.status === "PREPARING" && <ShippedForm shipmentId={s.id} />}
                    {s.canManage && s.status === "SHIPPED" && <DeliveredForm shipmentId={s.id} />}
                    {s.canManage && (s.status === "PREPARING" || s.status === "SHIPPED") && <CancelForm shipmentId={s.id} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
