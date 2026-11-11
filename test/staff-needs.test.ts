import { describe, expect, it } from "vitest";
import type { StaffHome } from "@/lib/staff/home";
import { needsFor } from "@/lib/staff/needs";

const creators = { active: 10, toReview: 9, applications: 5, contractsExpiring: 2, contractsExpired: 1, idle: 1, applicationsOld: 2 };
const shipments = { preparing: 2, shipped: 0, kitsPending: 3, awaiting: 1, awaitingOld: 0, preparingOld: 1 };
const wd = (approve: boolean, pay: boolean, openings: number | null = null, closing = false) => ({
  toApprove: 1, toApproveCents: 100, toPay: 4, toPayCents: 100, mine: { approve, pay }, openingsPending: openings, approveClosing: closing, payClosing: false,
});
const actions = { open: 7, shipStuck: 1, byKind: { ACCESS: 3, IDLE: 4 } };
const areas = (h: StaffHome) => needsFor(h).areas.map((a) => [a.area, a.items.map((i) => i.label)]);

describe("Precisa de você por área e urgência (D-NEEDSAREA)", () => {
  it("Pagamento vê só a área Pagamento", () => {
    const h: StaffHome = { mine: { creators: false, shipping: false }, creators, withdrawals: wd(false, true, 9) };
    expect(needsFor(h).readOnly).toBe(false);
    expect(areas(h)).toEqual([["Pagamento", ["saques aprovados para pagar", "aberturas a aprovar"]]]);
  });
  it("Envio vê só envios; parado há mais de 3 dias é urgente", () => {
    const h: StaffHome = { mine: { creators: false, shipping: true }, shipments, actions };
    const r = needsFor(h);
    expect(areas(h)).toEqual([["Envios", ["envios a preparar"]]]);
    expect(r.items[0]).toMatchObject({ urgent: true, note: "1 parados há mais de 3 dias" });
  });
  it("Super admin vê as três áreas; o urgente vem primeiro; ações por tipo; sem 'a conferir pela Ana'", () => {
    const h: StaffHome = { mine: { creators: true, shipping: true }, creators, shipments, actions, withdrawals: wd(true, true, 3, true) };
    const r = needsFor(h);
    expect(r.areas.map((a) => a.area)).toEqual(["Gestão", "Pagamento", "Envios"]);
    const gestao = r.areas[0]!.items;
    expect(gestao.slice(0, 2).map((i) => i.label)).toEqual(["cadastros para aprovar", "contratos vencidos"]);
    expect(gestao.every((i, k) => k < 2 ? i.urgent : !i.urgent)).toBe(true);
    expect(gestao.map((i) => i.label)).toContain("pediu acesso");
    expect(gestao.map((i) => i.label)).toContain("parou de vender");
    expect(gestao.map((i) => i.label)).not.toContain("a conferir pela Ana");
    expect(r.areas[1]!.items[0]).toMatchObject({ label: "saques para aprovar", urgent: true });
  });
  it("Leitura vê tudo como pendências da equipe", () => {
    const h: StaffHome = { mine: { creators: false, shipping: false }, creators, shipments, withdrawals: wd(false, false) };
    expect(needsFor(h).readOnly).toBe(true);
    expect(needsFor(h).items.map((i) => i.label)).toEqual(expect.arrayContaining(["saques aprovados para pagar", "kits a aprovar", "envios a preparar"]));
  });
});
