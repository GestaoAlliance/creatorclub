import type { NavItem } from "@/components/portal/nav";
import { brandsWith, type Grant, type Permission } from "@/lib/auth/permissions";

/**
 * Menu do painel da equipe (D-DESIGNALL) em grupos (D-MENUGROUPS, plano M): cada item do menu junta telas do mesmo
 * trabalho, mostradas como abas no topo da página. Regra pura (testada). Cada página continua conferindo o acesso.
 */
type Tab = { href: string; label: string; needs: Permission; global?: boolean };
type Group = { label: string; icon: NavItem["icon"]; tabs: Tab[] };

const GROUPS: Group[] = [
  {
    label: "Creators",
    icon: "creators",
    tabs: [
      { href: "/creators", label: "Creators", needs: "creators.view" },
      { href: "/candidatas", label: "Candidatas", needs: "creators.view" },
    ],
  },
  // Hunters trazem as creators (influencers, UGC, prescritores): grupo próprio (pedido do responsável).
  { label: "Hunters", icon: "hunter", tabs: [{ href: "/hunters", label: "Hunters", needs: "creators.edit" }] },
  {
    label: "Vendas",
    icon: "sales",
    tabs: [
      { href: "/vendas", label: "Vendas", needs: "money.view" },
      { href: "/cupons", label: "Cupons", needs: "creators.edit" },
      { href: "/desempenho", label: "Desempenho", needs: "creators.edit" },
    ],
  },
  {
    label: "Pagamentos",
    icon: "payout",
    tabs: [
      { href: "/saques", label: "Saques", needs: "withdrawals.manage" },
      { href: "/abertura", label: "Abertura", needs: "withdrawals.manage" },
      { href: "/saques/conferencia", label: "Conferência da planilha", needs: "withdrawals.manage" },
    ],
  },
  { label: "Envios", icon: "package", tabs: [{ href: "/envios", label: "Envios", needs: "shipping.view" }] },
  {
    label: "Configurações",
    icon: "settings",
    tabs: [
      { href: "/marcas", label: "Marcas", needs: "staff.manage", global: true },
      { href: "/equipe", label: "Equipe", needs: "staff.manage", global: true },
      { href: "/contratos", label: "Contratos", needs: "staff.manage", global: true },
      { href: "/termo", label: "Termo", needs: "staff.manage", global: true },
      { href: "/sync", label: "Shopify", needs: "integrations.manage", global: true },
      { href: "/importar", label: "Importar", needs: "integrations.manage", global: true },
    ],
  },
];

function allowedTab(grants: readonly Grant[], t: Tab): boolean {
  const b = brandsWith(grants, t.needs);
  return t.global ? b === "ALL" : b === "ALL" || b.length > 0;
}

/** Menu dentro de uma marca (A1, D-ALLIANCE): o Início da marca e os grupos que o papel pode usar, com as abas. */
export function staffNav(grants: readonly Grant[]): NavItem[] {
  const groups = GROUPS.flatMap((g): NavItem[] => {
    const tabs = g.tabs.filter((t) => allowedTab(grants, t)).map(({ href, label }) => ({ href, label }));
    return tabs.length ? [{ href: tabs[0]!.href, label: g.label, icon: g.icon, tabs }] : [];
  });
  // U3: a própria hunter vê as indicações dela (super admin acompanha pela aba Hunters).
  const hunter: NavItem[] = grants.some((g) => g.role === "HUNTER") ? [{ href: "/indicacoes", label: "Minhas indicações", icon: "hunter" }] : [];
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

/** Menu do painel da Alliance: as marcas e, para o super admin, as Configurações (marcas, equipe, contratos…). */
export function allianceNav(grants: readonly Grant[]): NavItem[] {
  const admin = brandsWith(grants, "staff.manage") === "ALL";
  return [{ href: "", label: "Marcas da Alliance", icon: "home" }, ...(admin ? [{ href: "/marcas", label: "Configurações", icon: "settings" as const }] : [])];
}

/** Telas do painel da Alliance (o resto é dentro de uma marca). */
export const ALLIANCE_PATHS = ["/admin"];
