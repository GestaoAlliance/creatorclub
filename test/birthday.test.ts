import { describe, expect, it } from "vitest";
import { actionDetail, actionMessage, birthdayLabel, nextBirthday, parseBirthDate, tagName } from "@/domain";

describe("aniversário e tags (M4.2, D-TAGS)", () => {
  it("lê a data do campo ou digitada; recusa data que não existe, antes de 1900 ou no futuro; vazio = sem data", () => {
    const today = "2026-10-23";
    expect(parseBirthDate("1995-03-15", today)).toEqual({ ok: true, day: "1995-03-15" });
    expect(parseBirthDate("5/3/1995", today)).toEqual({ ok: true, day: "1995-03-05" });
    expect(parseBirthDate("  ", today)).toEqual({ ok: true, day: null });
    expect(parseBirthDate("2000-02-29", today)).toEqual({ ok: true, day: "2000-02-29" });
    for (const bad of ["2001-02-29", "1995-13-01", "1899-12-31", "2026-10-24", "15-03-1995", "ontem"]) expect(parseBirthDate(bad, today).ok).toBe(false);
  });

  it("próximo aniversário: o próprio dia conta; vira o ano; 29/02 cai em 28/02 fora do bissexto", () => {
    expect(nextBirthday("1995-10-23", "2026-10-23")).toEqual({ day: "2026-10-23", days: 0 });
    expect(nextBirthday("1995-10-26", "2026-10-23")).toEqual({ day: "2026-10-26", days: 3 });
    expect(nextBirthday("1995-10-22", "2026-10-23")).toEqual({ day: "2027-10-22", days: 364 });
    expect(nextBirthday("1990-01-01", "2026-12-30")).toEqual({ day: "2027-01-01", days: 2 });
    expect(nextBirthday("2000-02-29", "2027-02-20")).toEqual({ day: "2027-02-28", days: 8 });
    expect(nextBirthday("2000-02-29", "2028-02-28")).toEqual({ day: "2028-02-29", days: 1 });
    expect(birthdayLabel("1995-03-15")).toBe("15/03");
    expect(birthdayLabel("1995-03-15", true)).toBe("15/03/1995");
  });

  it("tarefa de aniversário: motivo e parabéns prontos (sem falar de produto)", () => {
    expect(actionDetail({ kind: "BIRTHDAY", day: "2026-10-23", days: 0 })).toBe("faz aniversário hoje");
    expect(actionDetail({ kind: "BIRTHDAY", day: "2026-10-24", days: 1 })).toBe("faz aniversário amanhã (24/10)");
    expect(actionDetail({ kind: "BIRTHDAY", day: "2026-10-26", days: 3 })).toBe("faz aniversário em 3 dias (26/10)");
    expect(actionMessage({ kind: "BIRTHDAY", day: "2026-10-23", days: 0 }, "Maria Silva", "Revita Derma")).toBe(
      "Oi, Maria! Aqui é da Revita Derma. Feliz aniversário! 🎉 Que seu novo ano seja incrível. Obrigada por fazer parte do nosso time!",
    );
  });

  it("tag: nome limpo até 30; mesma chave sem acento e maiúscula; vazio não vale", () => {
    expect(tagName("  Mãe   de pet ")).toEqual({ name: "Mãe de pet", key: "mae de pet" });
    expect(tagName("MÃE DE PET")!.key).toBe("mae de pet");
    expect(tagName("x".repeat(40))!.name).toHaveLength(30);
    expect(tagName("   ")).toBeNull();
  });
});
