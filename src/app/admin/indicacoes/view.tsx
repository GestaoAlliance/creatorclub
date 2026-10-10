import { Link2, Users } from "lucide-react";
import { CopyButton } from "@/components/portal/copy-button";
import { Card, Kpi, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { parseFollowers } from "@/domain";
import type { myHunterPanel } from "@/lib/onboarding/hunters";

type Links = Awaited<ReturnType<typeof myHunterPanel>>;

const STATUS: Record<string, [string, string]> = {
  NEW: ["em análise", badge.amber],
  APPROVED: ["aprovada", badge.green],
  REJECTED: ["recusada", badge.neutral],
};
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const followers = (raw: string | null) => {
  const n = parseFollowers(raw);
  if (n === null) return raw;
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".0", "").replace(".", ",")} mi` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(".0", "").replace(".", ",")} mil` : String(n);
};

/** Tela da hunter (U3): divulgar o link e acompanhar quem se inscreveu por ele. Só exibe. */
export function IndicacoesView({ links, origin }: { links: Links; origin: string }) {
  return (
    <>
      <PageHeader title="Minhas indicações">
        Divulgue o seu link de inscrição: quem se inscreve por ele chega marcada como sua indicação. Aqui você acompanha
        os cliques e a situação de cada uma.
      </PageHeader>
      {links.length === 0 && <p className={ui.muted}>A equipe ainda não criou o seu link. Fale com a Gestão.</p>}
      {links.map((l) => {
        const url = `${origin}/i/${l.code}`;
        return (
          <div key={l.code} className="flex flex-col gap-6">
            {links.length > 1 && <h2 className={ui.title}>{l.brandName}</h2>}
            <Card title="Seu link de inscrição" icon={<Link2 className="size-4" />}>
              <div className={`${ui.inset} flex items-center justify-between gap-2`}>
                <p className="truncate font-mono text-sm">{url}</p>
                <CopyButton value={url} label="Copiar" />
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Kpi label="Cliques em 30 dias" value={l.clicks30} hint={`${l.clicks} no total`} />
                <Kpi label="Inscritas" value={l.counts.total} />
                <Kpi label="Em análise" value={l.counts.inReview} tone={l.counts.inReview ? "amber" : undefined} />
                <Kpi label="Aprovadas" value={l.counts.approved} />
              </div>
            </Card>
            <Card title={`Quem se inscreveu (${l.applications.length})`} icon={<Users className="size-4" />}>
              {l.applications.length === 0 ? (
                <p className={ui.muted}>Ninguém ainda. Quando alguém se inscrever pelo seu link, aparece aqui.</p>
              ) : (
                <ul className={ui.list}>
                  {l.applications.map((a) => {
                    const [label, style] = STATUS[a.status] ?? [a.status, badge.neutral];
                    return (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{a.name}</span>
                          <span className={ui.hint}>
                            {a.instagram ? `@${a.instagram}` : "sem @"}
                            {a.followers ? ` · ${followers(a.followers)} seguidores` : ""} · inscrita em {day(a.submittedAt)}
                          </span>
                        </span>
                        <span className={style}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        );
      })}
    </>
  );
}
