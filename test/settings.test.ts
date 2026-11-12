import { describe, expect, it } from "vitest";
import { AUDIT_LABEL, auditLabel, PERMISSION_LABEL } from "../src/domain";
import { ROLE_PERMISSIONS } from "../src/lib/auth/permissions";
import { brandChecklist } from "../src/lib/settings/health";

describe("Configurações (D-SETTINGSBOARD)", () => {
  it("checklist da marca: cada item pronto só com o que precisa", () => {
    const empty = { legalName: null, nfTakerDocument: null, storeUrl: null, whatsappInstance: null, financeEmail: null, bankConvenio: null, bankAccount: null, shipFrom: null, welcomeOneIds: [], nfServiceCode: null, storeConnected: false, terms: 0, contracts: 0, logo: false };
    expect(brandChecklist(empty).every((c) => !c.done)).toBe(true);
    const full = brandChecklist({ ...empty, legalName: "X LTDA", nfTakerDocument: "11222333000181", storeUrl: "https://x.com", whatsappInstance: "X", financeEmail: "f@x.com", bankConvenio: "1", bankAccount: "2", shipFrom: { zip: "01310100" }, welcomeOneIds: ["p"], nfServiceCode: "1.06", storeConnected: true, terms: 1, contracts: 2, logo: true });
    expect(full.every((c) => c.done)).toBe(true);
    expect(brandChecklist({ ...empty, shipFrom: { zip: "" } }).find((c) => c.id === "envio")?.done).toBe(false);
  });
  it("toda permissão de algum papel tem nome em português; ação desconhecida aparece crua", () => {
    for (const p of new Set(Object.values(ROLE_PERMISSIONS).flat())) expect(PERMISSION_LABEL[p], p).toBeTruthy();
    expect(auditLabel("brand.update")).toBe(AUDIT_LABEL["brand.update"]);
    expect(auditLabel("algo.novo")).toBe("algo.novo");
  });
});
