import type { CreatorReturn } from "@/lib/reports/creator-return";
import { ArrowLeft, ClipboardCheck, FileSignature, Eye, History, Mail, MapPin, Percent, Receipt, Scale, Ticket, TrendingUp, UserRound, Sparkles, FileText, Play, KeyRound } from "lucide-react";
import { CopyButton } from "@/components/portal/copy-button";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { Tabs } from "@/components/ui/tabs";
import type { creatorNumbers, TimelineEvent, TimelineKind } from "@/lib/creators/timeline";
import Link from "next/link";
import { HelpTip } from "@/components/ui/tour";
import { InstagramLink, WhatsappLink } from "@/components/ui/contact-links";
import { Card, Kpi } from "@/components/ui/page";
import { ReleaseProgressBar } from "@/components/ui/release-progress";
import { badge, ui } from "@/components/ui/styles";
import { birthdayLabel, CREATOR_CATEGORY_LABEL, formatBRL, instagramUrl, isUgcOnly, whatsappChatUrl, type CreatorCategoryValue } from "@/domain";
import { viewAsAction } from "@/app/portal/actions";
import { LEDGER_LABEL, type creatorStatement } from "@/lib/commission/statement";
import { STATUS_LABEL, type creatorProfile } from "@/lib/creators/profile";
import type { creatorTermsStatus } from "@/lib/terms/terms";
import type { creatorContractSignature } from "@/lib/contracts/sign";
import { CONTRACT_KIND_LABEL, type ContractKind } from "@/domain";
import { PricingEditor, AdjustForm, ChecklistForm, ContactForm, CouponCreateForm, InviteButton, NoteForm, RateChangeForm, RateFixForm, ReviewedButton, StatusForm, ArchiveForm, TagsEditor, ProfileForm } from "./forms";
import { AccessBox } from "@/components/staff/access-box";
import { PostForm, PostList } from "@/components/posts";
import type { PostWithSales } from "@/lib/posts/posts";
import { UgcVideosCard } from "./ugc-card";

const date = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dmy = (day: string | null) => (day ? day.split("-").reverse().join("/") : "—");
const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;
const STATUS_BADGE = { ACTIVE: badge.green, INACTIVE: badge.amber, DEACTIVATED: badge.neutral } as const;

type Profile = Awaited<ReturnType<typeof creatorProfile>>;
type Statement = Awaited<ReturnType<typeof creatorStatement>>;
type Terms = Awaited<ReturnType<typeof creatorTermsStatus>>;
type ContractSig = Awaited<ReturnType<typeof creatorContractSignature>>;
type Numbers = Awaited<ReturnType<typeof creatorNumbers>>;

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const KIND_DOT: Record<TimelineKind, string> = {
  signup: "bg-sky-500", approval: "bg-emerald-500", invite: "bg-sky-500", contract: "bg-violet-500", coupon: "bg-brand", rate: "bg-brand",
  sale: "bg-emerald-500", release: "bg-emerald-500", shipment: "bg-amber-500", withdrawal: "bg-emerald-600", status: "bg-stone-400", note: "bg-stone-700 dark:bg-stone-300",
};

