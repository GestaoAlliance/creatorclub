import { Check, ExternalLink, Gift, History, Package, Truck } from "lucide-react";
import { SHIPMENT_STATUS_LABEL, trackingUrl, type myShipments } from "@/lib/shipments/shipments";
import type { Address } from "@/lib/shipments/address";
import { monthLabel, type KitProgress, type myKitHistory, type myPendingKits } from "@/lib/shipments/kits";
import { AddressCard } from "./address-card";
import { CopyButton } from "./copy-button";
import { KitPicker } from "./kit-picker";
import { KitProgressCard } from "./kit-progress";
import { HelpTip } from "@/components/ui/tour";
import { kitNoun } from "@/domain";
import { ReceivedButton } from "./received-button";

type Shipment = Awaited<ReturnType<typeof myShipments>>[number];
type PendingKits = Awaited<ReturnType<typeof myPendingKits>>;
type KitHistory = Awaited<ReturnType<typeof myKitHistory>>;

const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

const STATUS_STYLE = {
  AWAITING_APPROVAL: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  PREPARING: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  SHIPPED: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  DELIVERED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  CANCELLED: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
} as const;

function Steps({ s }: { s: Shipment }) {
  const steps = [
    { label: "Solicitado", at: s.createdAt },
    { label: "Aprovado", at: s.status === "AWAITING_APPROVAL" ? null : (s.approvedAt ?? s.createdAt) },
    { label: "Enviado", at: s.shippedAt },
    { label: "Entregue", at: s.deliveredAt },
  ];
  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((st, i) => (
        <li key={st.label} className="flex flex-col gap-1.5">
          <span className={`h-1.5 rounded-full ${st.at ? "bg-brand dark:bg-brand-2" : "bg-stone-300/70 dark:bg-white/10"}`} />
          <span className={`text-xs ${st.at ? "font-medium" : "text-stone-500"}`}>
            {i === steps.length - 1 && st.at && <Check className="mr-1 inline size-3" />}
            {st.label}
            {st.at && <span className="block text-[11px] font-normal text-stone-500">{day(st.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** D-SHOPTAB: o que é cada envio (prêmio, compra na loja ou envio da equipe). */
function shipmentTag(s: Shipment): string {
  if (s.balanceCents !== null) return "Loja";
  if (s.kit?.kind === "WELCOME") return "1º pedido";
  if (s.kit) return "Prêmio";
  return "Envio da equipe";
}

const KIT_STATUS: Record<string, string> = { AWAITING_APPROVAL: "pedido em aprovação", PREPARING: "preparando o envio", SHIPPED: "enviado", DELIVERED: "entregue", CANCELLED: "pedido não aprovado" };

function kitTitle(k: { kind: string; month: string; products: number }, brandSlug: string): string {
  const what = `${k.products} ${kitNoun(brandSlug, k.products)}`;
  if (k.kind === "WELCOME") return `1º pedido (boas-vindas): ${what}`;
  if (k.kind === "GOAL") return `Meta de R$ 1.000 batida (fase de ${monthLabel(k.month)}): ${what}`;
  return `Vendas de ${monthLabel(k.month)}: ${what}`;
}

/** Envios (com rastreio e "Recebi"), usados em Pedidos (todos) e na Loja (só as compras). */
export function ShipmentList({ marca, shipments, viewOnly, title = "Meus envios", empty = "Nenhum envio ainda. Quando a equipe mandar produtos para você, eles aparecem aqui." }: { marca: string; shipments: Shipment[]; viewOnly: boolean; title?: string; empty?: string }) {
  return (
    <section data-tour="meus-envios" className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Package className="size-4" /> {title}</h2>
        <HelpTip id="meus-envios" />
      </div>
        {shipments.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {shipments.map((s) => {
              const url = trackingUrl(s.carrier, s.trackingCode);
              return (
                <li key={s.id} className="flex flex-col gap-4 rounded-2xl bg-white/50 p-4 dark:bg-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-stone-500"><span className="mr-1.5 rounded-full bg-stone-500/15 px-2 py-0.5 font-medium text-stone-700 dark:text-stone-300">{shipmentTag(s)}</span>Registrado em {day(s.createdAt)}</p>
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
                  {s.status === "AWAITING_APPROVAL" && <p className="text-xs text-stone-500">Pedido recebido: a equipe vai conferir e aprovar antes do envio.</p>}
                  {s.status === "CANCELLED" && s.rejectReason && (
                    <p className="text-xs text-red-700 dark:text-red-400">Pedido não aprovado: {s.rejectReason} {s.note?.startsWith("Compra com o saldo") ? <>O valor voltou para o seu saldo.</> : !s.note?.startsWith("Pedido da creator") && <>Você pode escolher de novo em &quot;Liberado para você pedir&quot;.</>}</p>
                  )}
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
  );
}

/**
 * Aba Pedidos (E7.8; D-SHOPTAB): os produtos que ela ganha. No topo, o que está liberado para pedir agora; depois o
 * próximo produto (quanto vender), o histórico dos prêmios, o endereço e os envios. A loja com o saldo tem aba própria.
 */
export function ShipmentsView({
  marca,
  address,
  shipments,
  kits,
  history,
  viewOnly,
  informedAddress = null,
  progress = null,
}: {
  marca: string;
  address: Address | null;
  informedAddress?: string | null;
  shipments: Shipment[];
  kits: PendingKits;
  history: KitHistory;
  viewOnly: boolean;
  /** D-KITPROGRESS: como liberar o próximo produto. */
  progress?: KitProgress | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* D-KITAPPROVAL: o pedido só existe com produto liberado; a escolha vai para a aprovação da equipe e depois para o envio. */}
      {kits.kits.length > 0 && (
        <section data-tour="solicitar-pedido" className="glass flex flex-col gap-4 rounded-3xl p-5">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 font-semibold"><Gift className="size-4 text-brand dark:text-brand-2" /> Liberado para você pedir</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">Escolha os produtos e confirme o endereço. A equipe aprova e faz o envio.</p>
          </div>
          {viewOnly && (
            <p className="rounded-2xl border border-amber-400/60 bg-amber-100/70 px-4 py-2.5 text-sm text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
              Visualização da equipe: os botões de escolher produto ficam travados. Só a creator faz o pedido pelo portal dela (para pedir por ela, use &quot;Novo envio&quot; em Envios).
            </p>
          )}
          {kits.kits.map((k) => (
            <KitPicker key={k.id} marca={marca} kit={k} monthLabel={monthLabel(k.month)} welcome={k.kind === "WELCOME"} goal={k.kind === "GOAL"} products={kits.products} address={address} informed={informedAddress} viewOnly={viewOnly} />
          ))}
        </section>
      )}
      {/* D-KITPROGRESS: como liberar o próximo produto. */}
      {progress && <KitProgressCard progress={progress} brandSlug={marca} />}
      {/* D-SHOPTAB: linha do tempo dos produtos que ela ganhou. */}
      {history.length > 0 && (
        <section className="glass flex flex-col gap-3 rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-semibold"><History className="size-4" /> Seus prêmios</h2>
          <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
            {history.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>{kitTitle(k, marca)}<span className="block text-xs text-stone-500">liberado em {day(k.createdAt)}</span></span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${k.status === "PENDING" ? "bg-brand/15 text-brand dark:text-brand-2" : "bg-stone-500/15 text-stone-700 dark:text-stone-300"}`}>
                  {k.status === "PENDING" ? "liberado: escolha acima" : KIT_STATUS[k.shipment?.status ?? ""] ?? "pedido feito"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AddressCard marca={marca} address={address} viewOnly={viewOnly} informed={informedAddress} />
      <ShipmentList marca={marca} shipments={shipments} viewOnly={viewOnly} />
    </div>
  );
}
