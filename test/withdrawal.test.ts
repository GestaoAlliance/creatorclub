import { describe, expect, it } from "vitest";
import { assertNoOverlap, checkWithdrawalRequest, computeBalance, localDate, type WithdrawalPolicy } from "../src/domain";
import { T, policies } from "./helpers";

const botanika: WithdrawalPolicy = { minCents: 50_000, windowStartDay: 10, windowEndDay: 15 };

describe("saldo", () => {
  it("separa retido, reservado e disponível", () => {
    const now = T("2026-10-10T15:00:00Z");
    const balance = computeBalance(
      [
        { type: "COMMISSION", amountCents: 300_000, availableAt: T("2026-09-30T00:00:00Z") },
        { type: "COMMISSION", amountCents: 10_000, availableAt: T("2026-10-12T00:00:00Z") },
      ],
      [{ amountCents: 200_000 }],
      now,
    );
    expect(balance).toEqual({ totalCents: 310_000, heldCents: 10_000, reservedCents: 200_000, availableCents: 100_000 });
  });

  it("saldo negativo depois de estorno não é escondido", () => {
    const balance = computeBalance(
      [
        { type: "COMMISSION", amountCents: 60_000, availableAt: T("2026-09-01T00:00:00Z") },
        { type: "WITHDRAWAL", amountCents: -60_000, availableAt: T("2026-09-12T00:00:00Z") },
        { type: "REVERSAL", amountCents: -6_000, availableAt: T("2026-09-20T00:00:00Z") },
      ],
      [],
      T("2026-10-01T00:00:00Z"),
    );
    expect(balance.availableCents).toBe(-6_000);
  });
});

describe("solicitação de saque", () => {
  const base = { amountCents: 200_000, availableCents: 300_000, hasOpenWithdrawal: false };

  it("saque parcial de R$ 2.000 com R$ 3.000 disponíveis no dia 10", () => {
    expect(checkWithdrawalRequest({ ...base, now: T("2026-10-10T12:00:00Z") }, botanika)).toEqual([]);
  });

  it("janela de 10 a 15 no horário de São Paulo, inclusiva", () => {
    // 10/10 00:30 em São Paulo = 03:30 UTC → dentro.
    expect(checkWithdrawalRequest({ ...base, now: T("2026-10-10T03:30:00Z") }, botanika)).toEqual([]);
    // 09/10 23:30 em São Paulo = 10/10 02:30 UTC → fora.
    expect(checkWithdrawalRequest({ ...base, now: T("2026-10-10T02:30:00Z") }, botanika)).toEqual(["FORA_DA_JANELA"]);
    // 15/10 23:59 em São Paulo → dentro; 16/10 → fora.
    expect(checkWithdrawalRequest({ ...base, now: T("2026-10-16T02:59:00Z") }, botanika)).toEqual([]);
    expect(checkWithdrawalRequest({ ...base, now: T("2026-10-16T03:00:00Z") }, botanika)).toEqual(["FORA_DA_JANELA"]);
  });

  it("mínimo de R$ 500, saldo insuficiente e saque já aberto", () => {
    const now = T("2026-10-12T12:00:00Z");
    expect(checkWithdrawalRequest({ ...base, amountCents: 49_999, now }, botanika)).toEqual(["ABAIXO_DO_MINIMO"]);
    expect(checkWithdrawalRequest({ ...base, amountCents: 300_001, now }, botanika)).toEqual(["SALDO_INSUFICIENTE"]);
    expect(checkWithdrawalRequest({ ...base, hasOpenWithdrawal: true, now }, botanika)).toEqual(["SAQUE_EM_ABERTO"]);
    expect(checkWithdrawalRequest({ ...base, amountCents: 0, now }, botanika)).toEqual(["VALOR_INVALIDO"]);
  });
});

describe("datas de negócio", () => {
  it("último dia do mês às 22h em São Paulo ainda é o mesmo mês", () => {
    expect(localDate(T("2026-10-01T01:00:00Z"))).toEqual({ year: 2026, month: 9, day: 30 });
  });
});

describe("políticas de comissão", () => {
  it("aceita políticas encadeadas e recusa sobreposição", () => {
    expect(() => assertNoOverlap(policies)).not.toThrow();
    expect(() =>
      assertNoOverlap([
        ...policies,
        { id: "p-ana-2", creatorId: "ana", rateBps: 1000, validFrom: T("2026-06-01T00:00:00Z"), validTo: null, confirmed: true },
      ]),
    ).toThrow(/se sobrepõem/);
  });
});
