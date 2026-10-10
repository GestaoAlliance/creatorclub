import { ArrowLeft, ClipboardCheck, FileSignature, Eye, Mail, Percent, Receipt, Scale, Ticket, UserRound } from "lucide-react";
import Link from "next/link";
import { Card, Kpi } from "@/components/ui/page";
import { ReleaseProgressBar } from "@/components/ui/release-progress";
import { badge, ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import { viewAsAction } from "@/app/portal/actions";
import { LEDGER_LABEL, type creatorStatement } from "@/lib/commission/statement";
import { STATUS_LABEL, type creatorProfile } from "@/lib/creators/profile";
import type { creatorTermsStatus } from "@/lib/terms/terms";
import { AdjustForm, ChecklistForm, ContactForm, InviteButton, RateChangeForm, RateFixForm, ReviewedButton, StatusForm } from "./forms";

const date = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dmy = (day: string | null) => (day ? day.split("-").reverse().join("/") : "—");
const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;
const STATUS_BADGE = { ACTIVE: badge.green, INACTIVE: badge.amber, DEACTIVATED: badge.neutral } as const;

type Profile = Awaited<ReturnType<typeof creatorProfile>>;
type Statement = Awaited<ReturnType<typeof creatorStatement>>;
type Terms = Awaited<ReturnType<typeof creatorTermsStatus>>;

/** Ficha da creator (E4.4) no visual do sistema (D-DESIGNALL). Só exibe; os dados vêm da página. */
export function CreatorProfileView({ p, st, terms, requestId }: { p: Profile; st: Statement | null; terms: Terms; requestId: string }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/admin/creators" className={`${ui.link} inline-flex items-center gap-1 self-start text-sm`}>
          <ArrowLeft className="size-4" /> Creators
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-content-center rounded-2xl bg-brand text-lg font-bold text-white shadow-sm">
              {p.contact.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h1 className={ui.title}>{p.contact.name}</h1>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</span>
                <span className={p.hasLogin ? badge.sky : badge.neutral}>{p.hasLogin ? "já entrou no portal" : "ainda sem acesso ao portal"}</span>
                {p.reviewedAt && <span className={badge.green}>conferida pela Ana</span>}
                {p.contact.fakeEmail && <span className={badge.amber}>e-mail a confirmar</span>}
              </div>
            </div>
          </div>
          {p.canViewAs && (
            <form action={viewAsAction}>
              <input type="hidden" name="creatorId" value={p.id} />
              <button className={ui.ghost}><Eye className="size-4" /> Ver o portal como esta creator</button>
            </form>
          )}
        </div>
      </div>

      {st && (
        <Card title="Saldo" icon={<Receipt className="size-4" />}>
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

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Conferência da Ana" icon={<ClipboardCheck className="size-4" />}>
          {p.reviewedAt ? (
            <p className={ui.ok}>Números conferidos em {date(p.reviewedAt)}. O Pagamento já pode aprovar o saldo de abertura.</p>
          ) : (
            <>
              <p className={ui.muted}>Ainda não conferida. Depois de conferir cupons, taxa e vendas, marque aqui: libera o saldo de abertura (saque) para o Pagamento.</p>
              {p.canEdit && <ReviewedButton creatorId={p.id} />}
            </>
          )}
        </Card>

        <Card title="Contrato e checklist" icon={<FileSignature className="size-4" />}>
          {p.contract.status === "EXPIRED" && <p className="text-sm font-medium text-red-700 dark:text-red-400">Contrato vencido em {dmy(p.contract.end)}: renovar ou encerrar.</p>}
          {p.contract.status === "EXPIRING" && (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Contrato vence em {p.contract.daysLeft} {p.contract.daysLeft === 1 ? "dia" : "dias"} ({dmy(p.contract.end)}).
            </p>
          )}
          {p.canEdit ? (
            <ChecklistForm creatorId={p.id} c={p.contract} templates={p.contractTemplates} />
          ) : (
            <p className="text-sm">
              {p.contractTemplates.find((t) => t.id === p.contract.templateId)?.name ?? "Modelo padrão da marca"} ·{" "}
              {p.contract.start ? `${dmy(p.contract.start)} a ${dmy(p.contract.end)}` : "sem datas de contrato"}
            </p>
          )}
          {p.ugc && (
            <div className={`${ui.inset} grid gap-1 text-sm`}>
              <p className="font-medium">UGC</p>
              {p.ugc.videoStatus && <p><span className="text-stone-500">Vídeos</span> {p.ugc.videoStatus}</p>}
              {p.ugc.order && <p><span className="text-stone-500">Pedido</span> {p.ugc.order}</p>}
              {p.ugc.folderUrl && <a href={p.ugc.folderUrl} target="_blank" rel="noreferrer" className={ui.link}>Abrir a pasta dos vídeos</a>}
            </div>
          )}
          {p.notes && <p className={ui.hint}>Obs.: {p.notes}</p>}
        </Card>

        {terms.currentVersion !== null && (
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

        <Card title="Contato" icon={<UserRound className="size-4" />}>
          {p.canEdit ? (
            <ContactForm creatorId={p.id} name={p.contact.name} email={p.contact.email} phone={p.contact.phone} fakeEmail={p.contact.fakeEmail} />
          ) : (
            <p className="text-sm">{p.contact.fakeEmail ? "e-mail a confirmar" : p.contact.email} · {p.contact.phone ?? "sem telefone"}</p>
          )}
          {p.instagram && (
            <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className={`${ui.link} text-sm`}>@{p.instagram}</a>
          )}
          {p.fiscal && (
            <div className={`${ui.inset} grid gap-1 text-sm`}>
              <p><span className="text-stone-500">CPF</span> {p.fiscal.cpf ?? "—"}</p>
              <p><span className="text-stone-500">CNPJ</span> {p.fiscal.cnpj ?? "—"}</p>
              <p><span className="text-stone-500">Pix</span> {p.fiscal.pixKey ?? "—"}</p>
            </div>
          )}
        </Card>

        <Card title="Cupons" icon={<Ticket className="size-4" />}>
          {p.coupons.length === 0 && <p className={ui.muted}>Nenhum.</p>}
          <ul className={ui.list}>
            {p.coupons.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
                <span>
                  <span className="font-mono font-semibold">{c.code}</span>
                  <span className={`${ui.hint} ml-2`}>desde {date(c.since)}{c.until && ` até ${date(c.until)}`}</span>
                </span>
                <span className="flex gap-1.5">
                  <span className={badge.neutral}>{c.kind ?? "sem tipo"}</span>
                  <span className={c.confirmed ? badge.green : badge.amber}>{c.confirmed ? "dona confirmada" : "dona a confirmar"}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/admin/cupons" className={`${ui.link} text-sm`}>Abrir a conferência de cupons</Link>
        </Card>

        <Card title="Taxa de comissão" icon={<Percent className="size-4" />}>
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

        {p.canEdit && (
          <Card title="Situação">
            <StatusForm creatorId={p.id} status={p.status} labels={STATUS_LABEL} />
          </Card>
        )}

        {p.canEdit && !p.hasLogin && (
          <Card title="Convite para o portal" icon={<Mail className="size-4" />}>
            {p.contact.fakeEmail ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">Salve o e-mail real antes de convidar.</p>
            ) : (
              <InviteButton creatorId={p.id} accountId={p.accountId} />
            )}
          </Card>
        )}
      </div>

      {st && (
        <Card title="Extrato" icon={<Receipt className="size-4" />}>
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

      {p.adjustments && (
        <Card title="Ajustes manuais" icon={<Scale className="size-4" />}>
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
    </>
  );
}
