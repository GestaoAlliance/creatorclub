"use client";

import { ChevronDown, ChevronRight, ChevronUp, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/portal/copy-button";
import { HelpTip } from "@/components/ui/tour";
import { badge, ui } from "@/components/ui/styles";
import { CREATOR_CATEGORIES, CREATOR_CATEGORY_LABEL, formatBRL, instagramUrl, matchesCategory, whatsappChatUrl, type CategoryFilter, type CreatorCategoryValue } from "@/domain";

type Row = {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  categories: CreatorCategoryValue[];
  fakeEmail: boolean;
  hasLogin: boolean;
  reviewed: boolean;
  contract: { status: "NONE" | "ACTIVE" | "EXPIRING" | "EXPIRED"; daysLeft: number | null };
  idle: { days: number; idle: boolean; lastSaleDay: string | null } | null;
  ugcCycle: { count: number; goal: number; outside: number; status: "NO_CONTRACT" | "OPEN" | "DONE" | "MISSED" } | null;
  lastOrder: { name: string; day: string } | null;
  pendings: string[];
  joinedAt: Date;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  cpf: string | null;
  coupon: string | null;
  stats: { salesCents: number; orders: number; sales30Cents: number } | null;
  /** M4.2 (D-TAGS). */
  tags: { id: string; name: string }[];
};

type Situation = "ACTIVE" | "INACTIVE" | "DEACTIVATED";
type Alert = "" | "never" | "stopped30" | "idle60" | "noPortal" | "pending" | "contract";
type Sort = "sales" | "orders" | "last" | "name" | "joined";

const br = (day: string) => day.split("-").reverse().join("/");
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const daysSince = (day: string) => Math.floor((Date.now() - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

const SITUATIONS: { id: Situation; label: string }[] = [
  { id: "ACTIVE", label: "Ativas" },
  { id: "INACTIVE", label: "Pausadas" },
  { id: "DEACTIVATED", label: "Encerradas" },
];

/** Selo dos vídeos da UGC no ciclo (D-UGCVIDEOS). */
function UgcBadge({ c }: { c: NonNullable<Row["ugcCycle"]> }) {
  if (c.status === "NO_CONTRACT") return <span className={badge.amber}>vídeos: sem datas do contrato</span>;
  const cls = c.status === "DONE" ? badge.green : c.status === "MISSED" ? badge.red : badge.neutral;
  return <span className={cls}>vídeos {c.count}/{c.goal}</span>;
}

/**
 * Lista de creators no modelo da referência (M0.0.2): situação e tipo em abas, alertas clicáveis, busca por nome,
 * cupom, @, e-mail, WhatsApp ou CPF, e a tabela com redes, WhatsApp, cupom e vendas (ordenável). Tudo no navegador:
 * a lista já vem filtrada pela permissão (vendas só para quem vê dinheiro; CPF só para quem vê dados fiscais).
 */
export function CreatorList(p: { rows: Row[]; tag?: string; contractsOnly?: boolean; idleOnly?: boolean; pendingOnly?: boolean; category?: CategoryFilter; pendingApplications: number }) {
  const { rows } = p;
  const router = useRouter();
  // A linha inteira abre a ficha (links e botões de dentro continuam funcionando sozinhos).
  const open = (id: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    router.push(`/admin/creators/${id}`);
  };
  const [q, setQ] = useState("");
  const [situation, setSituation] = useState<Situation>("ACTIVE");
  const [category, setCategory] = useState<CategoryFilter>(p.category ?? "");
  const [tag, setTag] = useState(p.tag ?? "");
  // M4.2 (D-TAGS): tags em uso na marca, com quantas creators da situação têm cada uma.
  const tagOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) for (const t of r.tags) m.set(t.id, t.name);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rows]);
  const [alert, setAlert] = useState<Alert>(p.contractsOnly ? "contract" : p.idleOnly ? "idle60" : p.pendingOnly ? "pending" : "");
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: rows.some((r) => r.stats) ? "sales" : "name", desc: rows.some((r) => r.stats) });
  const money = rows.some((r) => r.stats !== null);

  const inSituation = rows.filter((r) => r.status === situation);
  const ALERTS: { id: Exclude<Alert, "">; label: string; test: (r: Row) => boolean }[] = [
    { id: "never", label: "nunca venderam", test: (r) => !r.lastOrder },
    { id: "stopped30", label: "pararam há 30 dias", test: (r) => r.lastOrder !== null && daysSince(r.lastOrder.day) >= 30 },
    { id: "idle60", label: "sem vender há 60 dias", test: (r) => r.idle?.idle === true },
    { id: "noPortal", label: "sem acesso ao portal", test: (r) => !r.hasLogin },
    { id: "pending", label: "com pendência", test: (r) => r.pendings.length > 0 },
    { id: "contract", label: "contrato vencendo ou vencido", test: (r) => r.contract.status === "EXPIRING" || r.contract.status === "EXPIRED" },
  ];
  const alertTest = ALERTS.find((a) => a.id === alert)?.test ?? (() => true);

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const digits = q.replace(/\D/g, "");
    const list = inSituation.filter((r) => {
      if (!matchesCategory(r.categories, category) || !alertTest(r)) return false;
      if (tag && !r.tags.some((t) => t.id === tag)) return false;
      if (!words.length) return true;
      const hay = norm(`${r.name} ${r.coupon ?? ""} ${r.instagram ?? ""} ${r.tiktok ?? ""} ${r.email ?? ""}`);
      const nums = `${(r.phone ?? "").replace(/\D/g, "")} ${r.cpf ?? ""}`;
      return words.every((w) => hay.includes(w.replace(/^@/, ""))) || (digits.length >= 4 && nums.includes(digits));
    });
    const val = (r: Row): number | string =>
      sort.by === "sales" ? (r.stats?.salesCents ?? 0) : sort.by === "orders" ? (r.stats?.orders ?? 0) : sort.by === "last" ? (r.lastOrder?.day ?? "") : sort.by === "joined" ? r.joinedAt.toString() : norm(r.name);
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [q, situation, category, alert, sort, rows, tag]);

  const total = inSituation.reduce((s, r) => s + (r.stats?.salesCents ?? 0), 0);
  const top = [...inSituation].map((r) => r.stats?.salesCents ?? 0).sort((a, b) => b - a);
  const share = (n: number) => (total ? Math.round((top.slice(0, n).reduce((s, v) => s + v, 0) / total) * 100) : 0);

  function Head({ by, children, right = false }: { by: Sort; children: string; right?: boolean }) {
    const on = sort.by === by;
    return (
      <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-stone-500 ${right ? "text-right" : "text-left"}`}>
        <button type="button" onClick={() => setSort({ by, desc: on ? !sort.desc : by !== "name" })} className={`inline-flex items-center gap-1 uppercase ${on ? "text-stone-900 dark:text-white" : ""}`}>
          {children}
          {on && (sort.desc ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />)}
        </button>
      </th>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {SITUATIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSituation(s.id)} className={situation === s.id ? ui.pillOn : ui.pill}>
            {s.label} · {rows.filter((r) => r.status === s.id).length}
          </button>
        ))}
        <Link href="/admin/candidatas" className={ui.pill}>
          Pendentes · {p.pendingApplications}
        </Link>
      </div>

      <section className={`${ui.card} gap-4`}>
        <div data-tour="cr-filtros" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(["", ...CREATOR_CATEGORIES] as CategoryFilter[]).map((c) => (
              <button key={c || "todos"} type="button" onClick={() => setCategory(c)} className={`rounded-full px-3 py-1 text-sm ${category === c ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-500/10 dark:text-stone-300"}`}>
                {c ? CREATOR_CATEGORY_LABEL[c as CreatorCategoryValue] : "Todos os tipos"} <span className="tabular-nums opacity-60">{inSituation.filter((r) => matchesCategory(r.categories, c)).length}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cupom, @, e-mail, WhatsApp ou CPF" aria-label="Buscar creator" className={`${ui.input} pl-9`} />
            </label>
            {tagOptions.length > 0 && (
              <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" className={`${ui.input} w-auto max-w-48`}>
                <option value="">Todas as tags</option>
                {tagOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({inSituation.filter((r) => r.tags.some((x) => x.id === t.id)).length})</option>
                ))}
              </select>
            )}
            <HelpTip id="cr-filtros" />
          </div>
          {situation !== "DEACTIVATED" && (
            <div className="flex flex-wrap gap-2">
              {ALERTS.map((a) => {
                const n = inSituation.filter((r) => matchesCategory(r.categories, category) && a.test(r)).length;
                if (!n && alert !== a.id) return null;
                return (
                  <button key={a.id} type="button" onClick={() => setAlert(alert === a.id ? "" : a.id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${alert === a.id ? "border-amber-500 bg-amber-500 text-white" : "border-amber-400/60 bg-amber-100/60 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"}`}>
                    {n} {a.label}
                  </button>
                );
              })}
            </div>
          )}
          {money && total > 0 && (
            <p className={ui.hint}>
              Concentração: a maior faz {share(1)}% das vendas · as 3 maiores, {share(3)}%. {shown.length} de {inSituation.length} creators.
            </p>
          )}
        </div>

        {shown.length === 0 ? (
          <p className={ui.muted}>Nenhuma creator encontrada.</p>
        ) : (
          <>
          {/* Celular: um cartão por creator. */}
          <ul className="flex flex-col divide-y divide-stone-200/70 md:hidden dark:divide-white/10">
            {shown.map((c) => {
              const wa = c.phone ? whatsappChatUrl(c.phone) : null;
              return (
                <li key={c.id} onClick={open(c.id)} className="flex cursor-pointer flex-col gap-1.5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/admin/creators/${c.id}`} className="truncate font-medium">{c.name}</Link>
                    {c.stats && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBRL(c.stats.salesCents)}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {wa && <a href={wa} {...ext} className="inline-flex items-center gap-1"><WhatsAppIcon className="size-3.5 text-emerald-600" />WhatsApp</a>}
                    {c.instagram && <span className="inline-flex items-center gap-1"><InstagramIcon className="size-3.5 text-pink-600" />{c.instagram.replace(/^@/, "")}</span>}
                    {c.tiktok && <span className="inline-flex items-center gap-1"><TikTokIcon className="size-3.5" />{c.tiktok.replace(/^@/, "")}</span>}
                    {c.coupon && <span className="font-mono font-semibold">{c.coupon}</span>}
                    <span className="text-stone-500">{c.lastOrder ? `última venda há ${daysSince(c.lastOrder.day)} dias` : "nunca vendeu"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.categories.map((k) => <span key={k} className={badge.neutral}>{CREATOR_CATEGORY_LABEL[k]}</span>)}
                    {c.tags.map((t) => <span key={t.id} className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand dark:border-brand-2/30 dark:bg-brand-2/15 dark:text-brand-2">{t.name}</span>)}
                    {!c.hasLogin && <span className={badge.neutral}>sem acesso</span>}
                    {c.pendings.filter((x) => !x.startsWith("contrato")).map((x) => <span key={x} className={badge.amber}>{x}</span>)}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="-mx-2 hidden overflow-x-auto md:block">
            <table data-tour="cr-lista" className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <Head by="name">Creator</Head>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500">Redes</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500">Cupom</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500">Tipo</th>
                  {money && <Head by="sales" right>Vendas</Head>}
                  {money && <Head by="orders" right>Pedidos</Head>}
                  <Head by="last">Última venda</Head>
                  <Head by="joined">Entrada</Head>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const wa = c.phone ? whatsappChatUrl(c.phone) : null;
                  const ig = c.instagram ? instagramUrl(c.instagram) : null;
                  return (
                    <tr key={c.id} onClick={open(c.id)} className="group cursor-pointer align-top transition-colors hover:bg-stone-500/5 [&>td]:border-t [&>td]:border-stone-200/70 [&>td]:px-3 [&>td]:py-3 dark:[&>td]:border-white/10">
                      <td className="max-w-64">
                        <div className="flex items-start gap-2.5">
                          <span className="grid size-10 shrink-0 place-content-center rounded-full bg-gradient-to-br from-brand to-brand/60 text-sm font-semibold text-white shadow-sm dark:from-brand-2 dark:to-brand-2/60">{c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                          <div className="min-w-0">
                            <Link href={`/admin/creators/${c.id}`} className="block truncate font-medium hover:underline">{c.name}</Link>
                            {wa ? (
                              <a href={wa} {...ext} className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-emerald-700 dark:text-stone-300"><WhatsAppIcon className="size-3.5 text-emerald-600" />{c.phone}</a>
                            ) : (
                              <span className="text-xs text-stone-500">{c.phone ?? "sem WhatsApp"}</span>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {!c.hasLogin && <span className={badge.neutral}>sem acesso</span>}
                              {c.pendings.filter((x) => !x.startsWith("contrato")).map((x) => <span key={x} className={badge.amber}>{x}</span>)}
                              {c.contract.status === "EXPIRING" && <span className={badge.amber}>contrato vence em {c.contract.daysLeft}d</span>}
                              {c.contract.status === "EXPIRED" && <span className={badge.red}>contrato vencido</span>}
                              {c.ugcCycle && c.status !== "DEACTIVATED" && <UgcBadge c={c.ugcCycle} />}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5 text-xs">
                          {c.instagram ? (
                            ig ? <a href={ig} {...ext} className="inline-flex items-center gap-1.5 hover:underline"><InstagramIcon className="size-3.5 text-pink-600" />{c.instagram.replace(/^@/, "")}</a> : <span>@{c.instagram}</span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                          {c.tiktok && (
                            <a href={`https://www.tiktok.com/@${c.tiktok.replace(/^@/, "")}`} {...ext} className="inline-flex items-center gap-1.5 hover:underline"><TikTokIcon className="size-3.5" />{c.tiktok.replace(/^@/, "")}</a>
                          )}
                        </div>
                      </td>
                      <td>{c.coupon ? <span className="flex items-center gap-1.5"><span className="font-mono text-xs font-semibold">{c.coupon}</span><span className="opacity-0 transition-opacity group-hover:opacity-100"><CopyButton value={c.coupon} label="Copiar" /></span></span> : <span className="text-stone-400">—</span>}</td>
                      <td><div className="flex flex-wrap gap-1">{c.categories.map((k) => <span key={k} className={badge.neutral}>{CREATOR_CATEGORY_LABEL[k]}</span>)}{c.tags.map((t) => <span key={t.id} className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand dark:border-brand-2/30 dark:bg-brand-2/15 dark:text-brand-2">{t.name}</span>)}</div></td>
                      {money && (
                        <td className="text-right tabular-nums">
                          <span className="font-semibold">{formatBRL(c.stats?.salesCents ?? 0)}</span>
                          {(c.stats?.sales30Cents ?? 0) > 0 && <span className="block text-xs text-stone-500">{formatBRL(c.stats!.sales30Cents)} em 30d</span>}
                        </td>
                      )}
                      {money && <td className="text-right tabular-nums">{c.stats?.orders ?? 0}</td>}
                      <td className="whitespace-nowrap text-xs">{c.lastOrder ? <>{br(c.lastOrder.day)}<span className="block text-stone-500">há {daysSince(c.lastOrder.day)} dias</span></> : <span className="text-stone-400">nunca</span>}</td>
                      <td className="whitespace-nowrap text-xs text-stone-500">
                        <span className="flex items-center justify-between gap-2">
                          {new Date(c.joinedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                          <ChevronRight className="size-4 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-500" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
