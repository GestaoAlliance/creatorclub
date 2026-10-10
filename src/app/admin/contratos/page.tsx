import { FilePen, Hourglass, ScrollText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { CONTRACT_FIELDS, CONTRACT_KIND_LABEL } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { contractsOverview } from "@/lib/contracts/sign";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { PublishContractForm } from "./form";

export const dynamic = "force-dynamic";

const date = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Contratos assinados no portal (D-SIGNCONTRACT): texto de cada tipo, em versões, e quem ainda falta assinar. Só super admin.
export default async function ContratosPage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/contratos");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/conta");
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const o = await contractsOverview(db(), actor, brand.id);
  return (
    <>
      <PageHeader title="Contratos">
        Quem é aprovada em Candidatas assina o contrato no primeiro acesso ao portal da {brand.name}, com os dados dela já
        preenchidos. O tipo de texto vem da versão de contrato escolhida na aprovação. Quem já assinou guarda o texto que assinou.
      </PageHeader>
      <Card title={`Falta assinar (${o.waiting.length})`} icon={<Hourglass className="size-4" />}>
        {o.waiting.length === 0 ? (
          <p className={ui.muted}>Ninguém esperando assinatura.</p>
        ) : (
          <ul className={ui.list}>
            {o.waiting.map((w) => (
              <li key={w.id} className={`${ui.row} flex flex-wrap items-center justify-between gap-2`}>
                <Link href={`/admin/creators/${w.id}`} className={ui.link}>{w.name}</Link>
                <span className={ui.hint}>{w.template ?? "sem versão de contrato"} · aprovada em {date(w.since)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {o.kinds.map((k) => (
        <Card key={k.kind} title={`${CONTRACT_KIND_LABEL[k.kind]}${k.current ? ` · versão ${k.current.version}` : ""}`} icon={<ScrollText className="size-4" />}>
          {k.current ? (
            <>
              <p className="font-medium">{k.current.title}</p>
              <div className={`${ui.inset} max-h-80 overflow-y-auto whitespace-pre-line text-sm leading-relaxed`}>{k.current.body}</div>
              <p className={ui.hint}>
                {k.versions.map((v) => `v${v.version} (${date(v.createdAt)}, ${v.signatures} ${v.signatures === 1 ? "assinatura" : "assinaturas"})`).join(" · ")}
              </p>
            </>
          ) : (
            <p className={ui.muted}>Nenhum texto publicado: quem tem este tipo de contrato não é travada até haver um.</p>
          )}
          <details>
            <summary className={`${ui.h2} cursor-pointer`}><FilePen className="size-4" /> {k.current ? "Editar e publicar nova versão" : "Publicar o texto"}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className={ui.hint}>
                Campos preenchidos com os dados de cada creator: {Object.entries(CONTRACT_FIELDS).map(([f, d]) => `{{${f}}} ${d}`).join(" · ")}.
              </p>
              <PublishContractForm brandId={brand.id} kind={k.kind} title={k.current?.title ?? ""} body={k.current?.body ?? ""} />
            </div>
          </details>
        </Card>
      ))}
    </>
  );
}
