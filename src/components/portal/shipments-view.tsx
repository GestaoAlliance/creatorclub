import { Check, ExternalLink, Package, Truck } from "lucide-react";
import { SHIPMENT_STATUS_LABEL, trackingUrl, type myShipments } from "@/lib/shipments/shipments";
import type { Address } from "@/lib/shipments/address";
import { AddressCard } from "./address-card";
import { CopyButton } from "./copy-button";
import { ReceivedButton } from "./received-button";

type Shipment = Awaited<ReturnType<typeof myShipments>>[number];

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

const STATUS_STYLE = {
  PREPARING: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  SHIPPED: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  DELIVERED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  CANCELLED: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
} as const;

function Steps({ s }: { s: Shipment }) {
  const steps = [
    { label: "Preparando", at: s.createdAt },
    { label: "Enviado", at: s.shippedAt },
    { label: "Entregue", at: s.deliveredAt },
  ];
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((st, i) => (
        <li key={st.label} className="flex flex-col gap-1.5">
          <span className={`h-1.5 rounded-full ${st.at ? "bg-brand dark:bg-brand-2" : "bg-stone-300/70 dark:bg-white/10"}`} />
          <span className={`text-xs ${st.at ? "font-medium" : "text-stone-500"}`}>
            {i === 2 && st.at && <Check className="mr-1 inline size-3" />}
            {st.label}
            {st.at && <span className="block text-[11px] font-normal text-stone-500">{day(st.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Aba Envios (E7.8): endereço e os produtos que a equipe mandou, com rastreio e "Recebi". */
export function ShipmentsView({ marca, address, shipments, viewOnly }: { marca: string; address: Address | null; shipments: Shipment[]; viewOnly: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <AddressCard marca={marca} address={address} viewOnly={viewOnly} />
      <section className="glass rounded-3xl p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Package className="size-4" /> Meus envios</h2>
        {shipments.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">Nenhum envio ainda. Quando a equipe mandar produtos para você, eles aparecem aqui.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {shipments.map((s) => {
              const url = trackingUrl(s.carrier, s.trackingCode);
              return (
                <li key={s.id} className="flex flex-col gap-4 rounded-2xl bg-white/50 p-4 dark:bg-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-stone-500">Registrado em {day(s.createdAt)}</p>
                      <ul className="mt-1 text-sm">
                        {s.items.map((it) => (
                          <li key={it.title}><span className="tabular-nums font-semibold">{it.quantity}×</span> {it.title}</li>
                        ))}
                      </ul>
                      {s.note && <p className="mt-1 text-xs text-stone-500">{s.note}</p>}
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{SHIPMENT_STATUS_LABEL[s.status]}</span>
                  </div>
                  {s.status !== "CANCELLED" && <Steps s={s} />}
                  {s.trackingCode && s.status !== "CANCELLED" && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 dark:bg-white/5">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs text-stone-500"><Truck className="size-3.5" /> {s.carrier ?? "Rastreio"}</p>
                        <p className="font-mono text-sm font-semibold">{s.trackingCode}</p>
                      </div>
                      <div className="flex gap-2">
                        <CopyButton value={s.trackingCode} label="Copiar" />
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold">
                            Rastrear <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {s.status === "SHIPPED" && !viewOnly && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-stone-500">Chegou? Confirme para a equipe saber.</p>
                      <ReceivedButton marca={marca} shipmentId={s.id} />
                    </div>
                  )}
                  {s.status === "DELIVERED" && (
                    <p className="text-xs text-stone-500">{s.deliveredBy === "CREATOR" ? "Você confirmou o recebimento." : "Entrega confirmada pela equipe."}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
