import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";
import { rateToBps } from "@/lib/import/legacy";

describe("CSV", () => {
  it("lê aspas, vírgula e quebra de linha dentro de aspas, aspas escapadas e BOM", () => {
    const csv = '﻿id,name,notes\r\n1,"Silva, Ana","linha 1\nlinha 2"\n2,Bia,"diz ""oi"""\n';
    expect(parseCsv(csv)).toEqual([
      { id: "1", name: "Silva, Ana", notes: "linha 1\nlinha 2" },
      { id: "2", name: "Bia", notes: 'diz "oi"' },
    ]);
  });

  it("aspas sem fechar é erro; arquivo vazio dá lista vazia", () => {
    expect(() => parseCsv('id\n"1')).toThrow(/aspas/);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("taxa do app antigo", () => {
  it("converte a fração em pontos-base sem Float", () => {
    expect(rateToBps("0.15")).toBe(1500);
    expect(rateToBps("0.2")).toBe(2000);
    expect(rateToBps("0.05")).toBe(500);
    expect(() => rateToBps("0.125")).toThrow();
    expect(() => rateToBps("")).toThrow();
  });
});
