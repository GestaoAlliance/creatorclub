import { describe, expect, it } from "vitest";
import { checkPdf, MAX_NF_BYTES, nfPath } from "../src/lib/withdrawals/request";

describe("nota fiscal do saque", () => {
  it("aceita só PDF de até 10 MB", () => {
    expect(() => checkPdf(new TextEncoder().encode("%PDF-1.7"))).not.toThrow();
    expect(() => checkPdf(new Uint8Array())).toThrow(/Envie/);
    expect(() => checkPdf(new TextEncoder().encode("PK zip"))).toThrow(/não é um PDF/);
    const big = new Uint8Array(MAX_NF_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    expect(() => checkPdf(big)).toThrow(/10 MB/);
  });

  it("caminho do arquivo por marca, creator e pedido", () => {
    expect(nfPath("b", "c", "r")).toBe("b/c/r.pdf");
  });
});

describe("cópia conferida da nota (D-NODOUBLEPAY)", () => {
  it("fica num caminho diferente do envio da creator", async () => {
    const { nfFinalPath, nfPath: p } = await import("../src/lib/withdrawals/request");
    expect(nfFinalPath("b", "c", "r")).toBe("b/c/r.conferida.pdf");
    expect(nfFinalPath("b", "c", "r")).not.toBe(p("b", "c", "r"));
  });
});
