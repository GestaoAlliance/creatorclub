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
import { BrandForm, BrandImage } from "./forms";

export const dynamic = "force-dynamic";

const pct = (bps: number) => String(bps / 100).replace(".", ",");

// Marcas da Alliance (A1b, D-ALLIANCE): cadastrar e editar. Só super admin. Em "Todas as marcas" (?todas=1) aparecem
// todas e a criação de marca nova; dentro de uma marca, só a marca escolhida no topo (pedido do responsável).
/** D-LABEL: remetente gravado (JSON) para o formulário. */
function shipFromInitial(v: unknown) {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, string | null>;
  const g = (k: string) => a[k] ?? "";
  return { zip: g("zip"), street: g("street"), number: g("number"), complement: g("complement"), district: g("district"), city: g("city"), state: g("state"), phone: g("phone") };
}

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
          { done: Boolean(b.nfTakerDocument && b.legalName), label: "dados para a nota" },
          { done: Boolean(b.storeUrl), label: "site da loja" },
          { done: Boolean(b.whatsappInstance), label: "WhatsApp dos avisos" },
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
                <BrandForm initial={{ brandId: b.id, name: b.name, slug: b.slug, primaryColor: b.primaryColor, legalName: b.legalName ?? "", cnpj: b.nfTakerDocument ? formatCnpj(b.nfTakerDocument) : "", storeUrl: b.storeUrl ?? "", nfServiceCode: b.nfServiceCode ?? "", nfServiceDescription: b.nfServiceDescription ?? "", nfInstructions: b.nfInstructions ?? "", whatsappInstance: b.whatsappInstance ?? "", defaultRate: pct(b.defaultCommissionBps), defaultDiscount: pct(b.defaultDiscountBps), approvalSuggestion: b.approvalSuggestion ?? "", shopDiscount: pct(b.shopDiscountBps), financeEmail: b.financeEmail ?? "", bank: { convenio: b.bankConvenio ?? "", agency: b.bankAgency ?? "", agencyDv: b.bankAgencyDv ?? "", account: b.bankAccount ?? "", accountDv: b.bankAccountDv ?? "" }, shipFrom: shipFromInitial(b.shipFrom) }} products={b.products} />
              </div>
            </details>
            {/* M4.4a (D-BRANDLOGIN): a tela de entrar com a cara da marca. */}
            <details>
              <summary className={`${ui.h2} cursor-pointer text-sm`}>Tela de entrar da marca</summary>
              <div className="mt-3 flex flex-col gap-4">
                <p className={ui.hint}>
                  Aparece em <Link href={`/entrar?marca=${b.slug}`} target="_blank" className={ui.link}>/entrar?marca={b.slug}</Link> (link das boas-vindas) e quando a creator volta para o portal da marca.
                </p>
                <BrandImage brandId={b.id} slug={b.slug} kind="LOGO" label="Logo" hint="PNG, JPG ou WebP, até 300 KB. Fundo transparente fica melhor." version={b.assets.find((a) => a.kind === "LOGO")?.sha256.slice(0, 12) ?? null} />
              </div>
            </details>
          </Card>
        );
      })}
      {all && (
        <Card title="Nova marca" icon={<Plus className="size-4" />}>
          <BrandForm create initial={{ name: "", slug: "", primaryColor: "#18181B", legalName: "", cnpj: "", storeUrl: "", nfServiceCode: "", nfServiceDescription: "", nfInstructions: "", whatsappInstance: "", defaultRate: "15", defaultDiscount: "5" }} />
        </Card>
      )}
    </>
  );
}
