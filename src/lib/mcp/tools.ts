import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, isDayKey, monthKey } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can, scopeGrants, type Permission } from "@/lib/auth/permissions";
import { creatorStatement } from "@/lib/commission/statement";
import { monthPerformance } from "@/lib/creators/performance";
import { creatorProfile } from "@/lib/creators/profile";
import { searchCreators } from "@/lib/creators/search";
import { creatorNumbers } from "@/lib/creators/timeline";
import { actionQueue, visibleTasks } from "@/lib/actions/queue";
import { creatorReturns } from "@/lib/reports/creator-return";
import { productReport } from "@/lib/reports/products";
import { dashPeriod, staffDashboard } from "@/lib/staff/dashboard";
import { staffHome } from "@/lib/staff/home";
import { payoutSummary } from "@/lib/withdrawals/summary";

/**
 * Ferramentas do conector do Creator Club no Claude (M3.4b, D-MCP): **só leitura**, sempre com a visão de quem
 * pergunta (as mesmas permissões do painel, marca por marca). Nada de CPF, CNPJ, chave Pix, endereço, e-mail ou
 * telefone das creators. Valores em reais (número com 2 casas) para o Claude ler sem conta de centavos.
 */

export class ToolError extends Error {}

/** A pessoa vista só dentro de uma marca (como no painel com a marca escolhida no topo). */
const scopedActor = (actor: Actor, brandId: string): Actor => ({ ...actor, grants: scopeGrants(actor.grants, brandId) });

const reais = (cents: number) => Math.round(cents) / 100;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");

async function resolveBrand(prisma: PrismaClient, actor: Actor, raw: string, need: Permission) {
  const brands = await prisma.brand.findMany({ where: { archivedAt: null }, select: { id: true, slug: true, name: true, timezone: true } });
  const allowed = brandsWith(actor.grants, need);
  const mine = brands.filter((b) => allowed === "ALL" || allowed.includes(b.id));
  if (mine.length === 0) throw new ToolError("Você não tem acesso a essa informação em nenhuma marca.");
  if (!raw) {
    if (mine.length === 1) return mine[0]!;
    throw new ToolError(`Diga a marca: ${mine.map((b) => b.name).join(", ")}.`);
  }
  const q = fold(raw);
  const hit = mine.find((b) => b.slug === q || fold(b.name) === q) ?? mine.find((b) => fold(b.name).includes(q) || b.slug.includes(q));
  if (!hit) throw new ToolError(`Marca não encontrada entre as suas: ${mine.map((b) => b.name).join(", ")}.`);
  return hit;
}

const periodArgs = {
  periodo: { type: "string", enum: ["7", "30", "90", "mes"], description: "Últimos 7, 30 ou 90 dias, ou este mês (padrão: 30)." },
  de: { type: "string", description: "Início AAAA-MM-DD (com 'ate', substitui o período)." },
  ate: { type: "string", description: "Fim AAAA-MM-DD." },
} as const;
const marcaArg = { marca: { type: "string", description: "Botanika, VermeFree ou Revita Derma (pode omitir se você só atende uma)." } } as const;

const period = (a: Args, tz: string) => {
  const de = str(a, "de");
  const ate = str(a, "ate");
  const periodo = str(a, "periodo");
  return dashPeriod({ ...(periodo ? { periodo } : {}), ...(isDayKey(de) && isDayKey(ate) ? { de, ate } : {}) }, tz);
};

export const TOOLS = [
  {
    name: "listar_marcas",
    description: "Marcas do Creator Club que você atende, com loja conectada e quantas creators ativas.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "resumo_vendas",
    description: "Vendas com cupom de creator no período (comparadas com o período anterior), % da loja, comissão, top creators e top produtos de uma marca.",
    inputSchema: { type: "object", properties: { ...marcaArg, ...periodArgs } },
  },
  {
    name: "produtos_e_lucro",
    description: "Por produto: unidades, receita, custo e margem; e o lucro do programa de creators (receita − custo − comissão − kits − frete).",
    inputSchema: { type: "object", properties: { ...marcaArg, ...periodArgs, loja_inteira: { type: "boolean", description: "true = todas as vendas da loja, não só as com cupom." } } },
  },
  {
    name: "desempenho_do_mes",
    description: "Ranking das creators no mês: vendas, pedidos, variação, quanto falta para o mínimo, kit, quem está sem vender, lucro que deixam e clientes novas.",
    inputSchema: { type: "object", properties: { ...marcaArg, mes: { type: "string", description: "AAAA-MM (padrão: mês atual)." } } },
  },
  {
    name: "buscar_creator",
    description: "Procura creators por nome, @ do Instagram/TikTok ou cupom, nas marcas que você vê.",
    inputSchema: { type: "object", properties: { busca: { type: "string" } }, required: ["busca"] },
  },
  {
    name: "ficha_creator",
    description: "Resumo de uma creator: situação, tipo, cupons, comissão, contrato, vendas em 30 dias, saldo e retorno dos últimos 90 dias.",
    inputSchema: { type: "object", properties: { creator_id: { type: "string", description: "id que vem de buscar_creator" } }, required: ["creator_id"] },
  },
  {
    name: "saques",
    description: "Comissão a pagar (sacável, em análise, aprovados, a liberar, aguardando) e os saques em aberto de uma marca.",
    inputSchema: { type: "object", properties: { ...marcaArg } },
  },
  {
    name: "pendencias",
    description: "O que está esperando a equipe numa marca: candidatas, contratos, saques, envios, cupons e a fila de ações com creators.",
    inputSchema: { type: "object", properties: { ...marcaArg } },
  },
] as const;

