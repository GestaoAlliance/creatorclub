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
  | "withdrawals.view" // ver a fila de saques e a NF (Gestão e Pagamento)
  | "withdrawals.approve" // M1.1 (D-WDAPPROVE): aprovar ou recusar o pedido em análise (Gestão)
  | "withdrawals.manage" // pagar (ou recusar) o saque aprovado; abertura e conferência da planilha (Pagamento)
  | "shipping.view" // lista de envio
  | "shipping.manage" // registrar e atualizar envios de produtos (D-SHIPWHO)
  | "personal.address" // endereço da creator
  | "personal.fiscal" // CPF, CNPJ, chave Pix
  | "ledger.adjust" // ajuste manual de saldo
  | "prospects.own" // prospecções do próprio hunter
  | "integrations.manage" // conectar loja Shopify
  | "staff.manage" // convidar e remover pessoas da equipe
  | "portal.viewAs"; // ver o portal de uma creator, só leitura (D-VIEWAS)

const ALL: readonly Permission[] = [
  "creators.view",
  "creators.edit",
  "money.view",
  "withdrawals.view",
  "withdrawals.approve",
  "withdrawals.manage",
  "shipping.view",
  "shipping.manage",
  "personal.address",
  "personal.fiscal",
  "ledger.adjust",
  "prospects.own",
  "integrations.manage",
  "staff.manage",
  "portal.viewAs",
];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  // U6 (D-PROSPECT): a Gestão também prospecta (e vê as prospecções de todas pela creators.edit).
  GESTAO: ["creators.view", "creators.edit", "money.view", "withdrawals.view", "withdrawals.approve", "personal.address", "personal.fiscal", "shipping.view", "shipping.manage", "prospects.own"],
  ENVIO: ["shipping.view", "shipping.manage", "personal.address"],
  // D-ADJUST: ajuste manual de saldo é só do SUPER_ADMIN.
  PAGAMENTO: ["creators.view", "money.view", "withdrawals.view", "withdrawals.manage", "personal.fiscal"],
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

/**
 * A1 (D-ALLIANCE): papéis vistos dentro de uma marca. Quem é global (super admin) passa a valer só nela; papéis de
 * outras marcas saem. Usado para cada tela da equipe mostrar só a marca escolhida no topo. Não serve para decidir
 * acesso a telas globais (Equipe, Termo, Contratos, Shopify): essas continuam usando os papéis completos.
 */
export function scopeGrants(grants: readonly Grant[], brandId: string): Grant[] {
  return grants.flatMap((g) => (g.brandId === null ? [{ role: g.role, brandId }] : g.brandId === brandId ? [g] : []));
}
