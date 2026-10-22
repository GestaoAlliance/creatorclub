import type { NavItem } from "@/components/portal/nav";
import { brandsWith, type Grant, type Permission } from "@/lib/auth/permissions";

/**
 * Menu do painel da equipe (D-DESIGNALL): o mesmo da creator, com os itens que o papel pode usar.
 * Regra pura (testada). Cada página continua conferindo o acesso sozinha.
 */
const ITEMS: (NavItem & { needs: Permission; global?: boolean; hunterOnly?: boolean })[] = [
  // U3: a própria hunter vê as indicações dela (super admin acompanha pela tela Hunters).
  { href: "/indicacoes", label: "Minhas indicações", icon: "hunter", needs: "prospects.own", hunterOnly: true },
  { href: "/candidatas", label: "Candidatas", icon: "inbox", needs: "creators.view" },
  { href: "/creators", label: "Creators", icon: "creators", needs: "creators.view" },
  { href: "/desempenho", label: "Desempenho", icon: "trophy", needs: "creators.edit" },
  { href: "/vendas", label: "Vendas", icon: "sales", needs: "money.view" },
  { href: "/hunters", label: "Hunters", icon: "hunter", needs: "creators.edit" },
  { href: "/cupons", label: "Cupons", icon: "review", needs: "creators.edit" },
  { href: "/envios", label: "Envios", icon: "package", needs: "shipping.view" },
  { href: "/saques", label: "Saques", icon: "payout", needs: "withdrawals.manage" },
  { href: "/abertura", label: "Abertura", icon: "opening", needs: "withdrawals.manage" },
  { href: "/termo", label: "Termo", icon: "terms", needs: "staff.manage", global: true },
  { href: "/contratos", label: "Contratos", icon: "contract", needs: "staff.manage", global: true },
  { href: "/sync", label: "Shopify", icon: "sync", needs: "integrations.manage", global: true },
  { href: "/importar", label: "Importar", icon: "import", needs: "integrations.manage", global: true },
];

/** Menu dentro de uma marca (A1, D-ALLIANCE): o Início da marca e as telas do papel. */
export function staffNav(grants: readonly Grant[]): NavItem[] {
  const allowed = ITEMS.filter((i) => {
    if (i.hunterOnly) return grants.some((g) => g.role === "HUNTER");
    const b = brandsWith(grants, i.needs);
    return i.global ? b === "ALL" : b === "ALL" || b.length > 0;
  }).map(({ href, label, icon }) => ({ href, label, icon }));
  return [{ href: "/marca", label: "Início", icon: "home" }, ...allowed];
}

/** Quem tem o painel da Alliance acima das marcas: super admin ou quem atende mais de uma marca. */
export function hasAlliancePanel(grants: readonly Grant[], brandCount: number): boolean {
  return grants.some((g) => g.role === "SUPER_ADMIN" && g.brandId === null) || brandCount > 1;
}

/** Menu do painel da Alliance: só as marcas e, para o super admin, o cadastro de marcas e a equipe. */
export function allianceNav(grants: readonly Grant[]): NavItem[] {
  const admin = brandsWith(grants, "staff.manage") === "ALL";
  return [
    { href: "", label: "Marcas da Alliance", icon: "home" },
    ...(admin
      ? [
          { href: "/marcas", label: "Cadastro de marcas", icon: "store" as const },
          { href: "/equipe", label: "Equipe", icon: "team" as const },
        ]
      : []),
  ];
}

/** Telas do painel da Alliance (o resto é dentro de uma marca). */
export const ALLIANCE_PATHS = ["/admin", "/admin/marcas", "/admin/equipe"];
