import { describe, expect, it } from "vitest";
import type { StaffHome } from "@/lib/staff/home";
import { needsFor } from "@/lib/staff/needs";

const creators = { active: 10, toReview: 9, applications: 5, contractsExpiring: 0, contractsExpired: 0, idle: 1 };
const shipments = { preparing: 2, shipped: 0, kitsPending: 3, awaiting: 1 };
const wd = (approve: boolean, pay: boolean, openings: number | null = null) => ({ toApprove: 1, toApproveCents: 100, toPay: 4, toPayCents: 100, mine: { approve, pay }, openingsPending: openings });
const labels = (h: StaffHome) => needsFor(h).items.map((i) => i.label);

describe("Precisa de você por função", () => {
  it("Pagamento vê só saques e aberturas, não as tarefas da Gestão", () => {
    const h: StaffHome = { mine: { creators: false, shipping: false }, creators, withdrawals: wd(false, true, 9) };
    expect(needsFor(h).readOnly).toBe(false);
    expect(labels(h)).toEqual(["saques aprovados para pagar", "aberturas a aprovar"]);
  });
  it("Envio vê só envios", () => {
    const h: StaffHome = { mine: { creators: false, shipping: true }, shipments, actions: { open: 1, shipStuck: 1 } };
    expect(labels(h)).toEqual(["envios parados há 3 dias", "envios a preparar"]);
  });
  it("Gestão vê creators, kits a aprovar, envios e saques para aprovar", () => {
    const h: StaffHome = { mine: { creators: true, shipping: true }, creators, shipments, withdrawals: wd(true, false) };
    expect(labels(h)).toEqual(["cadastros para aprovar", "contratos vencendo ou vencidos", "sem vender há 60 dias", "a conferir pela Ana", "saques para aprovar", "kits a aprovar", "envios a preparar"]);
  });
  it("Leitura vê tudo como pendências da equipe", () => {
    const h: StaffHome = { mine: { creators: false, shipping: false }, creators, shipments, withdrawals: wd(false, false) };
    expect(needsFor(h).readOnly).toBe(true);
    expect(labels(h)).toContain("saques aprovados para pagar");
    expect(labels(h)).toContain("kits a aprovar");
  });
});
