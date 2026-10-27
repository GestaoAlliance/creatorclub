import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { staffContext } from "@/lib/staff/context";
import { tiktokList, type TikTokRow } from "@/lib/tiktok/list";

export const dynamic = "force-dynamic";

type Search = { shop?: string; quem?: string; q?: string };

const KIND: Record<TikTokRow["kind"], { label: string; tone: string }> = {
  CANDIDATA: { label: "Candidata", tone: badge.amber },
  ATIVA: { label: "Ativa", tone: badge.green },
  PAUSADA: { label: "Pausada", tone: badge.neutral },
};
const dmy = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lista do TikTok (D-TIKTOKLIST, pedido da Vanessa: login da Mafe). Só leitura: quem tem TikTok na marca escolhida no
// topo, para a Mafe chamar no WhatsApp. Sem vendas, saldo, CPF ou pagamentos.
export default async function TikTokPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/tiktok");
  const { brand } = await staffContext(actor);
  if (!brand || !can(actor.grants, "tiktok.view", brand.id)) redirect("/conta");
  const sp = await searchParams;
  const all = await tiktokList(db(), actor, brand.id);
  const q = fold(sp.q?.trim() ?? "");
  const rows = all.filter(
    (r) =>
      (sp.shop !== "1" || r.tiktokShop === true) &&
      (!sp.quem || (sp.quem === "candidatas" ? r.kind === "CANDIDATA" : r.kind !== "CANDIDATA")) &&
      (!q || fold(`${r.name} ${r.tiktok} ${r.instagram ?? ""} ${r.niche ?? ""} ${r.place ?? ""}`).includes(q)),
  );
  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/tiktok${p.size ? `?${p}` : ""}`;
  };
  const shops = all.filter((r) => r.tiktokShop).length;

  return (
    <>
      <PageHeader title="TikTok">
        Candidatas e creators da {brand.name} que têm TikTok: {all.length} pessoas, {shops} com TikTok Shop ativo. As mais recentes primeiro.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ shop: sp.shop === "1" ? "" : "1" })} className={sp.shop === "1" ? ui.pillOn : ui.pill}>Só com TikTok Shop</Link>
        <span className="mx-1 h-5 w-px bg-stone-300 dark:bg-white/15" />
        <Link href={qs({ quem: "" })} className={!sp.quem ? ui.pillOn : ui.pill}>Todas</Link>
        <Link href={qs({ quem: "candidatas" })} className={sp.quem === "candidatas" ? ui.pillOn : ui.pill}>Candidatas</Link>
        <Link href={qs({ quem: "creators" })} className={sp.quem === "creators" ? ui.pillOn : ui.pill}>Creators</Link>
        <form action="/admin/tiktok" className="ml-auto flex items-center gap-2">
          {sp.shop && <input type="hidden" name="shop" value={sp.shop} />}
          {sp.quem && <input type="hidden" name="quem" value={sp.quem} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Nome, @, nicho ou cidade" className={ui.inputSm} />
          <button className={ui.ghostSm}>Buscar</button>
        </form>
      </div>
      <Card title={`${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"}`}>
        {rows.length === 0 ? (
          <p className={ui.muted}>Ninguém com esses filtros.</p>
        ) : (
          <ul className={ui.list}>
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {r.name}
                    <span className={KIND[r.kind].tone}>{KIND[r.kind].label}</span>
                    {r.tiktokShop && <span className={badge.sky}>TikTok Shop</span>}
                  </p>
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <a href={`https://www.tiktok.com/@${r.tiktok}`} target="_blank" rel="noopener noreferrer" className={ui.link}>TikTok @{r.tiktok}</a>
                    {r.instagram && <a href={`https://instagram.com/${r.instagram}`} target="_blank" rel="noopener noreferrer" className={ui.link}>Instagram @{r.instagram}</a>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {[r.followers && `${r.followers} seguidores`, r.niche, r.place, `desde ${dmy(r.since)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {r.whatsapp ? (
                  <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className={`${ui.btnSm} inline-flex items-center gap-1.5`}>
                    <MessageCircle className="size-4" /> Chamar no WhatsApp
                  </a>
                ) : (
                  <span className="text-xs text-stone-500">{r.phone ?? "sem WhatsApp"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
