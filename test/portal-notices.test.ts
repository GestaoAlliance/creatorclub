import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone, noticeGroup, noticeMonthSummary, noticeTopic } from "@/domain";

describe("Avisos no portal (D-PORTALNOTICES)", () => {
  it("assunto por tipo; tipo desconhecido vira conta", () => {
    expect(noticeTopic("WITHDRAWAL_PAID")).toBe("money");
    expect(noticeTopic("SHIPPED")).toBe("ship");
    expect(noticeTopic("CAMPAIGN_NEW")).toBe("campaign");
    expect(noticeTopic("TEAM_MESSAGE")).toBe("team");
    expect(noticeTopic("X")).toBe("account");
  });
  it("grupos por dia", () => {
    const t = "2026-11-12";
    expect(noticeGroup("2026-11-12", t)).toBe("Hoje");
    expect(noticeGroup("2026-11-11", t)).toBe("Ontem");
    expect(noticeGroup("2026-11-06", t)).toBe("Esta semana");
    expect(noticeGroup("2026-11-05", t)).toBe("Últimos 30 dias");
    expect(noticeGroup("2026-10-13", t)).toBe("Antes");
  });
  it("resumo do mês só com o que aconteceu", () => {
    expect(noticeMonthSummary(["COMMISSION_RELEASED", "COMMISSION_RELEASED", "WITHDRAWAL_PAID", "SHIPMENT_DELIVERED", "IDLE"])).toBe("2 comissões liberadas, 1 saque pago e 1 envio entregue");
    expect(noticeMonthSummary(["WITHDRAWAL_PAID"])).toBe("1 saque pago");
    expect(noticeMonthSummary(["IDLE"])).toBeNull();
  });
  it("contato mascarado", () => {
    expect(maskPhone("+55 (11) 98765-4321")).toBe("(11) 9····-4321");
    expect(maskPhone("123")).toBeNull();
    expect(maskEmail("julia@gmail.com")).toBe("ju····@gmail.com");
    expect(maskEmail("x")).toBeNull();
  });
});
