import { Bell } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { stopViewAsAction } from "@/app/portal/actions";
import { signOut } from "@/app/entrar/actions";
import { BottomNav, PORTAL_ITEMS, SideNav } from "@/components/portal/nav";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { brandCssVars, type PortalContext } from "@/lib/portal/context";

/** Moldura do portal da creator (E7.1): cor da marca, menu lateral (computador) ou inferior (celular). Só exibe. */
export function PortalShell({
  ctx,
  unread = 0,
  children,
}: {
  ctx: Pick<PortalContext, "creatorId" | "name" | "status" | "brand" | "brands" | "viewAs" | "ugcOnly">;
  /** U5: avisos não lidos (sininho). */
  unread?: number;
  children: ReactNode;
}) {
  const base = `/portal/${ctx.brand.slug}`;
  const others = ctx.brands.filter((b) => b.slug !== ctx.brand.slug);
  // D-UGCPORTAL: quem é só UGC não tem saldo nem saque. O filtro roda no menu (componente de cliente).
  const hidden = ctx.ugcOnly ? ["/saque"] : [];

  return (
    <div style={brandCssVars(ctx.brand) as CSSProperties} className="portal-bg flex min-h-screen">
      <SideNav base={base} brandName={ctx.brand.name} items={PORTAL_ITEMS} hidden={hidden} />
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
            <Link
              href={`${base}/avisos`}
              aria-label={unread ? `Avisos: ${unread} não ${unread === 1 ? "lido" : "lidos"}` : "Avisos"}
              className="glass relative grid size-10 place-content-center rounded-full"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-5 place-content-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white dark:bg-brand-2 dark:text-stone-950">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <ThemeToggle />
            <form action={signOut}>
              <button className="glass rounded-full px-4 py-2 text-sm">Sair</button>
            </form>
          </div>
        </header>
        {ctx.viewAs && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
            <span>
              Você está vendo o portal de <strong>{ctx.name}</strong> como ela vê. Só leitura: nada é feito em nome dela.
            </span>
            <form action={stopViewAsAction}>
              <input type="hidden" name="creatorId" value={ctx.creatorId} />
              <button className="rounded-full bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 dark:bg-amber-100 dark:text-amber-950">
                Sair da visualização
              </button>
            </form>
          </div>
        )}
        {ctx.status === "DEACTIVATED" && (
          <p className="glass mb-4 rounded-2xl px-4 py-3 text-sm">
            Sua participação na {ctx.brand.name} foi encerrada. {ctx.ugcOnly ? "Você continua vendo suas vendas." : "Você continua vendo seu saldo e seu extrato."}
          </p>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <BottomNav base={base} items={PORTAL_ITEMS} hidden={hidden} />
    </div>
  );
}
