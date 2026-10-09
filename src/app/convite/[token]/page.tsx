import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";
import { resolveInvite } from "./resolve";

export const dynamic = "force-dynamic";

const PROBLEM: Record<string, string> = {
  invalid: "Este convite não existe.",
  expired: "Este convite venceu. Peça um novo.",
  used: "Este convite já foi usado.",
  revoked: "Este convite foi cancelado.",
};

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await resolveInvite(token);
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">Creator Club</p>
      {children}
    </main>
  );
  if (!invite || invite.state !== "valid") {
    return shell(<p className="text-stone-700">{PROBLEM[invite?.state ?? "invalid"]}</p>);
  }

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const sessionEmail = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
  if (sessionEmail && sessionEmail !== invite.email) {
    return shell(
      <p className="text-stone-700">
        Este convite é para <strong>{invite.email}</strong>, mas você entrou como {sessionEmail}.{" "}
        <Link href="/conta" className="underline">Saia</Link> e abra o link de novo.
      </p>,
    );
  }
  return shell(
    <>
      <h1 className="text-2xl font-bold">Olá, {invite.name}</h1>
      <p className="text-stone-600">
        Seu acesso ao Creator Club: <strong>{invite.grantText}</strong>. Entrada com o e-mail{" "}
        <strong>{invite.email}</strong>.
      </p>
      <AcceptForm token={token} needsPassword={!sessionEmail} />
    </>,
  );
}
