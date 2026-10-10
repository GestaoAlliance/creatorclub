import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";
import { safeNextPath } from "@/lib/auth/rules";
import { SignInForm } from "./forms";

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <AuthFrame title="Entrar" subtitle="O acesso é só por convite.">
      {erro === "link" && <p role="alert" className={ui.error}>O link expirou ou já foi usado. Peça um novo.</p>}
      <SignInForm next={safeNextPath(next)} />
      <Link href="/entrar/esqueci" className={`${ui.link} text-center text-sm`}>Esqueci a senha</Link>
    </AuthFrame>
  );
}
