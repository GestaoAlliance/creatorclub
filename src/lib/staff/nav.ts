import type { NavItem } from "@/components/portal/nav";
import { brandsWith, type Grant, type Permission } from "@/lib/auth/permissions";

/**
 * Menu do painel da equipe (D-DESIGNALL): o mesmo da creator, com os itens que o papel pode usar.
 * Regra pura (testada). Cada página continua conferindo o acesso sozinha.
 */
const ITEMS: (NavItem & { needs: Permission; global?: boolean })[] = [
  { href: "/creators", label: "Creators", icon: "creators", needs: "creators.view" },
  { href: "/cupons", label: "Cupons", icon: "review", needs: "creators.edit" },
  { href: "/envios", label: "Envios", icon: "package", needs: "shipping.view" },
  { href: "/saques", label: "Saques", icon: "payout", needs: "withdrawals.manage" },
  { href: "/abertura", label: "Abertura", icon: "opening", needs: "withdrawals.manage" },
  { href: "/equipe", label: "Equipe", icon: "team", needs: "staff.manage", global: true },
  { href: "/termo", label: "Termo", icon: "terms", needs: "staff.manage", global: true },
  { href: "/sync", label: "Shopify", icon: "sync", needs: "integrations.manage", global: true },
  { href: "/importar", label: "Importar", icon: "import", needs: "integrations.manage", global: true },
];

export function staffNav(grants: readonly Grant[]): NavItem[] {
  const allowed = ITEMS.filter((i) => {
    const b = brandsWith(grants, i.needs);
    return i.global ? b === "ALL" : b === "ALL" || b.length > 0;
  }).map(({ href, label, icon }) => ({ href, label, icon }));
  return [{ href: "", label: "Início", icon: "home" }, ...allowed];
}
