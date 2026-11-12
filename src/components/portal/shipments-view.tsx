import { CalendarClock, Check, ChevronRight, ExternalLink, Gift, Megaphone, Package, Star, Truck } from "lucide-react";
import Link from "next/link";
import { ProductThumb } from "@/components/ui/product-thumb";
import { ReviewForm } from "./review-form";
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


/**
 * Envios (com rastreio e "Recebi"), usados em Pedidos (todos) e na Loja (só as compras). D-PORTALSHIP: compacto como
 * Vendas: os em andamento abertos (linha do tempo, previsão, rastreio, "Recebi"); os antigos numa linha fina que abre ao
 * tocar. Depois de recebido: avaliação (D-SHIPREVIEW) e, nos 14 primeiros dias, a ideia de postar o unboxing.
 */
export function ShipmentList({
  marca,
  shipments,
  viewOnly,
  title = "Meus envios",
  empty = "Nenhum envio ainda. Quando a equipe mandar produtos para você, eles aparecem aqui.",
  etas = {},
  images = {},
  now = Date.now(),
}: {
  marca: string;
  shipments: Shipment[];
  viewOnly: boolean;
  title?: string;
  empty?: string;
  etas?: Record<string, Date>;
  images?: Record<string, string | null>;
  now?: number;
}) {
  const active = (s: Shipment) => s.status === "AWAITING_APPROVAL" || s.status === "PREPARING" || s.status === "SHIPPED";
  return (
    <section data-tour="meus-envios" className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <h2 className="flex items-center gap-2 font-semibold"><Package className="size-4" /> {title}</h2>
        <HelpTip id="meus-envios" />
      </div>
      {shipments.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-sm text-stone-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200/70 border-t border-stone-200/70 dark:divide-white/10 dark:border-white/10">
          {shipments.map((s) => {
            const url = trackingUrl(s.carrier, s.trackingCode);
            const recent = s.status === "DELIVERED" && s.deliveredAt && now - s.deliveredAt.getTime() < 14 * 86_400_000;
            const open = active(s) || (s.status === "DELIVERED" && !s.review && !viewOnly && recent);
            const eta = etas[s.id];
            return (
              <li key={s.id}>
                <details className="group/s" open={Boolean(open)}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-stone-500/5">
                    <ChevronRight className="size-4 shrink-0 text-stone-400 transition group-open/s:rotate-90" />
                    <span className="flex -space-x-2">{s.items.slice(0, 3).map((it) => <span key={it.title} className="rounded-xl ring-2 ring-white dark:ring-stone-900"><ProductThumb src={images[it.title] ?? null} title={it.title} size="sm" /></span>)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.items.map((it) => `${it.quantity}× ${it.title}`).join(", ")}</span>
                      <span className="block text-xs text-stone-500">{shipmentTag(s)} · {day(s.createdAt)}{s.review ? ` · ${"★".repeat(s.review.rating)}` : ""}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{SHIPMENT_STATUS_LABEL[s.status]}</span>
                  </summary>
                  <div className="flex flex-col gap-3 px-5 pb-4 pl-12">
                    {s.note && <p className="text-xs text-stone-500">{s.note}</p>}
                    {s.status !== "CANCELLED" && <Steps s={s} />}
                    {s.status === "AWAITING_APPROVAL" && <p className="text-xs text-stone-500">Pedido recebido: a equipe vai conferir e aprovar antes do envio.</p>}
                    {s.status === "CANCELLED" && s.rejectReason && (
                      <p className="text-xs text-red-700 dark:text-red-400">Pedido não aprovado: {s.rejectReason} {s.note?.startsWith("Compra com o saldo") ? <>O valor voltou para o seu saldo.</> : !s.note?.startsWith("Pedido da creator") && <>Você pode escolher de novo em &quot;Liberado para você pedir&quot;.</>}</p>
                    )}
                    {s.status === "SHIPPED" && eta && (
                      <p className="flex items-center gap-1.5 text-sm font-medium"><CalendarClock className="size-4 text-brand dark:text-brand-2" />Previsão de chegada: até {day(eta)}</p>
                    )}
                    {s.trackingCode && s.status !== "CANCELLED" && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 dark:bg-white/5">
                        <div>
                          <p className="flex items-center gap-1.5 text-xs text-stone-500"><Truck className="size-3.5" /> {s.carrier ?? "Rastreio"}</p>
                          <p className="font-mono text-sm font-semibold">{s.trackingCode}</p>
                        </div>
                        <div className="flex gap-2">
                          <CopyButton value={s.trackingCode} label="Copiar" />
                          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold">Rastrear <ExternalLink className="size-3.5" /></a>}
                        </div>
                      </div>
                    )}
                    {s.status === "SHIPPED" && !viewOnly && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-stone-500">Chegou? Confirme para a equipe saber.</p>
                        <ReceivedButton marca={marca} shipmentId={s.id} />
                      </div>
                    )}
                    {s.status === "DELIVERED" && <p className="text-xs text-stone-500">{s.deliveredBy === "CREATOR" ? "Você confirmou o recebimento." : "Entrega confirmada pela equipe."}</p>}
                    {s.status === "DELIVERED" && s.review && (
                      <p className="flex items-center gap-1 text-sm"><span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-4 ${n <= s.review!.rating ? "fill-amber-400 text-amber-400" : "text-stone-300"}`} />)}</span>{s.review.comment && <span className="text-stone-600 dark:text-stone-300">· {s.review.comment}</span>}</p>
                    )}
                    {s.status === "DELIVERED" && !s.review && !viewOnly && <ReviewForm marca={marca} shipmentId={s.id} />}
                    {recent && !viewOnly && (
                      <Link href={`/portal/${marca}/posts`} className="flex items-center gap-3 rounded-2xl bg-brand/8 px-4 py-3 text-sm dark:bg-brand-2/10">
                        <Megaphone className="size-4 shrink-0 text-brand dark:text-brand-2" />
                        <span className="min-w-0 flex-1"><strong>Ideia de post:</strong> mostre o unboxing com o seu cupom. Depois, registre o link para ver as vendas que vieram dele.</span>
                        <ChevronRight className="size-4 shrink-0 text-stone-400" />
                      </Link>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Aba Pedidos (E7.8; D-SHOPTAB; D-PORTALSHIP): faixa com o que importa agora (produto liberado para escolher, envio a
 * caminho ou quanto falta para o próximo), a escolha do kit, o endereço e os envios compactos.
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
  etas = {},
  images = {},
  year,
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
  etas?: Record<string, Date>;
  images?: Record<string, string | null>;
  year: string;
}) {
  const pendingProducts = kits.kits.reduce((n, k) => n + k.products, 0);
  const moving = shipments.find((s) => s.status === "SHIPPED") ?? shipments.find((s) => s.status === "PREPARING" || s.status === "AWAITING_APPROVAL") ?? null;
  const onTheWay = shipments.filter((s) => s.status === "AWAITING_APPROVAL" || s.status === "PREPARING" || s.status === "SHIPPED").length;
  const receivedYear = shipments.filter((s) => s.status === "DELIVERED" && s.deliveredAt && String(s.deliveredAt.getFullYear()) === year).length;
  const prizes = history.length;
  let headline: React.ReactNode;
  let sub: React.ReactNode = null;
  let cta: React.ReactNode = null;
  if (kits.kits.length > 0) {
    headline = <>Você ganhou {pendingProducts} {kitNoun(marca, pendingProducts)}!</>;
    sub = "Escolha os produtos e confirme o endereço: a equipe aprova e faz o envio.";
    cta = <a href="#escolher" className="self-start rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-900 shadow-sm">Escolher agora</a>;
  } else if (moving) {
    headline = moving.status === "SHIPPED" ? <>Seu pedido está a caminho</> : moving.status === "PREPARING" ? <>Seu pedido está sendo preparado</> : <>Seu pedido está em aprovação</>;
    sub = moving.status === "SHIPPED" && etas[moving.id] ? `Previsão de chegada: até ${day(etas[moving.id]!)}${moving.trackingCode ? ` · rastreio ${moving.trackingCode}` : ""}` : moving.items.map((it) => `${it.quantity}× ${it.title}`).join(", ");
  } else if (progress) {
    const goal = progress.kind === "TIER" ? (progress.next?.fromCents ?? progress.salesCents) : progress.goalCents;
    const missing = Math.max(0, goal - progress.salesCents);
    headline = missing > 0 ? <>Faltam <span className="money">{(missing / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span> para o próximo produto</> : <>Você chegou à faixa mais alta</>;
    const pct = goal ? Math.min(100, Math.round((progress.salesCents / goal) * 100)) : 100;
    cta = <span className="h-2 w-full overflow-hidden rounded-full bg-white/25"><span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} /></span>;
  } else {
    headline = <>Seus pedidos</>;
    sub = "Quando você ganhar produtos pelas suas vendas, eles aparecem aqui para escolher.";
  }
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-3 p-5 md:p-7">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/75"><Gift className="size-4" />Seus produtos</p>
          <h1 className="text-2xl font-semibold leading-tight md:text-3xl">{headline}</h1>
          {sub && <p className="text-sm text-white/85">{sub}</p>}
          {cta}
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[
              { k: "caminho", label: "Andamento", v: onTheWay },
              { k: "recebidos", label: `Recebidos ${year}`, v: receivedYear },
              { k: "premios", label: "Prêmios", v: prizes },
            ].map((t) => (
              <div key={t.k} className="frost-tile flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-stone-900 dark:text-white">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className="text-lg font-semibold tabular-nums">{t.v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* D-KITAPPROVAL: o pedido só existe com produto liberado; a escolha vai para a aprovação da equipe e depois para o envio. */}
      {kits.kits.length > 0 && (
        <section id="escolher" data-tour="solicitar-pedido" className="flex scroll-mt-24 flex-col gap-4">
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
      <ShipmentList marca={marca} shipments={shipments} viewOnly={viewOnly} etas={etas} images={images} />
      {/* D-KITPROGRESS: como liberar o próximo produto (as faixas do contrato). */}
      {progress && <KitProgressCard progress={progress} brandSlug={marca} />}
      <AddressCard marca={marca} address={address} viewOnly={viewOnly} informed={informedAddress} />
    </div>
  );
}
