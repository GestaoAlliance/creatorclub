/**
 * Quem pode o quê, por marca. Regra pura (sem banco), testada em test/permissions.test.ts.
 * Negar por padrão: permissão que não está na matriz não existe para o papel.
 * Tabela decidida em 2026-10-09 (D-ROLES em docs/DECISIONS.md).
 */

export type StaffRole = "SUPER_ADMIN" | "GESTAO" | "ENVIO" | "PAGAMENTO" | "HUNTER";

export type Permission =
  | "creators.view" // lista e ficha das creators da marca
  | "creators.edit" // creator, cupom, % de comissão e desconto
  | "money.view" // vendas, comissões, saldos
  | "withdrawals.manage" // ver saques e NF, marcar como pago
  | "shipping.view" // lista de envio
  | "personal.address" // endereço da creator
  | "personal.fiscal" // CPF, CNPJ, chave Pix
  | "ledger.adjust" // ajuste manual de saldo
  | "prospects.own" // prospecções do próprio hunter
  | "integrations.manage" // conectar loja Shopify
  | "staff.manage"; // convidar e remover pessoas da equipe

const ALL: readonly Permission[] = [
  "creators.view",
  "creators.edit",
  "money.view",
  "withdrawals.manage",
  "shipping.view",
  "personal.address",
  "personal.fiscal",
  "ledger.adjust",
  "prospects.own",
  "integrations.manage",
  "staff.manage",
];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  GESTAO: ["creators.view", "creators.edit", "money.view", "personal.address", "personal.fiscal"],
  ENVIO: ["shipping.view", "personal.address"],
  // D-ADJUST: ajuste manual de saldo é só do SUPER_ADMIN.
  PAGAMENTO: ["creators.view", "money.view", "withdrawals.manage", "personal.fiscal"],
  HUNTER: ["prospects.own"],
};

/** Papel da pessoa: global (brandId null, só SUPER_ADMIN) ou numa marca. */
export type Grant = { role: StaffRole; brandId: string | null };

/** Marcas em que a permissão vale: "ALL" (super admin) ou a lista de marcas (pode ser vazia). */
export function brandsWith(grants: readonly Grant[], permission: Permission): "ALL" | string[] {
  const brands = new Set<string>();
  for (const grant of grants) {
    if (!ROLE_PERMISSIONS[grant.role].includes(permission)) continue;
    if (grant.brandId === null) {
      if (grant.role === "SUPER_ADMIN") return "ALL";
      continue; // papel global só existe para SUPER_ADMIN (trava no banco também)
    }
    brands.add(grant.brandId);
  }
  return [...brands].sort();
}

export function can(grants: readonly Grant[], permission: Permission, brandId: string): boolean {
  const allowed = brandsWith(grants, permission);
  return allowed === "ALL" || allowed.includes(brandId);
}
