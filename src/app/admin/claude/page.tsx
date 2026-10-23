import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CopyButton } from "@/components/portal/copy-button";
import { Card, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { disconnectAction } from "./actions";

export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

// M3.4b (D-MCP): como ligar o Creator Club no Claude e quem está conectado (cada pessoa vê só a dela).
export default async function ClaudePage() {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/claude");
  if (actor.grants.length === 0) redirect("/conta");
  const h = await headers();
  const url = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}/api/mcp`;
  const active = await db().mcpToken.findMany({
    where: { userId: actor.userId, kind: "REFRESH", revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, client: { select: { name: true } } },
  });
  const lastUse = await db().mcpToken.findFirst({ where: { userId: actor.userId, kind: "ACCESS" }, orderBy: { lastUsedAt: { sort: "desc", nulls: "last" } }, select: { lastUsedAt: true } });
  return (
    <>
      <PageHeader title="Perguntar ao Claude">
        Ligue o Creator Club no seu Claude e pergunte sobre vendas, creators, saques e pendências das suas marcas. Só leitura, com o que você já vê
        no painel.
      </PageHeader>
      <Card title="Como ligar">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>No Claude (claude.ai ou app), abra <strong>Configurações → Conectores → Adicionar conector personalizado</strong>.</li>
          <li>
            Nome: <strong>Creator Club</strong>. Endereço:
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-stone-500/10 px-2 py-1 font-mono text-xs">{url}</code>
              <CopyButton value={url} label="Copiar" />
            </span>
          </li>
          <li>Clique em <strong>Conectar</strong>: abre esta página de login; entre e clique em <strong>Permitir</strong>.</li>
          <li>Pronto. Pergunte, por exemplo: &quot;quem mais vendeu na Botanika este mês?&quot; ou &quot;quanto falta pagar de saque?&quot;.</li>
        </ol>
      </Card>
      <Card title="Sua conexão">
        {active.length === 0 ? (
          <p className={ui.muted}>O Claude não está conectado com a sua conta.</p>
        ) : (
          <>
            <ul className={ui.list}>
              {active.map((t, i) => (
                <li key={i} className="py-2 text-sm">{t.client.name} · conectado em {when(t.createdAt)}</li>
              ))}
            </ul>
            {lastUse?.lastUsedAt && <p className={ui.hint}>Última consulta: {when(lastUse.lastUsedAt)}.</p>}
            <form action={disconnectAction}>
              <button className={ui.dangerSm}>Desconectar o Claude</button>
            </form>
          </>
        )}
      </Card>
    </>
  );
}
