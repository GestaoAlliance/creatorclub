import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { creatorProfile, ProfileError, STATUS_LABEL } from "@/lib/creators/profile";
import { randomUUID } from "node:crypto";
import { formatBRL } from "@/domain";
import { creatorStatement, LEDGER_LABEL, StatementError } from "@/lib/commission/statement";
import { viewAsAction } from "@/app/portal/actions";
import { AdjustForm, ContactForm, InviteButton, RateChangeForm, ReviewedButton, StatusForm } from "./forms";

export const dynamic = "force-dynamic";

const date = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;

// Ficha da creator (E4.4). Tela simples (D-ADMINUI).
export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/creators/${id}`);
  let p;
  try {
    p = await creatorProfile(db(), actor, id);
  } catch (error) {
    if (error instanceof ProfileError) notFound();
    throw error;
  }
  let st = null;
  if (p.adjustments) {
    try {
      st = await creatorStatement(db(), actor, id, mes ? { month: mes } : {});
    } catch (error) {
      if (!(error instanceof StatementError)) throw error;
      st = await creatorStatement(db(), actor, id);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <div>
        <Link href="/admin/creators" className="text-sm underline">← Creators</Link>
        <h1 className="mt-2 text-2xl font-bold">{p.contact.name}</h1>
        <p className="text-sm text-stone-600">
          {STATUS_LABEL[p.status]} · {p.hasLogin ? "já entrou no portal" : "ainda sem acesso ao portal"}
          {p.contact.fakeEmail && <span className="text-amber-700"> · e-mail a confirmar</span>}
        </p>
        {p.canViewAs && (
          <form action={viewAsAction} className="mt-3">
            <input type="hidden" name="creatorId" value={p.id} />
            <button className="rounded border border-stone-300 px-3 py-2 text-sm">Ver o portal como esta creator (só leitura)</button>
          </form>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Contato</h2>
        {p.canEdit ? (
          <ContactForm creatorId={p.id} name={p.contact.name} email={p.contact.email} phone={p.contact.phone} fakeEmail={p.contact.fakeEmail} />
        ) : (
          <p className="text-sm">{p.contact.fakeEmail ? "e-mail a confirmar" : p.contact.email} · {p.contact.phone ?? "sem telefone"}</p>
        )}
        {p.fiscal && (
          <p className="text-sm text-stone-600">CPF: {p.fiscal.cpf ?? "—"} · CNPJ: {p.fiscal.cnpj ?? "—"} · Pix: {p.fiscal.pixKey ?? "—"}</p>
        )}
      </section>

      {p.canEdit && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Situação</h2>
          <StatusForm creatorId={p.id} status={p.status} labels={STATUS_LABEL} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Conferência da Ana</h2>
        {p.reviewedAt ? (
          <p className="text-sm text-green-800">Números conferidos em {date(p.reviewedAt)}. O Pagamento já pode aprovar o saldo de abertura.</p>
        ) : (
          <>
            <p className="text-sm text-stone-600">Ainda não conferida. Depois de conferir cupons, taxa e vendas, marque aqui: libera o saldo de abertura (saque) para o Pagamento.</p>
            {p.canEdit && <ReviewedButton creatorId={p.id} />}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Cupons</h2>
        {p.coupons.length === 0 && <p className="text-sm text-stone-500">Nenhum.</p>}
        {p.coupons.map((c, i) => (
          <p key={i} className="text-sm">
            <span className="font-mono">{c.code}</span> · {c.kind ?? "sem tipo"} · desde {date(c.since)}
            {c.until && ` até ${date(c.until)}`} · {c.confirmed ? "dona confirmada" : <span className="text-amber-700">dona a confirmar</span>}
          </p>
        ))}
        <Link href="/admin/cupons" className="text-sm underline">Conferência de cupons</Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Taxa de comissão</h2>
        {p.policies.map((t, i) => (
          <p key={i} className="text-sm">
            {pct(t.rateBps)} · desde {date(t.since)}{t.until && ` até ${date(t.until)}`} ·{" "}
            {t.confirmed ? "confirmada" : <span className="text-amber-700">a confirmar (na conferência)</span>}
          </p>
        ))}
        {p.canEdit && p.policies[0]?.confirmed && !p.policies[0].until && (
          <>
            <p className="text-xs text-stone-500">Mudar a taxa vale só para pedidos pagos depois da mudança; o passado não muda.</p>
            <RateChangeForm creatorId={p.id} />
          </>
        )}
      </section>

      {st && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Saldo e extrato</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Saldo", st.balance.totalCents],
              ["A liberar", st.balance.heldCents],
              ["Em saque", st.balance.reservedCents],
              ["Disponível", st.balance.availableCents],
            ].map(([label, cents]) => (
              <div key={label} className="rounded border border-stone-200 p-2">
                <dt className="text-stone-500">{label}</dt>
                <dd className={`font-semibold ${(cents as number) < 0 ? "text-red-700" : ""}`}>{formatBRL(cents as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-stone-500">
            Comissão fica a liberar por {st.holdDays} dias depois do pagamento do pedido. Venda conta no mês do pagamento.
          </p>
          {st.months.length > 0 && (
            <nav className="flex flex-wrap gap-2 text-sm">
              {st.months.map((m) => (
                <Link
                  key={m.month}
                  href={`/admin/creators/${p.id}?mes=${m.month}`}
                  className={m.month === st.month ? "font-semibold" : "underline"}
                >
                  {m.month.slice(5)}/{m.month.slice(0, 4)} ({formatBRL(m.totalCents)})
                </Link>
              ))}
            </nav>
          )}
          {st.lines.length === 0 && <p className="text-sm text-stone-500">Nenhum lançamento.</p>}
          {st.lines.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1">Data</th>
                  <th>Lançamento</th>
                  <th className="text-right">Valor</th>
                  <th>Libera</th>
                </tr>
              </thead>
              <tbody>
                {st.lines.map((l) => (
                  <tr key={l.id} className="border-t border-stone-100 align-top">
                    <td className="py-1">{date(l.orderPaidAt ?? l.createdAt)}</td>
                    <td>
                      {LEDGER_LABEL[l.type]}
                      {l.orderName && ` · pedido ${l.orderName}`}
                      {l.baseCents !== null && l.rateBps !== null && (
                        <span className="text-stone-500"> · {pct(l.rateBps)} de {formatBRL(l.baseCents)}</span>
                      )}
                      {l.note && <span className="text-stone-500"> · {l.note}</span>}
                    </td>
                    <td className={`text-right ${l.amountCents < 0 ? "text-red-700" : ""}`}>{formatBRL(l.amountCents)}</td>
                    <td>{l.held ? date(l.availableAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {p.adjustments && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Ajustes manuais</h2>
          {p.adjustments.length === 0 && <p className="text-sm text-stone-500">Nenhum.</p>}
          {p.adjustments.map((a, i) => (
            <p key={i} className="text-sm">{date(a.at)} · {formatBRL(a.amountCents)} · {a.reason}</p>
          ))}
          {p.canAdjust && (
            <>
              <p className="text-xs text-stone-500">Só super admin. Cada ajuste é uma linha nova no extrato; para corrigir, lance outro.</p>
              <AdjustForm creatorId={p.id} requestId={randomUUID()} />
            </>
          )}
        </section>
      )}

      {p.canEdit && !p.hasLogin && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Convite para o portal</h2>
          {p.contact.fakeEmail ? (
            <p className="text-sm text-amber-700">Salve o e-mail real antes de convidar.</p>
          ) : (
            <InviteButton creatorId={p.id} accountId={p.accountId} />
          )}
        </section>
      )}
    </main>
  );
}
