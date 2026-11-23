import type { NavItem } from "@/components/portal/nav";
import { brandsWith, type Grant, type Permission } from "@/lib/auth/permissions";

/**
 * Menu do painel da equipe (D-DESIGNALL) em grupos (D-MENUGROUPS, plano M): cada item do menu junta telas do mesmo
 * trabalho, mostradas como abas no topo da página. Regra pura (testada). Cada página continua conferindo o acesso.
 */
/** `about`: frase curta mostrada embaixo das abas quando esta está aberta (pedido do responsável, 2026-11-23). */
type Tab = { href: string; label: string; about?: string; needs: Permission; orNeeds?: Permission; global?: boolean };
type Group = { label: string; icon: NavItem["icon"]; tabs: Tab[] };

const GROUPS: Group[] = [
  {
    label: "Creators",
    icon: "creators",
    tabs: [
      { href: "/creators", label: "Creators", about: "Todas as creators da marca: vendas, cupom, acesso e cadastro. Clique no nome para abrir a ficha.", needs: "creators.view" },
      { href: "/candidatas", label: "Candidatas", about: "Quem se inscreveu e espera resposta: aprovar (cupom e contrato) ou recusar.", needs: "creators.view" },
      // D-ACTIONS: envio parado é de quem envia (o Envio vê as tarefas de envio).
      { href: "/creators/acoes", label: "Ações", about: "O que fazer hoje com cada creator: contrato sem assinar, perto do mínimo, envio parado, sem vender.", needs: "creators.edit", orNeeds: "shipping.manage" },
      { href: "/campanhas", label: "Campanhas", about: "Campanhas e desafios com creators: quem participa e o resultado de cada uma.", needs: "creators.view" },
      { href: "/conteudo", label: "Conteúdo", about: "Posts das creators (registrados ou que marcaram a marca) e quem está sem postar.", needs: "creators.view" },
      // D-TIKTOKLIST: quem tem TikTok (a Mafe vê só esta aba).
      { href: "/tiktok", label: "TikTok", about: "Creators que têm TikTok, para chamar no WhatsApp.", needs: "tiktok.view" },
    ],
  },
  // Hunters trazem as creators (influencers, UGC, prescritores): grupo próprio (pedido do responsável).
  // U6 (D-PROSPECT): a prospecção antes do formulário, da Gestão e das hunters.
  {
    label: "Hunters",
    icon: "hunter",
    tabs: [
      { href: "/hunters", label: "Hunters", about: "Quem indica creators: link de cada hunter, indicações e quantas viraram creators.", needs: "creators.edit" },
      { href: "/prospeccao", label: "Prospecção", about: "Perfis abordados antes de se inscreverem (antes de virarem candidatas).", needs: "prospects.own" },
    ],
  },
  {
    label: "Vendas",
    icon: "sales",
    tabs: [
      // D-SALESRANK: Vendas abre no ranking; a lista de pedidos virou a aba Pedidos; Desempenho virou "Redes e origem".
      { href: "/vendas", label: "Vendas", about: "Ranking de creators no período: vendas, comissão, quem subiu ou caiu.", needs: "money.view" },
      { href: "/vendas/pedidos", label: "Pedidos", about: "A lista pedido a pedido, para conferir de onde veio cada venda e se o cupom contou.", needs: "money.view" },
      { href: "/vendas/produtos", label: "Produtos", about: "Produtos vendidos com cupom de creator (ou a loja toda): unidades, receita, margem e estoque.", needs: "money.view" },
      { href: "/desempenho", label: "Redes e origem", about: "Instagram das creators, vídeos das UGC e de onde vêm as creators.", needs: "performance.view" },
    ],
  },
  {
    label: "Pagamentos",
    icon: "payout",
    tabs: [
      // D-PAYQUEUE: uma fila por tipo (conferir → pedido → aprovar → pagar → pago); consultas em Relatórios.
      { href: "/pagamentos/cnpj", label: "Pagamentos CNPJ", about: "Saques de quem recebe com nota fiscal (empresa): conferir, aprovar e pagar, etapa por etapa.", needs: "withdrawals.view" },
      { href: "/pagamentos/cpf", label: "Pagamentos CPF", about: "Saques de quem recebe com recibo (pessoa física): conferir, aprovar e pagar, etapa por etapa.", needs: "withdrawals.view" },
      { href: "/pagamentos/relatorios", label: "Relatórios", about: "Só para consulta: calendário do mês, totais mês a mês, remessas do banco e o saldo de antes do Creator Club.", needs: "withdrawals.view" },
    ],
  },
  { label: "Envios", icon: "package", tabs: [{ href: "/envios", label: "Envios", needs: "shipping.view" }] },
  {
    label: "Configurações",
    icon: "settings",
    tabs: [
      { href: "/marcas", label: "Marcas", about: "Configuração de cada marca: empresa, calendário de pagamentos, comissão, produtos e avisos.", needs: "staff.manage", global: true },
      { href: "/equipe", label: "Equipe", about: "Quem da equipe tem acesso e o que cada pessoa pode fazer; convidar alguém novo.", needs: "staff.manage", global: true },
      { href: "/contratos", label: "Contratos", about: "Textos dos contratos de cada tipo, em versões, e quem ainda falta assinar.", needs: "staff.manage", global: true },
      { href: "/termo", label: "Termo", about: "O termo de aceite que a creator assina ao entrar no portal.", needs: "staff.manage", global: true },
      // D-SALESRANK: Cupons saiu de Vendas (é cadastro, não leitura de vendas).
      { href: "/cupons", label: "Cupons", about: "Cupons usados na loja: dizer se é de creator ou promocional e confirmar a dona.", needs: "creators.edit" },
      { href: "/sync", label: "Shopify", about: "Ligação com a loja Shopify de cada marca: pedidos chegando e últimas sincronizações.", needs: "integrations.manage", global: true },
      { href: "/importar", label: "Importar", about: "Importar creators do app antigo.", needs: "integrations.manage", global: true },
      // M3.4b (D-MCP): cada pessoa liga o próprio Claude.
      { href: "/claude", label: "Claude", about: "Ligar o seu Claude ao Creator Club para perguntar sobre vendas, saldos e creators.", needs: "creators.view" },
    ],
  },
];

