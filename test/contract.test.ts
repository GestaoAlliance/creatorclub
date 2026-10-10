import { describe, expect, it } from "vitest";
import { addMonthsToDay, contractMonthsFor, contractStatus, idleStatus } from "../src/domain";
import { T } from "./helpers";

describe("vigência do contrato (D-CHECKLIST)", () => {
  it("6 meses; dia que não existe vira o último do mês; vira o ano", () => {
    expect(addMonthsToDay("2026-10-05", 6)).toBe("2027-04-05");
    expect(addMonthsToDay("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsToDay("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("UGC tem 3 meses; influencer, prescritor e misto têm 6", () => {
    expect(contractMonthsFor(["UGC"])).toBe(3);
    expect(contractMonthsFor(["INFLUENCER"])).toBe(6);
    expect(contractMonthsFor(["UGC", "INFLUENCER"])).toBe(6);
    expect(contractMonthsFor([])).toBe(6);
  });

  it("aviso 30 dias antes e no vencimento, pelo dia de São Paulo", () => {
    const now = T("2026-10-10T15:00:00Z");
    expect(contractStatus(null, now)).toEqual({ status: "NONE", daysLeft: null });
    expect(contractStatus("2026-11-09", now)).toEqual({ status: "EXPIRING", daysLeft: 30 });
    expect(contractStatus("2026-11-10", now)).toEqual({ status: "ACTIVE", daysLeft: 31 });
    expect(contractStatus("2026-10-10", now)).toEqual({ status: "EXPIRED", daysLeft: 0 });
    // 10/10 às 23h em São Paulo ainda é dia 10.
    expect(contractStatus("2026-10-11", T("2026-10-11T02:00:00Z"))).toEqual({ status: "EXPIRING", daysLeft: 1 });
  });
});

describe("aviso de 60 dias sem vender (D-IDLE60)", () => {
  const now = T("2026-10-10T15:00:00Z");
  it("conta da última venda; quem nunca vendeu conta desde o início", () => {
    expect(idleStatus("2026-08-11", "2026-01-01", now)).toEqual({ days: 60, idle: true, lastSaleDay: "2026-08-11" });
    expect(idleStatus("2026-08-12", "2026-01-01", now)).toEqual({ days: 59, idle: false, lastSaleDay: "2026-08-12" });
    expect(idleStatus(null, "2026-09-01", now)).toEqual({ days: 39, idle: false, lastSaleDay: null });
    expect(idleStatus(null, "2026-08-01", now)).toMatchObject({ days: 70, idle: true });
    expect(idleStatus(null, "2026-12-01", now)).toMatchObject({ days: 0, idle: false }); // contrato futuro
  });
});
