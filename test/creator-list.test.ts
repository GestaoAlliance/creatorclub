import { describe, expect, it } from "vitest";
import { agoText, creatorsCsv, fillMessage, lastSaleTone, shortBRL, teamMessage, trendOf, weekIndex } from "@/domain";

const DAY = 86_400_000;

describe("lista de creators (D-CREATORLIST, regras puras)", () => {
  it("semana do mini gráfico: 0 é a mais antiga, 11 a atual; fora do período = null", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(weekIndex(now, now)).toBe(11);
    expect(weekIndex(new Date(now.getTime() - 6 * DAY), now)).toBe(11);
    expect(weekIndex(new Date(now.getTime() - 7 * DAY), now)).toBe(10);
    expect(weekIndex(new Date(now.getTime() - 83 * DAY), now)).toBe(0);
    expect(weekIndex(new Date(now.getTime() - 84 * DAY), now)).toBeNull();
    expect(weekIndex(new Date(now.getTime() + DAY), now)).toBeNull();
  });

  it("tendência: alta e queda acima de 10%, estável até 10%, voltou quando não vendia antes", () => {
    expect(trendOf(15_000, 10_000)).toEqual({ dir: "up", pct: 50 });
    expect(trendOf(5_000, 10_000)).toEqual({ dir: "down", pct: -50 });
    expect(trendOf(10_900, 10_000)).toEqual({ dir: "flat", pct: 9 });
    expect(trendOf(0, 10_000)).toEqual({ dir: "down", pct: -100 });
    expect(trendOf(5_000, 0)).toEqual({ dir: "new", pct: null });
    expect(trendOf(0, 0)).toEqual({ dir: "flat", pct: null });
  });

  it("cor da última venda e texto do tempo", () => {
    expect([lastSaleTone(null), lastSaleTone(0), lastSaleTone(15), lastSaleTone(16), lastSaleTone(45), lastSaleTone(46)]).toEqual(["never", "fresh", "fresh", "cooling", "cooling", "cold"]);
    expect([agoText(0), agoText(1), agoText(5), agoText(59), agoText(90), agoText(800)]).toEqual(["hoje", "ontem", "há 5 dias", "há 59 dias", "há 3 meses", "há 2 anos"]);
  });

  it("valor curto: até mil reais com centavos só quando há; acima, em mil", () => {
    expect(shortBRL(81_800)).toBe("R$ 818");
    expect(shortBRL(81_850)).toBe("R$ 818,50");
    expect(shortBRL(152_300)).toBe("R$ 1,5 mil");
    expect(shortBRL(2_342_862)).toBe("R$ 23 mil");
  });

  it("mensagem: {nome} vira o primeiro nome e {cupom} o cupom; aviso com chave do envio", () => {
    expect(fillMessage("Oi, {nome}! Use o {CUPOM}.", { name: "  Maria Clara Souza", coupon: "MARIA10" })).toBe("Oi, Maria! Use o MARIA10.");
    expect(fillMessage("{cupom}", { name: "Ana", coupon: null })).toBe("seu cupom");
    expect(teamMessage("abc", " Título ", " Texto ")).toEqual({ kind: "TEAM_MESSAGE", dedupeKey: "team-message:abc", title: "Título", body: "Texto", path: null });
  });

  it("planilha: BOM, ponto e vírgula, aspas onde precisa e vendas só para quem vê dinheiro", () => {
    const row = { name: 'Ana "Fit"', status: "Ativa", categories: ["Influencer"], coupon: "ANA10", instagram: "ana", tiktok: null, phone: "11999990000", email: "a@x.com", city: "São Paulo", state: "SP", tags: ["mãe", "fit"], lastSaleDay: "2026-11-01", joinedDay: "2026-08-15" };
    const withMoney = creatorsCsv([{ ...row, stats: { salesCents: 123_456, orders: 3, sales30Cents: 10_000 } }]);
    expect(withMoney.startsWith("﻿Nome;Situação;Tipo;Cupom")).toBe(true);
    expect(withMoney).toContain("Vendas (R$);Vendas 30 dias (R$);Pedidos");
    expect(withMoney).toContain('"Ana ""Fit""";Ativa;Influencer;ANA10;@ana;;11999990000;a@x.com;São Paulo;SP;mãe, fit;1234,56;100,00;3;01/11/2026;15/08/2026');
    const noMoney = creatorsCsv([{ ...row, stats: null }]);
    expect(noMoney).not.toContain("Vendas");
  });
});