function allowedTab(grants: readonly Grant[], t: Tab, globalGrants: readonly Grant[]): boolean {
  const ok = (p: Permission) => {
    // Aba global (Marcas, Equipe, Contratos…): vale o acesso de verdade, não o recortado para a marca do topo.
    const b = brandsWith(t.global ? globalGrants : grants, p);
    return t.global ? b === "ALL" : b === "ALL" || b.length > 0;
  };
  return ok(t.needs) || (t.orNeeds !== undefined && ok(t.orNeeds));
}

/** Menu dentro de uma marca (A1, D-ALLIANCE): o Início da marca e os grupos que o papel pode usar, com as abas. */
export function staffNav(grants: readonly Grant[], globalGrants: readonly Grant[] = grants): NavItem[] {
  const groups = GROUPS.flatMap((g): NavItem[] => {
    const tabs = g.tabs.filter((t) => allowedTab(grants, t, globalGrants)).map(({ href, label, about }) => ({ href, label, ...(about ? { about } : {}) }));
    // U6: a hunter (sem a aba Hunters) vê o item com o nome da única aba dela, "Prospecção".
    const label = (g.icon === "hunter" || g.icon === "creators") && tabs.length === 1 ? tabs[0]!.label : g.label;
    return tabs.length ? [{ href: tabs[0]!.href, label, icon: g.icon, tabs }] : [];
  });
  // U3: a própria hunter vê as indicações dela (super admin acompanha pela aba Hunters).
  const hunter: NavItem[] = grants.some((g) => g.role === "HUNTER") ? [{ href: "/indicacoes", label: "Minhas indicações", icon: "hunter" }] : [];
  // D-TIKTOKLIST: só com a lista do TikTok, o Início seria só um desvio para ela.
  if (onlyTikTok(grants)) return groups;
  return [{ href: "/marca", label: "Início", icon: "home" }, ...hunter, ...groups];
}

/** Aba aberta: a de endereço mais longo que casa com o caminho (`/saques/conferencia` antes de `/saques`). */
export function activeTab(tabs: readonly { href: string }[], path: string, base = "/admin"): string | null {
  const hits = tabs.filter((t) => path === `${base}${t.href}` || path.startsWith(`${base}${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

/** Quem tem o painel da Alliance acima das marcas: super admin ou quem atende mais de uma marca. */
export function hasAlliancePanel(grants: readonly Grant[], brandCount: number): boolean {
  return grants.some((g) => g.role === "SUPER_ADMIN" && g.brandId === null) || brandCount > 1;
}

/** Menu de "Todas as marcas" (D-ALLBRANDS): o Início somado e, para o super admin, as Configurações. */
export function allianceNav(grants: readonly Grant[]): NavItem[] {
  const admin = brandsWith(grants, "staff.manage") === "ALL";
  return [{ href: "", label: "Início", icon: "home" }, ...(admin ? [{ href: `/marcas?${ALL_BRANDS_PARAM}=1`, label: "Configurações", icon: "settings" as const }] : [])];
}

/** Telas do painel da Alliance (o resto é dentro de uma marca). */
export const ALLIANCE_PATHS = ["/admin"];

/** Marcas em "Todas as marcas" (`/admin/marcas?todas=1`): as três para editar; dentro de uma marca, só ela. */
export const ALL_BRANDS_PARAM = "todas";

/** A tela está em "Todas as marcas"? O Início da Alliance, ou Marcas aberta de lá. */
export function inAllBrands(path: string, todas: string | null): boolean {
  return ALLIANCE_PATHS.includes(path) || (path === "/admin/marcas" && todas === "1");
}

/** D-TIKTOKLIST: quem só tem o acesso do TikTok (ex.: a Mafe) entra direto na lista. */
export const onlyTikTok = (grants: readonly Grant[]) => grants.length > 0 && grants.every((g) => g.role === "TIKTOK");
