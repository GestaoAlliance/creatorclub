import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ui } from "@/components/ui/styles";
import { safeNextPath } from "@/lib/auth/rules";
import { loginBrandSlug } from "@/domain";
import { SignInForm } from "./forms";

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string; marca?: string }> }) {
  const { next, erro, marca } = await searchParams;
  // M4.4a (D-BRANDLOGIN): /entrar?marca=botanika (ou voltando para o portal da marca) abre com a cara dela.
  return (
    <AuthFrame title="Entrar" subtitle="O acesso é só por convite." brandSlug={loginBrandSlug(marca, next)}>
      {erro === "link" && <p role="alert" className={ui.error}>O link expirou ou já foi usado. Peça um novo.</p>}
      <SignInForm next={safeNextPath(next)} />
      <Link href="/entrar/esqueci" className={`${ui.link} text-center text-sm`}>Esqueci a senha</Link>
    </AuthFrame>
  );
}
