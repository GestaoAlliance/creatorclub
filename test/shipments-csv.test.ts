import { describe, expect, it } from "vitest";
import { shipmentKind, shipmentsCsv } from "@/domain";

describe("planilha dos envios (D-SHIPCSV)", () => {
  it("tipo do envio pelo kit ou pela compra com saldo", () => {
    expect(shipmentKind("WELCOME", null)).toBe("Boas-vindas");
    expect(shipmentKind("GOAL", null)).toBe("Meta de vendas");
    expect(shipmentKind("MONTHLY", null)).toBe("Kit do mês");
    expect(shipmentKind(null, 5_000)).toBe("Loja (saldo)");
    expect(shipmentKind(null, null)).toBe("Avulso (equipe)");
  });

  it("endereço em texto livre vai na coluna Rua; custo vazio quando falta custo; aspas quando há ponto e vírgula", () => {
    const csv = shipmentsCsv(
      [{
        createdAt: new Date("2026-10-20T15:00:00Z"), status: "PREPARING", kind: "Boas-vindas", creator: "Maria; Silva", instagram: null, doc: null, phone: null, email: null,
        address: { raw: "Rua A, 10 - Centro" }, items: [{ title: "Whey", quantity: 1, unitCostCents: null }], freightCents: null, carrier: null, trackingCode: null, shippedAt: null, deliveredAt: null,
      }],
      new Date("2026-10-29T15:00:00Z"),
    );
    const line = csv.split("\r\n")[1]!;
    expect(line).toBe('20/10/2026;Preparando;Boas-vindas;"Maria; Silva";;;;;;Rua A, 10 - Centro;;;;;;1x Whey;1;;;;;;;9');
  });
});
