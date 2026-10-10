import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";

export default function Home() {
  return (
    <AuthFrame title="Creator Club" subtitle="Suas vendas, seu saldo e seus saques num lugar só.">
      <p className={ui.muted}>O acesso é por convite da equipe da marca.</p>
      <Link href="/entrar" className={`${ui.btn} w-full`}>Entrar</Link>
    </AuthFrame>
  );
}
