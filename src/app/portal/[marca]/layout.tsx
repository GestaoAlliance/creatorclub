import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { BottomNav, SideNav } from "@/components/portal/nav";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { brandCssVars, portalContext, PortalError } from "@/lib/portal/context";
import { signOut } from "../../entrar/actions";

export const dynamic = "force-dynamic";

// Moldura do portal da creator (E7.1): cor da marca do banco, menu lateral (computador) ou inferior (celular).
export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/entrar?next=/portal/${marca}`);
  let ctx;
  try {
    ctx = await portalContext(db(), actor, marca);
  } catch (error) {
    if (error instanceof PortalError) notFound();
    throw error;
  }
  const base = `/portal/${ctx.brand.slug}`;
  const others = ctx.brands.filter((b) => b.slug !== ctx.brand.slug);

  return (
    <div style={brandCssVars(ctx.brand) as CSSProperties} className="portal-bg flex min-h-screen">
      <SideNav base={base} brandName={ctx.brand.name} />
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-4 md:px-6 md:pb-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand-2">{ctx.brand.name}</p>
            <p className="truncate text-lg font-semibold">Olá, {ctx.name.split(" ")[0]}</p>
          </div>
          <div className="flex items-center gap-2">
            {others.length > 0 && (
              <details className="relative">
                <summary className="glass cursor-pointer list-none rounded-full px-4 py-2 text-sm">Trocar marca</summary>
                <div className="glass absolute right-0 z-30 mt-2 flex min-w-40 flex-col rounded-2xl p-2">
                  {others.map((b) => (
                    <Link key={b.slug} href={`/portal/${b.slug}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/60 dark:hover:bg-white/10">
                      <span className="size-3 rounded-full" style={{ background: brandCssVars(b)["--brand"] }} />
                      {b.name}
                    </Link>
                  ))}
                </div>
              </details>
            )}
            <ThemeToggle />
            <form action={signOut}>
              <button className="glass rounded-full px-4 py-2 text-sm">Sair</button>
            </form>
          </div>
        </header>
        {ctx.status === "DEACTIVATED" && (
          <p className="glass mb-4 rounded-2xl px-4 py-3 text-sm">
            Sua participação na {ctx.brand.name} foi encerrada. Você continua vendo seu saldo e seu extrato.
          </p>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <BottomNav base={base} />
    </div>
  );
}
