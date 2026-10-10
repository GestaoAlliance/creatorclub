import { ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { currentActor } from "@/lib/auth/current";
import { ContractSignError, creatorContractSignature, signedContractText } from "@/lib/contracts/sign";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

// Contrato assinado no portal (D-SIGNCONTRACT): o texto exatamente como a creator assinou, com o registro da assinatura.
export default async function ContratoAssinadoPage({ params }: PageProps<"/admin/creators/[id]/contrato">) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/admin/creators/${id}/contrato`);
  const { signature } = await creatorContractSignature(db(), id);
  if (!signature) notFound();
  let s;
  try {
    s = await signedContractText(db(), actor, signature.id);
  } catch (error) {
    if (error instanceof ContractSignError) notFound();
    throw error;
  }
  if (s.creatorId !== id) notFound();
  return (
    <>
      <PageHeader title="Contrato assinado">
        <Link href={`/admin/creators/${id}`} className={ui.link}>Voltar para a ficha</Link>
      </PageHeader>
      <Card title={`${s.contractDocument.title} · versão ${s.contractDocument.version}`} icon={<ScrollText className="size-4" />}>
        <p className={ui.hint}>
          Assinado eletronicamente por {s.fullName} em {when(s.signedAt)}{s.ip ? ` · IP ${s.ip}` : ""}{s.userAgent ? ` · ${s.userAgent}` : ""}.
        </p>
        <div className={`${ui.inset} whitespace-pre-line text-sm leading-relaxed`}>{s.body}</div>
        <p className={`${ui.hint} break-all font-mono`}>SHA-256 do texto: {s.bodySha256}</p>
      </Card>
    </>
  );
}
