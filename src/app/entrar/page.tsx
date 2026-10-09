import Link from "next/link";
import { safeNextPath } from "@/lib/auth/rules";
import { SignInForm } from "./forms";

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">Creator Club</p>
      <h1 className="text-2xl font-bold">Entrar</h1>
      {erro === "link" && (
        <p role="alert" className="text-sm text-red-700">O link expirou ou já foi usado. Peça um novo.</p>
      )}
      <SignInForm next={safeNextPath(next)} />
      <Link href="/entrar/esqueci" className="text-sm text-stone-600 underline">Esqueci a senha</Link>
      <p className="text-xs text-stone-500">O acesso é só por convite.</p>
    </main>
  );
}
