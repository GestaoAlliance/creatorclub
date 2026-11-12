import { redirect } from "next/navigation";
import { GlassLight } from "@/components/ui/glass-light";
import { ui } from "@/components/ui/styles";
import { brandsWith, can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { scopedActor, staffContext } from "@/lib/staff/context";
import { aleloCardStatus } from "@/lib/withdrawals/alelo";
import { payoutBoard } from "@/lib/withdrawals/board";
import { withdrawalQueue, type QueueFilter } from "@/lib/withdrawals/decide";
import { remessaPreview } from "@/lib/withdrawals/remessa";
import { payoutSummary } from "@/lib/withdrawals/summary";
import { AleloCardBox } from "./alelo-card";
import { SaquesExtras, SaquesHero, SaquesQueue } from "./board";
import { BatchBar, RemessaBar, RetornoForm } from "./forms";

export const dynamic = "force-dynamic";

const VER: Record<string, QueueFilter> = { analise: "REQUESTED", aprovados: "APPROVED", decididos: "DECIDED" };

// Saques em duas etapas (M1.1, D-WDAPPROVE): a Gestão aprova, o Pagamento faz o Pix. Visual D-PAYBOARD.
export default async function SaquesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/saques");
  const allowed = brandsWith(actor.grants, "withdrawals.view");
  if (allowed !== "ALL" && allowed.length === 0) redirect("/conta");
  const { ver } = await searchParams;
  // A1 (D-ALLIANCE): só a marca escolhida no topo.
  const { brand } = await staffContext(actor);
  if (!brand) return <p className={ui.muted}>Nenhuma marca.</p>;
  const inBrand = scopedActor(actor, brand.id);
  // Sem escolher aba: quem só paga (Pagamento) abre nos aprovados; quem aprova, em análise.
  const approves = brandsWith(inBrand.grants, "withdrawals.approve");
  const tab: QueueFilter = (ver && VER[ver]) || (approves !== "ALL" && approves.length === 0 ? "APPROVED" : "REQUESTED");
  const manage = can(actor.grants, "withdrawals.manage", brand.id);
  const [requested, approved, decided, sum, board, alelo] = await Promise.all([
    withdrawalQueue(db(), inBrand, "REQUESTED"),
    withdrawalQueue(db(), inBrand, "APPROVED"),
    tab === "DECIDED" ? withdrawalQueue(db(), inBrand, "DECIDED") : Promise.resolve([]),
    payoutSummary(db(), inBrand, [brand.id]),
    payoutBoard(db(), actor, brand.id),
    // D-ALELOCARD: pedido do cartão Alelo de quem recebe como pessoa física (para quem paga).
    manage ? aleloCardStatus(db(), actor, brand.id) : Promise.resolve(null),
  ]);
  const remessa = tab === "APPROVED" && manage ? await remessaPreview(db(), actor, brand.id, board.today) : null;
  const rows = tab === "REQUESTED" ? requested : tab === "APPROVED" ? approved : decided;
  const thisMonth = board.paidByMonth.at(-1)!;

  return (
    <GlassLight className="dash flex flex-col gap-4">
      <SaquesHero brandName={brand.name} tab={tab} sum={sum} board={board} requested={requested} approved={approved} paidThisMonth={{ count: thisMonth.count, cents: thisMonth.cents }} />
      {/* D-REMESSA: arquivo do SICOOB para quem paga (marca escolhida no topo). */}
      {tab === "APPROVED" && remessa && <RemessaBar brandId={brand.id} count={remessa.count} cents={remessa.totalCents} today={board.today} problems={remessa.problems} />}
      {tab === "APPROVED" && remessa && <RetornoForm brandId={brand.id} />}
      {tab === "APPROVED" && rows.some((r) => r.canPay) && <BatchBar count={rows.filter((r) => r.canPay).length} />}
      <SaquesQueue key={tab} rows={rows} tab={tab} />
      <SaquesExtras board={board} canMessage={can(actor.grants, "creators.edit", brand.id)} />
      {alelo && <AleloCardBox ready={alelo.ready.length} incomplete={alelo.incomplete} />}
    </GlassLight>
  );
}
