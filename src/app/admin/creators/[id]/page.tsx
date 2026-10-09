import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { creatorProfile, ProfileError, STATUS_LABEL } from "@/lib/creators/profile";
import { ContactForm, InviteButton, RateChangeForm, StatusForm } from "./forms";

export const dynamic = "force-dynamic";

const date = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const pct = (bps: number) => `${(bps / 100).toString().replace(".", ",")}%`;

// Ficha da creator (E4.4). Tela simples (D-ADMINUI).
export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/creators/${id}`);
  let p;
  try {
    p = await creatorProfile(db(), actor, id);
  } catch (error) {
    if (error instanceof ProfileError) notFound();
    throw error;
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
