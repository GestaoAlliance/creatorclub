import { InstallGuide } from "@/components/portal/install-app";
import { ui } from "@/components/ui/styles";
import { currentPortalContext } from "@/lib/portal/current";

export const dynamic = "force-dynamic";

// Instalar app (D-INSTALLAPP): como colocar o portal na tela de início do celular, passo a passo por aparelho.
export default async function PortalInstall({ params }: { params: Promise<{ marca: string }> }) {
  const ctx = await currentPortalContext((await params).marca);
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Instalar app</h1>
      <p className={ui.muted}>Coloque o portal da {ctx.brand.name} na tela do seu celular: ele abre como um app, com o ícone da marca, e você entra direto.</p>
      <section className={ui.card}>
        <InstallGuide brandName={ctx.brand.name} />
      </section>
    </>
  );
}