/** M0.2: linha do tempo da creator com as observações da equipe. */
function Timeline({ events, creatorId, canEdit }: { events: TimelineEvent[]; creatorId: string; canEdit: boolean }) {
  return (
    <Card title="Linha do tempo" icon={<History className="size-4" />}>
      {canEdit && <NoteForm creatorId={creatorId} />}
      {events.length === 0 ? (
        <p className={ui.muted}>Nada registrado ainda.</p>
      ) : (
        <ol className="relative flex flex-col gap-3 border-l border-stone-200 pl-4 dark:border-white/10">
          {events.map((e, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[1.3rem] top-1.5 size-2 rounded-full ${KIND_DOT[e.kind]}`} />
              <p className={`text-sm ${e.kind === "note" ? "whitespace-pre-line rounded-xl bg-stone-500/10 px-3 py-2" : "font-medium"}`}>{e.title}</p>
              <p className={ui.hint}>
                {when(e.at)}
                {e.detail && ` · ${e.kind === "note" ? `por ${e.detail}` : e.detail}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Ficha da creator (E4.4) no visual do sistema (D-DESIGNALL). Só exibe; os dados vêm da página. */
export function CreatorProfileView({ p, st, terms, contract, requestId, numbers, timeline, linkBase, mes, ret = null, returnDays = 90, tagSuggestions = [], posts = [], postCampaigns = [], today = "" }: { posts?: PostWithSales[]; postCampaigns?: { id: string; name: string }[]; today?: string; tagSuggestions?: string[]; mes?: string | undefined; ret?: CreatorReturn | null; returnDays?: number; p: Profile; st: Statement | null; terms: Terms; contract: ContractSig; requestId: string; numbers: Numbers | null; timeline: TimelineEvent[]; linkBase: string }) {
  // Só UGC (D-UGCPORTAL): sem comissão nem saque, então saldo, taxa, extrato, ajustes, termo e conferência somem.
  const ugcOnly = isUgcOnly(p.categories);
  return (
    <>
      <Link href="/admin/creators" className={`${ui.link} inline-flex items-center gap-1 self-start text-sm`}>
        <ArrowLeft className="size-4" /> Creators
      </Link>
      {/* Cabeçalho no modelo da referência: quem é, redes, cupom com o link e os números principais. */}
      <section className={`${ui.card} gap-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-12 shrink-0 place-content-center rounded-2xl bg-brand text-xl sm:size-16 sm:rounded-3xl sm:text-2xl font-bold text-white shadow-sm">
              {p.contact.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className={`${ui.title} truncate`}>{p.contact.name}</h1>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</span>
                {p.categories.map((k) => <span key={k} className={badge.neutral}>{CREATOR_CATEGORY_LABEL[k as CreatorCategoryValue]}</span>)}
                <span className={p.hasLogin ? badge.sky : badge.neutral}>{p.hasLogin ? "já entrou no portal" : "sem acesso ao portal"}</span>
                {p.reviewedAt && <span className={badge.green}>conferida pela Ana</span>}
                {p.contact.fakeEmail && <span className={badge.amber}>e-mail a confirmar</span>}
                {p.birthDate && <span className={badge.neutral}>🎂 {birthdayLabel(p.birthDate)}</span>}
                {p.place && <span className={badge.neutral}>📍 {p.place}</span>}
                {p.profile.professionalId && <span className={badge.sky}>{p.profile.professionalId}</span>}
                {p.profile.niches.map((n) => <span key={n} className={badge.neutral}>{n}</span>)}
              </div>
              {/* M4.2 (D-TAGS): tags da marca, só a equipe vê. */}
              <div className="mt-2">
                <TagsEditor creatorId={p.id} tags={p.tags} suggestions={tagSuggestions} canEdit={p.canEdit} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.instagram && instagramUrl(p.instagram) && (
                  <a href={instagramUrl(p.instagram)!} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:shadow-sm">
                    <InstagramIcon className="size-4 text-pink-600" /> {p.instagram.replace(/^@/, "")}
                  </a>
                )}
                {p.tiktok && (
                  <a href={`https://www.tiktok.com/@${p.tiktok.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:shadow-sm">
                    <TikTokIcon className="size-4" /> {p.tiktok.replace(/^@/, "")}
                  </a>
                )}
                {p.profile.youtube && (
                  <a href={`https://www.youtube.com/@${p.profile.youtube}`} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:shadow-sm">
                    <Play className="size-4 text-red-600" /> {p.profile.youtube}
                  </a>
                )}
                {p.profile.kwai && <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm">Kwai · {p.profile.kwai}</span>}
                {p.profile.mediaKitUrl && (
                  <a href={p.profile.mediaKitUrl} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:shadow-sm">
                    <FileText className="size-4" /> Mídia kit
                  </a>
                )}
                {p.contact.phone && whatsappChatUrl(p.contact.phone) && (
                  <a href={whatsappChatUrl(p.contact.phone)!} target="_blank" rel="noopener noreferrer" className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:shadow-sm">
                    <WhatsAppIcon className="size-4 text-emerald-600" /> {p.contact.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
          {p.canViewAs && (
            <form action={viewAsAction} data-tour="fi-vercomo" className="flex items-center gap-1">
              <input type="hidden" name="creatorId" value={p.id} />
              <button className={ui.ghost}><Eye className="size-4" /> Ver o portal como ela</button>
              <HelpTip id="fi-vercomo" />
            </form>
          )}
        </div>
        {(() => {
          const c = p.coupons.find((x) => !x.until && x.kind === "CREATOR") ?? p.coupons.find((x) => !x.until);
          return c ? (
            <div className={`${ui.inset} flex flex-wrap items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className="text-xs text-stone-500">Cupom e link dela</p>
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-lg font-bold tracking-wide">{c.code}</span>
                  <span className="truncate font-mono text-xs text-stone-500">{linkBase}{c.code}</span>
                </p>
              </div>
              <CopyButton value={`${linkBase}${c.code}`} label="Copiar link" />
            </div>
          ) : null;
        })()}
        {numbers && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Vendas em 30 dias" value={formatBRL(numbers.last30.salesCents)} hint={`${numbers.last30.orders} ${numbers.last30.orders === 1 ? "pedido pago" : "pedidos pagos"}`} />
            <Kpi label="Ticket médio" value={formatBRL(numbers.last30.ticketCents)} hint="últimos 30 dias" />
            <Kpi label="Aguardando pagamento" value={formatBRL(numbers.pending.salesCents)} hint={`${numbers.pending.orders} ${numbers.pending.orders === 1 ? "pedido" : "pedidos"}${numbers.pending.commissionCents !== null ? ` · ≈ ${formatBRL(numbers.pending.commissionCents)} de comissão` : ""}`} />
            {st && !ugcOnly ? <Kpi label="Disponível para saque" value={formatBRL(st.balance.availableCents)} tone={st.balance.availableCents < 0 ? "red" : undefined} hint={`saldo ${formatBRL(st.balance.totalCents)}`} /> : <Kpi label="Comissão estornada" value={formatBRL(numbers.reversedCents)} />}
          </div>
        )}
      </section>

      <Tabs
        initial={st?.month && mes ? "extrato" : undefined}
        tabs={[
          {
            id: "resumo",
            label: "Resumo",
            content: (
              <>
      {st && !ugcOnly && (
        <Card title="Saldo" icon={<Receipt className="size-4" />} help="fi-saldo">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Saldo" value={formatBRL(st.balance.totalCents)} tone={st.balance.totalCents < 0 ? "red" : undefined} />
            <Kpi label="A liberar" value={formatBRL(st.balance.heldCents)} />
            <Kpi label="Em saque" value={formatBRL(st.balance.reservedCents)} />
            <Kpi label="Disponível" value={formatBRL(st.balance.availableCents)} tone={st.balance.availableCents < 0 ? "red" : undefined} />
          </div>
          <ReleaseProgressBar r={st.release} />
          <p className={ui.hint}>
            {st.release.minCents === null
              ? "Contrato sem comissão (permuta)"
              : `Comissão liberada no fechamento do mês (dia 1) quando as vendas acumuladas chegam a ${formatBRL(st.release.minCents)}`}
            {st.releasedThrough ? `; liberada até ${st.releasedThrough.slice(5)}/${st.releasedThrough.slice(0, 4)}` : "; nada liberado ainda"}. Venda conta no mês do pagamento.
          </p>
        </Card>
      )}
      {ret && !ugcOnly && (
        <Card title={`Retorno (últimos ${returnDays} dias)`} icon={<TrendingUp className="size-4" />} help="fi-retorno">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Receita" value={formatBRL(ret.revenueCents)} hint={`${ret.orders} pedidos`} />
            <Kpi label="Custos" value={formatBRL(ret.cogsCents + ret.commissionCents + ret.kitsCents + ret.freightCents)} hint={`produtos ${formatBRL(ret.cogsCents)} · comissão ${formatBRL(ret.commissionCents)} · kits e frete ${formatBRL(ret.kitsCents + ret.freightCents)}`} />
            <Kpi label="Lucro que deixa" value={formatBRL(ret.profitCents)} tone={ret.profitCents < 0 ? "red" : undefined} hint={ret.unitsWithoutCost ? `${ret.unitsWithoutCost} un. sem custo na Shopify` : undefined} />
            <Kpi
              label="Clientes"
              value={ret.customers.unknown < ret.orders ? `${ret.customers.new} novas` : "—"}
              hint={ret.customers.unknown < ret.orders ? `${ret.customers.returning} recorrentes${ret.customers.unknown ? ` · ${ret.customers.unknown} sem dado` : ""}` : "precisa de read_customers no app"}
            />
          </div>
        </Card>
      )}
                <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                  <div className="flex min-w-0 flex-col gap-6">
          {!p.reviewedAt && !ugcOnly && (
            <Card title="Conferência da Ana" icon={<ClipboardCheck className="size-4" />} help="fi-conferencia">
              {p.reviewedAt ? (
                <p className={ui.ok}>Números conferidos em {date(p.reviewedAt)}. O Pagamento já pode aprovar o saldo de abertura.</p>
              ) : (
                <>
                  <p className={ui.muted}>Ainda não conferida. Depois de conferir cupons, taxa e vendas, marque aqui: libera o saldo de abertura (saque) para o Pagamento.</p>
                  {p.canEdit && <ReviewedButton creatorId={p.id} />}
                </>
              )}
            </Card>
          )}
          {p.ugcCycle && <UgcVideosCard creatorId={p.id} status={p.status} canEdit={p.canEdit} cycle={p.ugcCycle} videos={p.ugcVideos} legacy={p.ugc} />}
          <Card title="Cupom, comissão e desconto" icon={<Ticket className="size-4" />} help="fi-cupons">
            {p.coupons.length === 0 && <p className={ui.muted}>Nenhum.</p>}
            <ul className={ui.list}>
              {p.coupons.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
                  <span className="flex flex-col gap-1">
                    <span>
                    <span className="font-mono font-semibold">{c.code}</span>
                    <span className={`${ui.hint} ml-2`}>desde {date(c.since)}{c.until && ` até ${date(c.until)}`}</span>
                    </span>
                    {/* M0.2: o link que ela divulga (rastreado, D-LINK), pronto para copiar. */}
                    {!c.until && c.kind === "CREATOR" && (
                      <span className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs text-stone-500">{linkBase}{c.code}</span>
                        <CopyButton value={`${linkBase}${c.code}`} label="Copiar link" />
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1.5">
                    {!c.until && c.discountBps !== null && <span className={badge.sky}>{pct(c.discountBps)} de desconto</span>}
                    <span className={badge.neutral}>{c.kind ?? "sem tipo"}</span>
                    <span className={c.confirmed ? badge.green : badge.amber}>{c.confirmed ? "dona confirmada" : "dona a confirmar"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* D-RATEDISCOUNT: comissão e desconto do cupom, editáveis aqui. */}
            <div className={`${ui.inset} flex flex-col gap-2`}>
              {(() => {
          const c = p.coupons.find((x) => !x.until && x.kind === "CREATOR");
          const rate = p.policies.find((x) => !x.until) ?? null;
          const locked = !rate ? "Sem taxa definida: defina na aba Cadastro." : !rate.confirmed ? "Confirme a taxa atual na conferência antes de mudar." : null;
          return ugcOnly && !c ? null : (
            <PricingEditor creatorId={p.id} rateBps={rate?.rateBps ?? null} discountBps={c?.discountBps ?? null} coupon={c?.code ?? null} canEdit={p.canEdit && p.status !== "DEACTIVATED"} rateLocked={locked} />
          );
        })()}
            </div>
            {p.canEdit && p.status !== "DEACTIVATED" && (p.coupons.some((x) => !x.until && x.kind === "CREATOR") ? (
              <details>
                <summary className="cursor-pointer text-sm text-stone-500 hover:underline">Criar outro cupom</summary>
                <div className="mt-2"><CouponCreateForm creatorId={p.id} /></div>
              </details>
            ) : (
              <CouponCreateForm creatorId={p.id} />
            ))}
            <Link href="/admin/cupons" className={`${ui.link} text-sm`}>Abrir a conferência de cupons</Link>
          </Card>
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">
                    <Timeline events={timeline.slice(0, 8)} creatorId={p.id} canEdit={p.canEdit} />
                  </div>
                </div>
              </>
            ),
          },
          ...(st && !ugcOnly ? [{ id: "extrato", label: "Extrato", content: <>
          {st && !ugcOnly && (
            <Card title="Extrato" icon={<Receipt className="size-4" />} help="fi-extrato">
              {st.months.length > 0 && (
                <nav aria-label="Mês" className="flex flex-wrap gap-2">
                  {st.months.map((m) => (
                    <Link key={m.month} href={`/admin/creators/${p.id}?mes=${m.month}`} className={m.month === st.month ? ui.pillOn : ui.pill}>
                      {m.month.slice(5)}/{m.month.slice(2, 4)} · {formatBRL(m.totalCents)}
                    </Link>
                  ))}
                </nav>
              )}
              {st.lines.length === 0 ? (
                <p className={ui.muted}>Nenhum lançamento.</p>
              ) : (
                <ul className={ui.list}>
                  {st.lines.map((l) => (
                    <li key={l.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {LEDGER_LABEL[l.type]}
                          {l.orderName && <span className="font-normal text-stone-500"> · pedido {l.orderName}</span>}
                        </p>
                        <p className={ui.hint}>
                          {date(l.orderPaidAt ?? l.createdAt)}
                          {l.baseCents !== null && l.rateBps !== null && ` · ${pct(l.rateBps)} de ${formatBRL(l.baseCents)}`}
                          {l.held && " · a liberar"}
                          {l.note && ` · ${l.note}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${l.amountCents < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                        {formatBRL(l.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          </> }] : []),
          {
            id: "contrato",
            label: "Contrato",
            content: (
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <div className="flex min-w-0 flex-col gap-6">
          <Card title="Contrato e checklist" icon={<FileSignature className="size-4" />} help="fi-contrato">
            {p.contract.status === "EXPIRED" && <p className="text-sm font-medium text-red-700 dark:text-red-400">Contrato vencido em {dmy(p.contract.end)}: renovar ou encerrar.</p>}
            {p.contract.status === "EXPIRING" && (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Contrato vence em {p.contract.daysLeft} {p.contract.daysLeft === 1 ? "dia" : "dias"} ({dmy(p.contract.end)}).
              </p>
            )}
            {p.idle && (
              <p className={p.idle.idle ? "text-sm font-medium text-amber-700 dark:text-amber-300" : ui.muted}>
                {p.idle.lastSaleDay ? `Última venda em ${dmy(p.idle.lastSaleDay)}` : "Ainda não vendeu"}
                {(p.idle.lastSaleDay === null || p.idle.days > 0) && ` · ${p.idle.days} ${p.idle.days === 1 ? "dia" : "dias"} sem vender`}
                {p.idle.idle && ": falar com a creator."}
              </p>
            )}
            {p.canEdit ? (
              <ChecklistForm creatorId={p.id} c={p.contract} templates={p.contractTemplates} noPayout={ugcOnly} />
            ) : (
              <p className="text-sm">
                {p.contractTemplates.find((t) => t.id === p.contract.templateId)?.name ?? "Modelo padrão da marca"} ·{" "}
                {p.contract.start ? `${dmy(p.contract.start)} a ${dmy(p.contract.end)}` : "sem datas de contrato"}
                {!ugcOnly && (p.contract.receivesAsIndividual ? " · Creator CPF (saque com recibo)" : " · Creator CNPJ (saque com nota)")}
              </p>
            )}
            {p.notes && <p className={ui.hint}>Obs.: {p.notes}</p>}
          </Card>
                </div>
                <div className="flex min-w-0 flex-col gap-6">
          {(contract.required || contract.signature) && (
            <Card title="Contrato no portal" icon={<FileSignature className="size-4" />}>
              {contract.signature ? (
                <>
                  <p className={ui.ok}>
                    Assinou o contrato {CONTRACT_KIND_LABEL[contract.signature.kind as ContractKind] ?? contract.signature.kind} (versão {contract.signature.version}) em {date(contract.signature.at)}.
                  </p>
                  <p className={ui.hint}>Registro: {contract.signature.name} · CPF {contract.signature.cpf}{contract.signature.ip ? ` · IP ${contract.signature.ip}` : ""}</p>
                  {p.fiscal && <Link href={`/admin/creators/${p.id}/contrato`} className={`${ui.link} text-sm`}>Ler o contrato assinado</Link>}
                </>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Ainda não assinou. O portal pede a assinatura no primeiro acesso{p.contract.templateId ? "" : " (escolha a versão do contrato em \"Contrato e checklist\")"}.
                </p>
              )}
            </Card>
          )}
          {terms.currentVersion !== null && !ugcOnly && (
            <Card title="Termo de aceite" icon={<FileSignature className="size-4" />}>
              {terms.last?.version === terms.currentVersion ? (
                <p className={ui.ok}>Aceitou a versão {terms.last.version} em {date(terms.last.at)}.</p>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Ainda não aceitou a versão {terms.currentVersion}{terms.last ? ` (aceitou a ${terms.last.version} em ${date(terms.last.at)})` : ""}. O portal pede o aceite no próximo acesso.
                </p>
              )}
              {terms.last && <p className={ui.hint}>Registro: {terms.last.name} · CPF {terms.last.cpf}{terms.last.ip ? ` · IP ${terms.last.ip}` : ""}</p>}
            </Card>
          )}
                </div>
              </div>
            ),
          },
          {
            id: "cadastro",
            label: "Cadastro",
            content: (
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <div className="flex min-w-0 flex-col gap-6">
          <Card title="Contato" icon={<UserRound className="size-4" />}>
            {p.canEdit ? (
              <ContactForm creatorId={p.id} name={p.contact.name} email={p.contact.email} phone={p.contact.phone} fakeEmail={p.contact.fakeEmail} instagram={p.instagram} tiktok={p.tiktok} birthDate={p.birthDate} />
            ) : (
              <p className="text-sm">{p.contact.fakeEmail ? "e-mail a confirmar" : p.contact.email} · {p.contact.phone ?? "sem telefone"}</p>
            )}
            {(p.instagram || p.contact.phone) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {p.instagram && <InstagramLink handle={p.instagram} />}
                {p.contact.phone && <WhatsappLink phone={p.contact.phone} />}
              </div>
            )}
            {p.fiscal && (
              <div className={`${ui.inset} grid gap-1 text-sm`}>
                <p><span className="text-stone-500">CPF</span> {p.fiscal.cpf ?? "—"}</p>
                <p><span className="text-stone-500">CNPJ</span> {p.fiscal.cnpj ?? "—"}</p>
                <p><span className="text-stone-500">Pix</span> {p.fiscal.pixKey ?? "—"}</p>
              </div>
            )}
            {p.address && (
              <div className={`${ui.inset} grid gap-1 text-sm`}>
                <p className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-stone-500" />
                  <span className="text-stone-500">Endereço de entrega</span>
                  {p.address.lines.length > 0 && !p.address.confirmed && <span className={badge.amber}>a confirmar pela creator</span>}
                </p>
                {p.address.lines.length ? p.address.lines.map((l) => <p key={l}>{l}</p>) : <p className="text-stone-500">Nenhum endereço no sistema.</p>}
              </div>
            )}
          </Card>
          {/* M4.4b (D-ACCESS): último acesso ao portal e nova senha. */}
          {p.userId && (
            <Card title="Acesso ao portal" icon={<KeyRound className="size-4" />}>
              <AccessBox userId={p.userId} lastSeenAt={p.lastSeenAt} canReset={p.canEdit} name={p.contact.name} phone={p.contact.phone} />
            </Card>
          )}
          {/* M4.3 (D-PROFILEFIELDS): perfil opcional. */}
          <Card title="Perfil" icon={<Sparkles className="size-4" />}>
            {p.canEdit ? (
              <ProfileForm creatorId={p.id} p={p.profile} />
            ) : (
              <div className="grid gap-1 text-sm">
                <p><span className="text-stone-500">Nicho</span> {p.profile.niches.join(", ") || "—"}</p>
                <p><span className="text-stone-500">Registro</span> {p.profile.professionalId ?? "—"}</p>
                <p><span className="text-stone-500">Alergias/restrições</span> {p.profile.allergies ?? "—"}</p>
              </div>
            )}
          </Card>
          {p.canEdit && !p.hasLogin && (
            <div id="convite" className="scroll-mt-24">
            <Card title="Convite para o portal" icon={<Mail className="size-4" />}>
              {p.contact.fakeEmail ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">Salve o e-mail real antes de convidar.</p>
              ) : (
                <InviteButton creatorId={p.id} accountId={p.accountId} />
              )}
            </Card>
            </div>
          )}
                </div>
                <div className="flex min-w-0 flex-col gap-6">
          {p.canEdit && (
            <Card title="Situação">
              {!p.archivedAt && <StatusForm creatorId={p.id} status={p.status} labels={STATUS_LABEL} />}
              <ArchiveForm creatorId={p.id} archived={p.archivedAt !== null} />
            </Card>
          )}
          {!ugcOnly && (
            <Card title="Taxa de comissão" icon={<Percent className="size-4" />} help="fi-taxa">
              {p.policies.length === 0 && <p className={ui.muted}>Nenhuma taxa definida.</p>}
              <ul className={ui.list}>
                {p.policies.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
                    <span>
                      <span className="text-lg font-semibold">{pct(t.rateBps)}</span>
                      <span className={`${ui.hint} ml-2`}>desde {date(t.since)}{t.until && ` até ${date(t.until)}`}</span>
                    </span>
                    <span className={t.confirmed ? badge.green : badge.amber}>{t.confirmed ? "confirmada" : "a confirmar"}</span>
                  </li>
                ))}
              </ul>
              {p.canEdit && p.policies[0]?.confirmed && !p.policies[0].until && (
                <>
                  <p className={ui.hint}>Mudar a taxa vale só para pedidos pagos depois da mudança; o passado não muda.</p>
                  <RateChangeForm creatorId={p.id} />
                </>
              )}
              {p.canAdjust && !p.withdrawalsUnlocked && p.policies.length === 1 && (
                <div className={`${ui.inset} flex flex-col gap-2`}>
                  <p className={ui.hint}>
                    Taxa errada desde o começo (veio do app antigo)? Corrija para todos os pedidos: a diferença entra no extrato como
                    estorno ou comissão. Só enquanto o saque está travado.
                  </p>
                  <RateFixForm creatorId={p.id} />
                </div>
              )}
            </Card>
          )}
          {p.adjustments && !ugcOnly && (
            <Card title="Ajustes manuais" icon={<Scale className="size-4" />} help="fi-ajustes">
              {p.adjustments.length === 0 && <p className={ui.muted}>Nenhum.</p>}
              <ul className={ui.list}>
                {p.adjustments.map((a, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2.5 text-sm first:pt-0">
                    <span>{date(a.at)} · {a.reason}</span>
                    <span className="font-semibold tabular-nums">{formatBRL(a.amountCents)}</span>
                  </li>
                ))}
              </ul>
              {p.canAdjust && (
                <>
                  <p className={ui.hint}>Só super admin. Cada ajuste é uma linha nova no extrato; para corrigir, lance outro.</p>
                  <AdjustForm creatorId={p.id} requestId={requestId} />
                </>
              )}
            </Card>
          )}
                </div>
              </div>
            ),
          },
          // M4.6 (D-POSTS): posts dela, vendas depois de cada um; a Gestão registra em nome dela.
          {
            id: "conteudo",
            label: "Conteúdo",
            badge: posts.length,
            content: (
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
                <Card title="Posts">
                  <PostList posts={posts} canRemove={p.canEdit} />
                </Card>
                {p.canEdit && (
                  <Card title="Registrar post">
                    <PostForm creatorId={p.id} today={today} campaigns={postCampaigns} />
                  </Card>
                )}
              </div>
            ),
          },
          { id: "historico", label: "Linha do tempo", badge: timeline.length, content: <Timeline events={timeline} creatorId={p.id} canEdit={p.canEdit} /> },
        ]}
      />
    </>
  );
}
