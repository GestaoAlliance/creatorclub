import { describe, expect, it } from "vitest";
import { OLIST_API, OlistError, olistStockBySku, olistToken, type OlistFetcher } from "@/lib/olist/client";
import { stockLowText } from "@/domain";

type Call = { url: string; body: string };
const fake = (replies: Record<string, unknown>, calls: Call[] = []): OlistFetcher => async (url, init) => {
  calls.push({ url, body: init.body });
  const method = url.replace(`${OLIST_API}/`, "").replace(".php", "");
  return { ok: true, status: 200, text: async () => JSON.stringify({ retorno: replies[method] }) };
};

describe("Olist ERP (D-OLIST)", () => {
  it("token por marca na variável segura; JSON quebrado ou marca sem token ficam sem", () => {
    const env = { OLIST_TOKENS: JSON.stringify({ botanika: "a".repeat(64) }) };
    expect(olistToken("botanika", env)).toBe("a".repeat(64));
    expect(olistToken("vermefree", env)).toBeNull();
    expect(olistToken("botanika", { OLIST_TOKENS: "{" })).toBeNull();
  });

  it("estoque pelo SKU: pesquisa, confere o código exato e lê o saldo", async () => {
    const calls: Call[] = [];
    const f = fake({
      "produtos.pesquisa": { status: "OK", produtos: [{ produto: { id: "1", codigo: "80.1.10" } }, { produto: { id: "2", codigo: "80.1.1" } }] },
      "produto.obter.estoque": { status: "OK", produto: { id: "2", saldo: "35.0000" } },
    }, calls);
    expect(await olistStockBySku("tok", "80.1.1", f)).toEqual({ found: true, id: "2", saldo: 35 });
    expect(calls[0]!.body).toContain("token=tok");
    expect(calls[0]!.body).toContain("formato=json");
    expect(calls[1]!.body).toContain("id=2");
  });

  it("sem registros = não encontrado; outro erro do Olist vira mensagem", async () => {
    expect(await olistStockBySku("tok", "X", fake({ "produtos.pesquisa": { status: "Erro", codigo_erro: "20", erros: [{ erro: "A consulta não retornou registros" }] } }))).toEqual({ found: false });
    await expect(olistStockBySku("tok", "X", fake({ "produtos.pesquisa": { status: "Erro", codigo_erro: "6", erros: [{ erro: "API Bloqueada" }] } }))).rejects.toThrow(OlistError);
  });

  it("texto do estoque baixo", () => {
    const t = stockLowText("Botanika", [{ title: "Tri[Mg]", qty: 0 }, { title: "Whey", qty: 12 }], "https://x.test/admin/envios");
    expect(t).toContain("• Tri[Mg]: sem estoque");
    expect(t).toContain("• Whey: 12 unidades");
  });
});
