import { ArrowRight, Banknote, ClipboardCheck, FileSignature, Inbox, Package, Target, TrendingDown, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Kpi, PageHeader } from "@/components/ui/page";
import { ui } from "@/components/ui/styles";
import { formatBRL } from "@/domain";
import type { StaffHome } from "@/lib/staff/home";

function Tile({ href, icon, title, children }: { href: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${ui.card} group transition-transform hover:-translate-y-0.5`}>
      <div className="flex items-center justify-between">
        <h2 className={ui.h2}>{icon}{title}</h2>
        <ArrowRight className="size-4 text-stone-400 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </Link>
  );
}

/** Início da equipe (D-DESIGNALL): um cartão por assunto do papel, cada um abre a tela. Só exibe. */
export function StaffHomeView({ h }: { h: StaffHome }) {
  const empty = !h.creators && !h.coupons && !h.shipments && !h.withdrawals && !h.hunter;
  return (
    <>
      <PageHeader title="Início">O que está esperando por você agora. Toque num cartão para abrir a tela.</PageHeader>
      {empty && <p className={ui.muted}>Seu papel ainda não tem telas por aqui.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {h.hunter && (
          <Tile href="/admin/indicacoes" icon={<Target className="size-4" />} title="Minhas indicações">
            {h.hunter.hasLink ? (
              <>
                <Kpi label="Cliques em 30 dias" value={h.hunter.clicks30} hint="no seu link" />
                <Kpi label="Em análise" value={h.hunter.inReview} hint={`${h.hunter.approved} aprovadas`} tone={h.hunter.inReview ? "amber" : undefined} />
              </>
            ) : (
              <p className={`${ui.muted} col-span-2`}>A equipe ainda não criou o seu link. Fale com a Gestão.</p>
            )}
          </Tile>
        )}
        {h.creators && h.creators.applications > 0 && (
          <Tile href="/admin/candidatas" icon={<Inbox className="size-4" />} title="Candidatas">
            <Kpi label="Novas" value={h.creators.applications} hint="responderam o formulário" tone="amber" />
          </Tile>
        )}
        {h.creators && h.creators.contractsExpiring + h.creators.contractsExpired > 0 && (
          <Tile href="/admin/creators?contrato=1" icon={<FileSignature className="size-4" />} title="Contratos">
            <Kpi label="Vencem em 30 dias" value={h.creators.contractsExpiring} tone={h.creators.contractsExpiring ? "amber" : undefined} />
            <Kpi label="Vencidos" value={h.creators.contractsExpired} hint="renovar ou encerrar" tone={h.creators.contractsExpired ? "red" : undefined} />
          </Tile>
        )}
        {h.creators && h.creators.idle > 0 && (
          <Tile href="/admin/creators?semvenda=1" icon={<TrendingDown className="size-4" />} title="Sem vender">
            <Kpi label="Há 60 dias ou mais" value={h.creators.idle} hint="ativas: falar com a creator" tone="amber" />
          </Tile>
        )}
        {h.withdrawals && (
          <Tile href="/admin/saques" icon={<Banknote className="size-4" />} title="Saques">
            <Kpi label="Em análise" value={h.withdrawals.open} hint={formatBRL(h.withdrawals.openCents)} tone={h.withdrawals.open ? "amber" : undefined} />
            <Kpi label="Aberturas a aprovar" value={h.withdrawals.openingsPending} hint="saque travado até aprovar" />
          </Tile>
        )}
        {h.shipments && (
          <Tile href="/admin/envios" icon={<Package className="size-4" />} title="Envios">
            <Kpi label="Preparando" value={h.shipments.preparing} hint="a enviar" tone={h.shipments.preparing ? "amber" : undefined} />
            <Kpi label="A caminho" value={h.shipments.shipped} hint="esperando a entrega" />
            <Kpi label="Kits a escolher" value={h.shipments.kitsPending} hint="a creator escolhe no portal" />
          </Tile>
        )}
        {h.coupons && (
          <Tile href="/admin/cupons" icon={<ClipboardCheck className="size-4" />} title="Cupons">
            <Kpi label="Cupons sem tipo" value={h.coupons.unclassified} tone={h.coupons.unclassified ? "amber" : undefined} />
            <Kpi label="Donas a confirmar" value={h.coupons.ownerPending} tone={h.coupons.ownerPending ? "amber" : undefined} />
          </Tile>
        )}
        {h.creators && (
          <Tile href="/admin/creators" icon={<Users className="size-4" />} title="Creators">
            <Kpi label="Ativas" value={h.creators.active} />
            <Kpi label="A conferir pela Ana" value={h.creators.toReview} hint="libera o saldo de abertura" />
          </Tile>
        )}
      </div>
    </>
  );
}
