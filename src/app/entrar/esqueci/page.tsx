import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";
import { ResetRequestForm } from "../forms";

export default function EsqueciPage() {
  return (
    <AuthFrame title="Esqueci a senha" subtitle="Enviamos um link para você criar uma nova senha.">
      <ResetRequestForm />
      <Link href="/entrar" className={`${ui.link} text-center text-sm`}>Voltar</Link>
    </AuthFrame>
  );
}
