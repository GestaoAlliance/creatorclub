import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { HistoryCard, SettingsHero } from "@/components/staff/settings-hero";
import { formatCnpj } from "@/domain";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { brandList } from "@/lib/brands/manage";
import { db } from "@/lib/db";
import { HISTORY_ACTIONS } from "@/lib/settings/health";
import { staffContext } from "@/lib/staff/context";
import { ALL_BRANDS_PARAM } from "@/lib/staff/nav";
import { BrandForm } from "./forms";
import { BrandSections, type SectionItem } from "./sections";

export const dynamic = "force-dynamic";

const pct = (bps: number) => String(bps / 100).replace(".", ",");

/** D-LABEL: remetente gravado (JSON) para o formulário. */
function shipFromInitial(v: unknown) {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, string | null>;
  const g = (k: string) => a[k] ?? "";
  return { zip: g("zip"), street: g("street"), number: g("number"), complement: g("complement"), district: g("district"), city: g("city"), state: g("state"), phone: g("phone") };
}

// Marcas da Alliance (A1b, D-ALLIANCE): cadastrar e editar. Só super admin. Em "Todas as marcas" (?todas=1) aparecem
// todas e a criação de marca nova; dentro de uma marca, só a marca escolhida no topo. Visual D-SETTINGSBOARD: seções
// com checklist.
export default async function MarcasPage({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/marcas");
  if (brandsWith(actor.grants, "staff.manage") !== "ALL") redirect("/admin");
  const all = (await searchParams)[ALL_BRANDS_PARAM] === "1";
  const { brand } = await staffContext(actor);
  const brands = (await brandList(db(), actor)).filter((b) => all || b.id === brand?.id);
  return (
    <GlassLight className="dash flex flex-col gap-4">
      <SettingsHero actor={actor} brandId={all ? null : (brand?.id ?? null)} brandName={all ? "Todas as marcas" : (brand?.name ?? "")} active="marcas" title={all ? "Marcas" : `Marca ${brand?.name ?? ""}`}>
        {all ? "As marcas da Alliance no Creator Club. Para começar uma marca: criar aqui, escolher a marca no topo, conectar a loja em Shopify e publicar o termo e os contratos." : <>O que a {brand?.name} precisa para funcionar inteira, seção por seção. <Link href={`/admin/marcas?${ALL_BRANDS_PARAM}=1`} className="font-medium underline">Ver todas as marcas</Link></>}
      </SettingsHero>
      {brands.map((b) => {
        const zip = shipFromInitial(b.shipFrom)?.zip;
        const items: SectionItem[] = [
          { id: "dados", label: "Dados da empresa", done: Boolean(b.legalName && b.nfTakerDocument && b.storeUrl), hint: "Nome, razão social, CNPJ (tomador da nota), site da loja e a cor da marca." },
          { id: "padroes", label: "Comissão e desconto", done: null, hint: "Padrões para novas creators, desconto na loja com o saldo e o produto sugerido na aprovação." },
          { id: "financeiro", label: "Financeiro e SICOOB", done: Boolean(b.financeEmail && b.bankConvenio && b.bankAccount), hint: "E-mail que recebe cada nota fiscal e a conta do SICOOB para a remessa de Pix." },
          { id: "envio", label: "Remetente das etiquetas", done: Boolean(zip), hint: "Endereço que sai como remetente nas etiquetas e declarações de conteúdo." },
          { id: "kits", label: "Kits e envio inicial", done: b.welcomeOneIds.length > 0, hint: "Produtos que a creator pode escolher e os do 1º pedido depois do contrato." },
          { id: "nota", label: "Nota fiscal", done: Boolean(b.nfServiceCode), hint: "O que a creator vê na tela de saque para emitir a nota." },
          { id: "whatsapp", label: "WhatsApp dos avisos", done: Boolean(b.whatsappInstance), hint: "Instância (Evolution, no n8n) que manda os avisos da creator das 9h às 20h." },
          { id: "contrato", label: "Contrato na aprovação", done: null, hint: b.contractLock ? "Trava ligada: a creator só vira ativa depois de assinar." : "Trava desligada." },
          { id: "login", label: "Tela de entrar", done: b.assets.some((a) => a.kind === "LOGO"), hint: "Logo que aparece na tela de entrar da marca." },
        ];
        return (
          <div key={b.id} className="flex flex-col gap-3">
            {all && <h2 className="flex items-center gap-2 px-1 text-lg font-semibold"><span className="size-3 rounded-full" style={{ background: b.primaryColor }} />{b.name} <span className="text-sm font-normal text-stone-500">· {b.activeCreators} creators ativas</span></h2>}
            <BrandSections
              items={items}
              form={{ initial: { brandId: b.id, name: b.name, slug: b.slug, primaryColor: b.primaryColor, legalName: b.legalName ?? "", cnpj: b.nfTakerDocument ? formatCnpj(b.nfTakerDocument) : "", storeUrl: b.storeUrl ?? "", nfServiceCode: b.nfServiceCode ?? "", nfServiceDescription: b.nfServiceDescription ?? "", nfInstructions: b.nfInstructions ?? "", whatsappInstance: b.whatsappInstance ?? "", defaultRate: pct(b.defaultCommissionBps), defaultDiscount: pct(b.defaultDiscountBps), approvalSuggestion: b.approvalSuggestion ?? "", shopDiscount: pct(b.shopDiscountBps), financeEmail: b.financeEmail ?? "", bank: { convenio: b.bankConvenio ?? "", agency: b.bankAgency ?? "", agencyDv: b.bankAgencyDv ?? "", account: b.bankAccount ?? "", accountDv: b.bankAccountDv ?? "" }, shipFrom: shipFromInitial(b.shipFrom), welcomeOneIds: b.welcomeOneIds, welcomeTwoIds: b.welcomeTwoIds }, products: b.products }}
              lock={{ brandId: b.id, on: b.contractLock, waiting: b.awaitingContract }}
              logo={{ brandId: b.id, slug: b.slug, version: b.assets.find((a) => a.kind === "LOGO")?.sha256.slice(0, 12) ?? null }}
            />
          </div>
        );
      })}
      {all && (
        <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Plus className="size-4" />Nova marca</h2>
          <BrandForm create initial={{ name: "", slug: "", primaryColor: "#18181B", legalName: "", cnpj: "", storeUrl: "", nfServiceCode: "", nfServiceDescription: "", nfInstructions: "", whatsappInstance: "", defaultRate: "15", defaultDiscount: "5" }} />
        </section>
      )}
      <HistoryCard brandId={all ? null : (brand?.id ?? null)} prefixes={HISTORY_ACTIONS.marcas} />
    </GlassLight>
  );
}
