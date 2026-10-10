import { Bell } from "lucide-react";
import Link from "next/link";
import { ui } from "@/components/ui/styles";
import { db } from "@/lib/db";
import { markAllRead, myNotifications } from "@/lib/notifications/notify";
import { currentPortalContext } from "@/lib/portal/current";

export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Avisos da creator (U5, D-NOTICES). Abrir a página marca tudo como lido (menos quando é a equipe vendo o portal).
export default async function AvisosPage({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const list = await myNotifications(db(), ctx);
  await markAllRead(db(), ctx);
  return (
    <section className="glass flex flex-col gap-4 rounded-3xl p-5">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><Bell className="size-5" /> Avisos</h1>
      {list.length === 0 ? (
        <p className={ui.muted}>Nenhum aviso ainda. Quando sua comissão liberar, um kit chegar ou um saque for pago, aparece aqui.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((n) => {
            const body = (
              <>
                <span className="flex items-start justify-between gap-3">
                  <span className="font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-stone-500">{when(n.createdAt)}</span>
                </span>
                <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">{n.body}</span>
              </>
            );
            const cls = `block rounded-2xl p-4 ${n.readAt ? "bg-white/40 dark:bg-white/5" : "bg-white/80 ring-2 ring-brand/30 dark:bg-white/10"}`;
            return <li key={n.id}>{n.href ? <Link href={n.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}
