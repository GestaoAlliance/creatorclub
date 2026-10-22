import { redirect } from "next/navigation";

// A tela Cupom entrou no Início (M0.0.5, portal com 4 telas). O endereço antigo continua funcionando.
export default async function PortalCoupon({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  redirect(`/portal/${marca}`);
}
