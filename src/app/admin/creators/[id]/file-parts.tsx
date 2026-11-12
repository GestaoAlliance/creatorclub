import { AlertTriangle, ArrowRight, CheckCircle2, Eye, FileText, Info, Package, Play, ShoppingBag, Trophy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { viewAsAction } from "@/app/portal/actions";
import { Card } from "@/components/ui/page";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { birthdayLabel, CREATOR_CATEGORY_LABEL, formatBRL, instagramUrl, shortBRL, whatsappChatUrl, type CreatorCategoryValue, type FileNeed } from "@/domain";
import type { CreatorInsights } from "@/lib/creators/insights";
import { STATUS_LABEL } from "@/lib/creators/profile";
import { CopyChip } from "../list-parts";
import { ProductThumb } from "@/components/ui/product-thumb";
import { Avatar } from "@/components/ui/avatar";
import { PhotoEditor } from "@/components/ui/photo-editor";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => MONTH[Number(m.slice(5)) - 1]!;
const date = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export type HeroTile = { label: string; value: string; hint?: ReactNode; tone?: "red" | "amber" | undefined };

/** Faixa da marca da ficha (D-CREATORFILE): quem é, situação, redes, cupom com o link e os números em vidro fosco. */
export function FileHero(p: {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DEACTIVATED";
  categories: string[];
  hasLogin: boolean;
  reviewed: boolean;
  birthDate: string | null;
  place: string | null;
  niches: string[];
  instagram: string | null;
  tiktok: string | null;
  tiktokShop: boolean;
  youtube: string | null;
  kwai: string | null;
  mediaKitUrl: string | null;
  phone: string | null;
  coupon: string | null;
  link: string | null;
  canViewAs: boolean;
  canEditPhoto: boolean;
  tiles: HeroTile[];
}) {
  const wa = p.phone ? whatsappChatUrl(p.phone) : null;
  const ig = p.instagram ? instagramUrl(p.instagram) : null;
  const chips = [
    STATUS_LABEL[p.status],
    ...p.categories.map((k) => CREATOR_CATEGORY_LABEL[k as CreatorCategoryValue] ?? k),
    p.hasLogin ? "entra no portal" : "sem acesso ao portal",
    ...(p.reviewed ? ["conferida pela Ana"] : []),
    ...(p.birthDate ? [`🎂 ${birthdayLabel(p.birthDate)}`] : []),
    ...(p.place ? [`📍 ${p.place}`] : []),
    ...p.niches,
  ];
  return (
    <section className="@container relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
      <div aria-hidden className="brand-art absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
      <div className="flex flex-col gap-5 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {/* D-PHOTO: foto de perfil (Instagram ou subida); a Gestão troca ou tira. */}
            {p.canEditPhoto ? <PhotoEditor creatorId={p.id} name={p.name} size="hero" square light /> : <Avatar name={p.name} id={p.id} size="hero" square className="ring-2 ring-white/60" />}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{p.name}</h1>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <span key={i} className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${i === 0 ? (p.status === "ACTIVE" ? "bg-emerald-400/90 text-emerald-950" : p.status === "INACTIVE" ? "bg-amber-300/90 text-amber-950" : "bg-white/25") : "bg-white/15 text-white/90 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]"}`}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {p.canViewAs && (
            <form action={viewAsAction} data-tour="fi-vercomo">
              <input type="hidden" name="creatorId" value={p.id} />
              <button className="peek-chip"><Eye className="size-3.5" /> Ver o portal como ela</button>
            </form>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {wa && <a href={wa} {...ext} className="peek-chip"><WhatsAppIcon className="size-3.5" />{p.phone}</a>}
          {ig && <a href={ig} {...ext} className="peek-chip"><InstagramIcon className="size-3.5" />{p.instagram!.replace(/^@/, "")}</a>}
          {p.tiktok && <a href={`https://www.tiktok.com/@${p.tiktok.replace(/^@/, "")}`} {...ext} className="peek-chip"><TikTokIcon className="size-3.5" />{p.tiktok.replace(/^@/, "")}{p.tiktokShop && " · Shop"}</a>}
          {p.youtube && <a href={`https://www.youtube.com/@${p.youtube}`} {...ext} className="peek-chip"><Play className="size-3.5" />{p.youtube}</a>}
          {p.kwai && <span className="peek-chip">Kwai · {p.kwai}</span>}
          {p.mediaKitUrl && <a href={p.mediaKitUrl} {...ext} className="peek-chip"><FileText className="size-3.5" />Mídia kit</a>}
          {p.coupon && (
            <span className="ml-auto flex min-w-0 items-center gap-2 rounded-full bg-white/12 py-1 pl-3.5 pr-1 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)] backdrop-blur">
              <span className="font-mono text-sm font-bold tracking-wide">{p.coupon}</span>
              {p.link && <span className="hidden truncate font-mono text-[11px] text-white/70 @3xl:inline">{p.link}</span>}
              {p.link && <CopyChip value={p.link} label="Copiar link" />}
            </span>
          )}
        </div>

        {p.tiles.length > 0 && (
          <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            {p.tiles.map((t) => (
              <div key={t.label} className="frost-tile flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3 text-stone-900 dark:text-white">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-300">{t.label}</span>
                <span className={`whitespace-nowrap text-[clamp(1rem,5cqi,1.6rem)] font-semibold tabular-nums leading-tight ${t.tone === "red" ? "text-red-700 dark:text-red-400" : t.tone === "amber" ? "text-amber-700 dark:text-amber-300" : ""}`}>{t.value}</span>
                {t.hint && <span className="truncate text-[11px] text-stone-500 dark:text-stone-300">{t.hint}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const NEED_ICON = { urgent: AlertTriangle, warn: AlertTriangle, info: Info } as const;
const NEED_CLS = {
  urgent: "border-red-500/30 bg-red-500/8 text-red-900 dark:text-red-200",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  info: "border-stone-300/70 bg-white/50 text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-stone-200",
} as const;

/** Coluna "O que falta" (D-CREATORFILE): cada item leva para onde resolve. */
export function NeedsList({ needs }: { needs: FileNeed[] }) {
  if (!needs.length)
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="size-4" /> Tudo em dia
      </p>
    );
  return (
    <ul className="flex flex-col gap-1.5">
      {needs.map((n) => {
        const Icon = NEED_ICON[n.tone];
        return (
          <li key={n.label}>
            <a href={n.href} className={`group flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm transition-transform hover:-translate-y-px ${NEED_CLS[n.tone]}`}>
              <Icon className="mt-0.5 size-4 shrink-0 opacity-80" />
              <span className="flex-1 leading-snug">{n.label}</span>
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Vendas por mês (12 meses) com a linha do mínimo do contrato quando a liberação é pelas vendas. */
export function MonthlyCard({ months, minCents }: { months: NonNullable<CreatorInsights["money"]>["months"]; minCents: number | null }) {
  const max = Math.max(...months.map((m) => m.cents), minCents ?? 0, 1);
  const total = months.reduce((s, m) => s + m.cents, 0);
  const best = months.reduce((b, m) => (m.cents > b.cents ? m : b), months[0]!);
  const H = 120;
  const W = months.length * 40;
  const minY = minCents ? H - (minCents / max) * H : null;
  return (
    <Card title="Vendas por mês" icon={<ShoppingBag className="size-4" />}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><span className="text-stone-500">12 meses:</span> <strong className="tabular-nums">{formatBRL(total)}</strong></span>
        {best.cents > 0 && <span><span className="text-stone-500">Melhor mês:</span> <strong>{monthLabel(best.month)}/{best.month.slice(2, 4)}</strong> ({shortBRL(best.cents)})</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-44 w-full" role="img" aria-label="Vendas por mês nos últimos 12 meses">
        {months.map((m, i) => {
          const h = m.cents ? Math.max(3, (m.cents / max) * H) : 2;
          const last = i === months.length - 1;
          return (
            <g key={m.month}>
              <rect x={i * 40 + 8} y={H - h} width={24} height={h} rx={5} className={m.cents ? (last ? "fill-brand dark:fill-brand-2" : "fill-brand/55 dark:fill-brand-2/55") : "fill-stone-300/60 dark:fill-white/10"}>
                <title>{`${monthLabel(m.month)}/${m.month.slice(0, 4)}: ${formatBRL(m.cents)} · ${m.orders} pedido${m.orders === 1 ? "" : "s"}`}</title>
              </rect>
              <text x={i * 40 + 20} y={H + 16} textAnchor="middle" className={`fill-stone-500 text-[10px] ${last ? "font-semibold" : ""}`}>{monthLabel(m.month)}</text>
            </g>
          );
        })}
        {minY !== null && (
          <g>
            <line x1={0} x2={W} y1={minY} y2={minY} strokeDasharray="5 4" className="stroke-amber-500" strokeWidth={1.5} />
            <text x={4} y={minY - 5} textAnchor="start" className="fill-amber-700 text-[10px] font-semibold dark:fill-amber-300">mínimo {shortBRL(minCents!)}</text>
          </g>
        )}
      </svg>
      {minCents !== null && <p className="text-xs text-stone-500">A linha é o mínimo do contrato para liberar a comissão no dia 1 (as vendas acumulam de um mês para o outro até chegar nele).</p>}
    </Card>
  );
}

/** Comparação com a média das creators ativas da marca e a posição no ranking dos 30 dias. */
export function CompareCard({ c }: { c: NonNullable<CreatorInsights["money"]>["compare"] }) {
  const ratio = c.averageCents ? c.sales30Cents / c.averageCents : 0;
  const width = (v: number) => `${Math.max(2, Math.min(100, (v / Math.max(c.sales30Cents, c.averageCents, 1)) * 100))}%`;
  return (
    <Card title="Comparada às outras" icon={<Trophy className="size-4" />}>
      <div className="flex items-baseline gap-2">
        {c.rank ? (
          <>
            <span className="text-3xl font-semibold tabular-nums">{c.rank}º</span>
            <span className="text-sm text-stone-500">de {c.active} ativas em vendas nos últimos 30 dias</span>
          </>
        ) : (
          <span className="text-sm text-stone-500">Sem vendas nos últimos 30 dias ({c.active} ativas na marca)</span>
        )}
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-stone-500">Ela</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-500/10"><span className="block h-full rounded-full bg-brand dark:bg-brand-2" style={{ width: width(c.sales30Cents) }} /></span>
          <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{shortBRL(c.sales30Cents)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-stone-500">Média</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-500/10"><span className="block h-full rounded-full bg-stone-400" style={{ width: width(c.averageCents) }} /></span>
          <span className="w-20 shrink-0 text-right tabular-nums">{shortBRL(c.averageCents)}</span>
        </div>
      </div>
      {c.averageCents > 0 && c.sales30Cents > 0 && (
        <p className="text-xs text-stone-500">
          {ratio >= 1.1 ? `${ratio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× a média das ativas` : ratio <= 0.9 ? `${Math.round((1 - ratio) * 100)}% abaixo da média das ativas` : "Na média das ativas"}
        </p>
      )}
    </Card>
  );
}

/** Produtos que ela mais vende (12 meses, por unidades). */
export function ProductsCard({ products }: { products: NonNullable<CreatorInsights["money"]>["products"] }) {
  const max = Math.max(...products.map((x) => x.quantity), 1);
  return (
    <Card title="O que ela mais vende" icon={<ShoppingBag className="size-4" />}>
      {products.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhuma venda nos últimos 12 meses.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {products.map((x, i) => (
            <li key={x.title} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2"><span className="w-3 shrink-0 text-right text-xs text-stone-400 tabular-nums">{i + 1}</span><ProductThumb src={x.image} title={x.title} size="sm" /><span className="truncate">{x.title}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-stone-500">{x.quantity} un. · {shortBRL(x.cents)}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-stone-500/10"><span className="block h-full rounded-full bg-brand/70 dark:bg-brand-2/70" style={{ width: `${(x.quantity / max) * 100}%` }} /></span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-stone-500">Últimos 12 meses, pelas unidades nos pedidos com o cupom dela (brindes de valor zero ficam de fora).</p>
    </Card>
  );
}

const SHIP_STATUS: Record<string, { label: string; cls: string }> = {
  AWAITING_APPROVAL: { label: "Esperando aprovação", cls: "bg-amber-500/15 text-amber-900 dark:text-amber-200" },
  PREPARING: { label: "Sendo preparado", cls: "bg-sky-500/15 text-sky-900 dark:text-sky-200" },
  SHIPPED: { label: "A caminho", cls: "bg-violet-500/15 text-violet-900 dark:text-violet-200" },
  DELIVERED: { label: "Entregue", cls: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200" },
  CANCELLED: { label: "Cancelado", cls: "bg-stone-500/15 text-stone-700 dark:text-stone-300" },
};

/** Último envio (kit): situação, o que foi, rastreio e se ela confirmou o recebimento. */
export function ShipmentCard({ s, count }: { s: CreatorInsights["shipment"]; count: number }) {
  return (
    <Card title="Último envio" icon={<Package className="size-4" />}>
      {!s ? (
        <p className="text-sm text-stone-500">Nenhum envio ainda.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SHIP_STATUS[s.status]?.cls ?? ""}`}>{SHIP_STATUS[s.status]?.label ?? s.status}</span>
            {s.kit && <span className="text-sm text-stone-600 dark:text-stone-300">{s.kit}</span>}
            <span className="ml-auto text-xs text-stone-500">{count} envio{count === 1 ? "" : "s"} no total</span>
          </div>
          {s.items.length > 0 && <p className="text-sm">{s.items.map((i) => `${i.quantity}× ${i.title}`).join(" · ")}</p>}
          <ol className="grid grid-cols-3 gap-2 text-xs">
            {[
              { label: "Pedido", at: s.createdAt },
              { label: "Enviado", at: s.shippedAt },
              { label: s.deliveredBy === "CREATOR" ? "Ela confirmou" : "Entregue", at: s.deliveredAt },
            ].map((step) => (
              <li key={step.label} className={`flex flex-col gap-0.5 rounded-xl px-2.5 py-2 ${step.at ? "bg-emerald-500/10" : "bg-stone-500/8"}`}>
                <span className="font-medium">{step.label}</span>
                <span className="text-stone-500">{date(step.at)}</span>
              </li>
            ))}
          </ol>
          {s.status === "SHIPPED" && !s.deliveredAt && <p className="text-xs text-stone-500">Ela ainda não tocou em "Recebi" no portal.</p>}
          {s.trackingCode && <p className="text-xs text-stone-500">Rastreio: <span className="font-mono">{s.trackingCode}</span>{s.carrier ? ` (${s.carrier})` : ""}</p>}
          {s.review && <p className="text-sm"><span className="text-amber-500">{"★".repeat(s.review.rating)}</span><span className="text-stone-300">{"★".repeat(5 - s.review.rating)}</span>{s.review.comment && <span className="text-stone-600 dark:text-stone-300"> · “{s.review.comment}”</span>}</p>}
        </>
      )}
      <Link href="/admin/envios" className="self-start text-xs font-semibold text-brand hover:underline dark:text-brand-2">Ver envios →</Link>
    </Card>
  );
}