export async function callTool(prisma: PrismaClient, actor: Actor, name: string, a: Args, now = new Date()): Promise<unknown> {
  switch (name) {
    case "listar_marcas": {
      const brands = await prisma.brand.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, slug: true, integrations: { where: { kind: "SHOPIFY" }, select: { status: true } }, _count: { select: { creators: { where: { status: "ACTIVE" } } } } },
      });
      return brands
        .filter((b) => actor.grants.some((g) => g.brandId === null || g.brandId === b.id))
        .map((b) => ({ marca: b.name, endereco: b.slug, loja_conectada: b.integrations[0]?.status === "CONNECTED", creators_ativas: b._count.creators }));
    }
    case "resumo_vendas": {
      const b = await resolveBrand(prisma, actor, str(a, "marca"), "money.view");
      const d = await staffDashboard(prisma, b.id, period(a, b.timezone), "", now);
      return {
        marca: b.name,
        periodo: d.period,
        comparado_com: d.previous,
        vendas_com_cupom: { valor: reais(d.kpis.sales.cents), variacao_pct: d.kpis.sales.change, pedidos: d.kpis.sales.orders, parte_da_loja_pct: Math.round(d.kpis.sales.storeShare * 1000) / 10 },
        comissao: { valor: reais(d.kpis.commission.cents), variacao_pct: d.kpis.commission.change },
        creators_que_venderam: d.kpis.creators.sold,
        creators_ativas: d.kpis.creators.active,
        loja_inteira: { valor: reais(d.store.salesCents), pedidos_pagos: d.store.paidOrders, aguardando_pagamento: d.store.pending, estornados: d.store.refunded, cancelados: d.store.cancelled },
        top_creators: d.topCreators.map((c) => ({ nome: c.name, vendas: reais(c.salesCents), pedidos: c.orders })),
        top_produtos: d.topProducts.map((p) => ({ produto: p.title, unidades: p.units, receita: reais(p.salesCents) })),
      };
    }
    case "produtos_e_lucro": {
      const b = await resolveBrand(prisma, actor, str(a, "marca"), "money.view");
      const r = await productReport(prisma, b.id, period(a, b.timezone), a.loja_inteira === true ? "loja" : "creators");
      return {
        marca: b.name,
        periodo: r.period,
        escopo: r.scope === "loja" ? "loja inteira" : "com cupom de creator",
        produtos_com_custo: `${r.productsWithCost} de ${r.productsTotal}`,
        produtos: r.rows.map((x) => ({ produto: x.title, unidades: x.units, pedidos: x.orders, receita: reais(x.revenueCents), custo_unitario: x.unitCostCents === null ? null : reais(x.unitCostCents), margem: x.marginCents === null ? null : reais(x.marginCents) })),
        lucro_do_programa: r.program
          ? { receita: reais(r.program.revenueCents), custo_produtos: reais(r.program.cogsCents), comissao: reais(r.program.commissionCents), kits: reais(r.program.kitsCents), frete: reais(r.program.freightCents), lucro: reais(r.program.profitCents), envios_sem_frete: r.program.shipmentsWithoutFreight }
          : null,
      };
    }
    case "desempenho_do_mes": {
      const b = await resolveBrand(prisma, actor, str(a, "marca"), "creators.edit");
      const mes = str(a, "mes");
      const d = await monthPerformance(prisma, actor, b.id, { month: /^\d{4}-\d{2}$/.test(mes) ? mes : monthKey(now, b.timezone) }, now);
      return {
        marca: b.name,
        mes: d.month,
        resumo: { vendas: reais(d.summary.salesCents), variacao_bps: d.summary.changeBps, pedidos: d.summary.orders, venderam: `${d.summary.sellers} de ${d.summary.active}`, minimo_atingido: d.summary.reachedMin, sem_vender_60_dias: d.summary.idle, lucro_que_deixaram: reais(d.summary.profitCents), clientes_novas: d.summary.newCustomers },
        ranking: d.partners.map((r) => ({
          creator_id: r.id,
          nome: r.name,
          vendas: reais(r.salesCents),
          pedidos: r.orders,
          mes_anterior: reais(r.prevSalesCents),
          minimo: r.release ? { acumulado: reais(r.release.accumulatedCents), minimo: reais(r.release.minCents) } : null,
          sem_vender_dias: r.idle?.days ?? null,
          lucro: r.ret ? reais(r.ret.profitCents) : null,
          clientes_novas: r.ret?.customers.new ?? null,
        })),
        ugc: d.ugc.map((r) => ({ creator_id: r.id, nome: r.name, vendas: reais(r.salesCents), videos: r.cycle && "count" in r.cycle ? `${r.cycle.count}/${r.cycle.goal}` : null })),
      };
    }
    case "buscar_creator": {
      const hits = await searchCreators(prisma, actor, str(a, "busca"));
      return hits;
    }
    case "ficha_creator": {
      const id = str(a, "creator_id");
      let p;
      try {
        p = await creatorProfile(prisma, actor, id);
      } catch {
        throw new ToolError("Creator não encontrada entre as que você vê.");
      }
      const money = can(actor.grants, "money.view", p.brandId);
      const [numbers, st, ret, brand] = await Promise.all([
        money ? creatorNumbers(prisma, p.id, now) : null,
        money ? creatorStatement(prisma, actor, p.id).catch(() => null) : null,
        money ? creatorReturns(prisma, p.brandId, { gte: new Date(now.getTime() - 90 * 86_400_000), lt: new Date(now.getTime() + 60_000) }, [p.id]).then((m) => m.get(p.id) ?? null) : null,
        prisma.brand.findUniqueOrThrow({ where: { id: p.brandId }, select: { name: true } }),
      ]);
      const rate = p.policies.find((x) => !x.until) ?? p.policies[0];
      return {
        nome: p.contact.name,
        marca: brand.name,
        situacao: p.status,
        tipos: p.categories,
        instagram: p.instagram,
        tiktok: p.tiktok,
        cupons: p.coupons.filter((c) => !c.until).map((c) => ({ codigo: c.code, desconto_pct: c.discountBps === null ? null : c.discountBps / 100 })),
        comissao_pct: rate ? rate.rateBps / 100 : null,
        contrato: { inicio: p.contract.start, fim: p.contract.end, assinado: p.contract.contractSigned },
        sem_vender: p.idle,
        vendas_30_dias: numbers ? { valor: reais(numbers.last30.salesCents), pedidos: numbers.last30.orders, aguardando_pagamento: reais(numbers.pending.salesCents) } : null,
        saldo: st ? { total: reais(st.balance.totalCents), a_liberar: reais(st.balance.heldCents), em_saque: reais(st.balance.reservedCents), disponivel: reais(st.balance.availableCents) } : null,
        retorno_90_dias: ret
          ? { receita: reais(ret.revenueCents), lucro: reais(ret.profitCents), comissao: reais(ret.commissionCents), clientes: { novas: ret.customers.new, recorrentes: ret.customers.returning, sem_dado: ret.customers.unknown } }
          : null,
      };
    }
    case "saques": {
      const b = await resolveBrand(prisma, actor, str(a, "marca"), "withdrawals.view");
      const scoped = scopedActor(actor, b.id);
      const [sum, open] = await Promise.all([
        payoutSummary(prisma, scoped, [b.id], now),
        prisma.withdrawal.findMany({
          where: { brandId: b.id, status: { in: ["REQUESTED", "APPROVED"] } },
          orderBy: { requestedAt: "asc" },
          select: { amountCents: true, status: true, requestedAt: true, nfCheck: true, creator: { select: { account: { select: { name: true } } } } },
        }),
      ]);
      return {
        marca: b.name,
        comissao_a_pagar: { sacavel: reais(sum.availableCents), em_analise: { pedidos: sum.requested.count, valor: reais(sum.requested.cents) }, aprovados: { pedidos: sum.approved.count, valor: reais(sum.approved.cents) }, a_liberar: reais(sum.heldCents), vendas_aguardando_pagamento: reais(sum.awaiting.salesCents) },
        em_aberto: open.map((w) => ({ creator: w.creator.account.name, valor: reais(w.amountCents), situacao: w.status === "REQUESTED" ? "em análise" : "aprovado", pedido_em: dayKey(w.requestedAt, b.timezone), nota: w.nfCheck })),
      };
    }
    case "pendencias": {
      const b = await resolveBrand(prisma, actor, str(a, "marca"), "creators.view");
      const scoped = scopedActor(actor, b.id);
      const [h, tasks] = await Promise.all([staffHome(prisma, scoped), actionQueue(prisma, b.id, now)]);
      const mine = visibleTasks(tasks, actor, b.id);
      const byKind: Record<string, number> = {};
      for (const t of mine) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
      return { marca: b.name, painel: h, fila_de_acoes: { total: mine.length, por_tipo: byKind, primeiras: mine.slice(0, 15).map((t) => ({ creator: t.name, motivo: t.detail, tipo: t.kind })) } };
    }
  }
  throw new ToolError(`Ferramenta desconhecida: ${name}`);
}
