import { describe, expect, it } from "vitest";
import { calendarEvents, calendarToday, checkCalendar, checkExtension } from "@/domain";

const D = { start: 5, end: 15, payFrom: 20, payBy: 25 };

describe("calendário de pagamentos (D-CALENDAR)", () => {
  it("confere as datas antes de salvar", () => {
    expect(checkCalendar(D)).toEqual([]);
    expect(checkCalendar({ ...D, start: 16 })).toEqual(["O pedido de saque precisa começar antes de terminar."]);
    expect(checkCalendar({ ...D, end: 30 })[0]).toMatch(/1 a 28/);
    expect(checkCalendar({ ...D, payBy: 14, payFrom: null })[0]).toMatch(/depois do fim do pedido/);
    expect(checkCalendar({ ...D, payFrom: 26 })[0]).toMatch(/pagamento precisa começar/);
  });

  it("estender a janela: depois do fim normal e antes do fim do pagamento", () => {
    expect(checkExtension(D, 15, 22)).toBeNull();
    expect(checkExtension(D, 15, 15)).toMatch(/depois do 15/);
    expect(checkExtension(D, 15, 25)).toMatch(/antes do fim do pagamento/);
  });

  it("marcos do mês e o que acontece hoje", () => {
    expect(calendarEvents(D).map((e) => [e.kind, e.day, e.to])).toEqual([["CLOSE", 1, undefined], ["REQUEST", 5, 15], ["PAY", 20, 25]]);
    expect(calendarToday(D, 3).now).toBe("Pedidos de saque abrem no dia 5");
    expect(calendarToday(D, 10).now).toBe("Pedidos de saque abertos até o dia 15");
    expect(calendarToday(D, 17).now).toMatch(/Conferência das notas/);
    expect(calendarToday(D, 22).now).toBe("Dias de pagamento (até o dia 25)");
    expect(calendarToday(D, 28).now).toBe("Fechamento do mês no dia 1");
  });
});
