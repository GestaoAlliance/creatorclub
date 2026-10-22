import { Plus, Store } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { formatCnpj } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { brandList } from "@/lib/brands/manage";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { ALL_BRANDS_PARAM } from "@/lib/staff/nav";
import { BrandForm } from "./forms";

export const dynamic = "force-dynamic";

// Marcas da Alliance (A1b, D-ALLIANCE): cadastrar e editar. Só super admin. Em "Todas as marcas" (?todas=1) aparecem
// todas e a criação de marca nova; dentro de uma marca, só a marca escolhida no topo (pedido do responsável).
export default async function MarcasPage({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/marcas");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/admin");
  const all = (await searchParams)[ALL_BRANDS_PARAM] === "1";
  const { brand } = await staffContext(actor);
  const brands = (await brandList(db(), actor)).filter((b) => all || b.id === brand?.id);
  return (
    <>
      <PageHeader title={all ? "Marcas" : `Marca ${brand?.name ?? ""}`}>
        {all ? (
          <>
            As marcas da Alliance no Creator Club. Cada uma tem a própria loja Shopify, creators, cupons, equipe, termo e
            contratos. Para começar uma marca: criar aqui, escolher a marca no topo, conectar a loja em Shopify e publicar o
            termo e os contratos.
          </>
        ) : (
          <>
            Os dados da {brand?.name} e o que falta para ela funcionar inteira.{" "}
            <Link href={`/admin/marcas?${ALL_BRANDS_PARAM}=1`} className={ui.link}>Ver todas as marcas</Link>
          </>
        )}
      </PageHeader>
      {brands.map((b) => {
        const steps = [
          { done: b.store?.status === "CONNECTED", label: "loja conectada" },
          { done: b._count.termsVersions > 0, label: "termo publicado" },
          { done: b._count.contractDocuments > 0, label: "contratos publicados" },
          { done: b._count.contractTemplates > 0, label: "versões de contrato" },
          { done: Boolean(b.nfTakerDocument), label: "CNPJ para a nota" },
          { done: Boolean(b.storeUrl), label: "site da loja" },
        ];
        return (
          <Card key={b.id} title={b.name} icon={<span className="size-4 rounded-full" style={{ background: b.primaryColor }} />}>
            <div className="flex flex-wrap gap-1.5">
              {steps.map((s) => <span key={s.label} className={s.done ? badge.green : badge.amber}>{s.done ? "✓" : "falta"} {s.label}</span>)}
              <span className={badge.neutral}>{b.activeCreators} creators ativas</span>
              {b.store?.externalId && <span className={badge.neutral}><Store className="mr-1 inline size-3" />{b.store.externalId}</span>}
            </div>
            <details>
              <summary className={`${ui.h2} cursor-pointer text-sm`}>Editar dados</summary>
              <div className="mt-3">
                <BrandForm initial={{ brandId: b.id, name: b.name, slug: b.slug, primaryColor: b.primaryColor, legalName: b.legalName ?? "", cnpj: b.nfTakerDocument ? formatCnpj(b.nfTakerDocument) : "", storeUrl: b.storeUrl ?? "" }} />
              </div>
            </details>
          </Card>
        );
      })}
      {all && (
        <Card title="Nova marca" icon={<Plus className="size-4" />}>
          <BrandForm create initial={{ name: "", slug: "", primaryColor: "#18181B", legalName: "", cnpj: "", storeUrl: "" }} />
        </Card>
      )}
    </>
  );
}
