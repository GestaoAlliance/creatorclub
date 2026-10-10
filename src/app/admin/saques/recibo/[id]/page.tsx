import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { receiptFor, WithdrawalDecisionError } from "@/lib/withdrawals/decide";

export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Recibo aceito pela creator pessoa física (D-PFRECEIPT), pronto para imprimir ou salvar em PDF.
export default async function ReceiptPage({ params }: PageProps<"/admin/saques/recibo/[id]">) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/saques/recibo/${id}`);
  let r;
  try {
    r = await receiptFor(db(), actor, id);
  } catch (error) {
    if (error instanceof WithdrawalDecisionError) notFound();
    throw error;
  }
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 rounded-3xl bg-white p-8 text-stone-900 shadow-sm print:shadow-none">
      <div className="whitespace-pre-line leading-relaxed">{r.body}</div>
      <p className="border-t border-stone-200 pt-4 text-xs text-stone-500">
        Aceito eletronicamente no portal em {when(r.acceptedAt)}{r.ip ? ` · IP ${r.ip}` : ""}. Nome completo e CPF digitados pela creator.
      </p>
    </article>
  );
}
