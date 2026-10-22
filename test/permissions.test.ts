import { describe, expect, it } from "vitest";
import { brandsWith, can, ROLE_PERMISSIONS, type Grant, type Permission, type StaffRole } from "@/lib/auth/permissions";

const B = "botanika";
const V = "vermefree";

describe("matriz de permissões (D-ROLES)", () => {
  const expected: Record<StaffRole, Permission[]> = {
    SUPER_ADMIN: [
      "creators.view", "creators.edit", "money.view", "withdrawals.view", "withdrawals.approve", "withdrawals.manage", "shipping.view", "shipping.manage",
      "personal.address", "personal.fiscal", "ledger.adjust", "prospects.own", "integrations.manage", "staff.manage",
      "portal.viewAs",
    ],
    GESTAO: ["creators.view", "creators.edit", "money.view", "withdrawals.view", "withdrawals.approve", "personal.address", "personal.fiscal", "shipping.view", "shipping.manage"],
    ENVIO: ["shipping.view", "shipping.manage", "personal.address"],
    PAGAMENTO: ["creators.view", "money.view", "withdrawals.view", "withdrawals.manage", "personal.fiscal"],
    HUNTER: ["prospects.own"],
  };

  it("cada papel tem exatamente as permissões decididas", () => {
    for (const role of Object.keys(expected) as StaffRole[]) {
      expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...expected[role]].sort());
    }
  });

  it("Envio não vê valores nem dados fiscais; Hunter não vê creators", () => {
    expect(ROLE_PERMISSIONS.ENVIO).not.toContain("money.view");
    expect(ROLE_PERMISSIONS.ENVIO).not.toContain("personal.fiscal");
    expect(ROLE_PERMISSIONS.HUNTER).not.toContain("creators.view");
  });

  it("só super admin ajusta saldo, conecta loja e gerencia equipe (D-ADJUST)", () => {
    for (const p of ["ledger.adjust", "integrations.manage", "staff.manage", "portal.viewAs"] as Permission[]) {
      const roles = (Object.keys(ROLE_PERMISSIONS) as StaffRole[]).filter((r) => ROLE_PERMISSIONS[r].includes(p));
      expect(roles).toEqual(["SUPER_ADMIN"]);
    }
  });
});

describe("escopo por marca", () => {
  it("super admin global vale em todas as marcas", () => {
    const grants: Grant[] = [{ role: "SUPER_ADMIN", brandId: null }];
    expect(brandsWith(grants, "money.view")).toBe("ALL");
    expect(can(grants, "staff.manage", V)).toBe(true);
  });

  it("papel numa marca não vale em outra", () => {
    const grants: Grant[] = [{ role: "GESTAO", brandId: B }];
    expect(can(grants, "creators.edit", B)).toBe(true);
    expect(can(grants, "creators.edit", V)).toBe(false);
  });

  it("papéis diferentes em marcas diferentes", () => {
    const grants: Grant[] = [
      { role: "GESTAO", brandId: B },
      { role: "PAGAMENTO", brandId: V },
    ];
    expect(brandsWith(grants, "money.view")).toEqual([B, V]);
    expect(brandsWith(grants, "creators.edit")).toEqual([B]);
    expect(brandsWith(grants, "withdrawals.manage")).toEqual([V]);
  });

  it("nega por padrão: sem papel, sem acesso; papel global que não é super admin não vale", () => {
    expect(brandsWith([], "creators.view")).toEqual([]);
    expect(can([{ role: "GESTAO", brandId: null }], "creators.view", B)).toBe(false);
  });
});

describe("papéis dentro da marca escolhida (A1, D-ALLIANCE)", () => {
  it("super admin vale só na marca escolhida; papéis de outras marcas saem", async () => {
    const { scopeGrants, brandsWith } = await import("@/lib/auth/permissions");
    const grants = [{ role: "SUPER_ADMIN" as const, brandId: null }, { role: "GESTAO" as const, brandId: "b2" }, { role: "ENVIO" as const, brandId: "b1" }];
    expect(scopeGrants(grants, "b1")).toEqual([{ role: "SUPER_ADMIN", brandId: "b1" }, { role: "ENVIO", brandId: "b1" }]);
    expect(brandsWith(scopeGrants(grants, "b1"), "creators.view")).toEqual(["b1"]);
    expect(brandsWith(scopeGrants([{ role: "GESTAO", brandId: "b2" }], "b1"), "creators.view")).toEqual([]);
  });
});
