import Link from "next/link";
import { ResetRequestForm } from "../forms";

export default function EsqueciPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Esqueci a senha</h1>
      <p className="text-sm text-stone-600">Enviamos um link para você criar uma nova senha.</p>
      <ResetRequestForm />
      <Link href="/entrar" className="text-sm text-stone-600 underline">Voltar</Link>
    </main>
  );
}
