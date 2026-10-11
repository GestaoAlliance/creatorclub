import { chooseBrandAction } from "@/app/admin/actions";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";

/** A1 (D-ALLIANCE): a tela é de outra marca; mostra só o aviso e o botão para trocar a marca no topo. */
export function OtherBrandNotice({ title, brand, next }: { title: string; brand: { slug: string; name: string }; next: string }) {
  return (
    <>
      <PageHeader title={title}>Esta tela é da {brand.name}.</PageHeader>
      <Card>
        <p className="text-sm">Você está no painel de outra marca. Para abrir, troque para a {brand.name}.</p>
        <form action={chooseBrandAction}>
          <input type="hidden" name="slug" value={brand.slug} />
          <input type="hidden" name="next" value={next} />
          <button className={ui.btn}>Entrar na {brand.name}</button>
        </form>
      </Card>
    </>
  );
}
