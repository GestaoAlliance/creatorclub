import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { AUTENTIQUE_URL, AutentiqueError, autentiqueMe, createAutentiqueDocument, deleteAutentiqueDocument, getAutentiqueDocument, type Fetcher } from "@/lib/autentique/client";
import { nextWhatsAppTime } from "@/lib/autentique/applications";
import { contractLinkMessage, rejectionMessage } from "@/domain";
import { contractPdf } from "@/lib/autentique/pdf";

type Call = { url: string; headers: Record<string, string>; body: string | FormData };
const fake = (status: number, json: unknown, calls: Call[] = []): Fetcher => async (url, init) => {
  calls.push({ url, headers: init.headers, body: init.body });
  return { ok: status < 400, status, text: async () => JSON.stringify(json) };
};

describe("cliente do Autentique (D-AUTENTIQUE)", () => {
  it("testar conexão: manda a chave como Bearer e devolve a conta", async () => {
    const calls: Call[] = [];
    const me = await autentiqueMe("tok_123", fake(200, { data: { me: { id: "u1", name: "Botanika", email: "creators@x.com" } } }, calls));
    expect(me.email).toBe("creators@x.com");
    expect(calls[0]).toMatchObject({ url: AUTENTIQUE_URL, headers: { Authorization: "Bearer tok_123" } });
  });

  it("chave recusada e erro do GraphQL viram mensagem clara", async () => {
    await expect(autentiqueMe("x", fake(401, { message: "Unauthenticated." }))).rejects.toThrow(/Chave do Autentique recusada/);
    await expect(autentiqueMe("x", fake(200, { errors: [{ message: "boom" }] }))).rejects.toThrow(AutentiqueError);
  });

  it("criar documento vai em multipart: operations com file nulo, map e o PDF; a creator assina (SIGN)", async () => {
    const calls: Call[] = [];
    const r = await createAutentiqueDocument(
      "tok",
      { name: "Contrato", message: "Confira", pdf: new Uint8Array([37, 80, 68, 70]), fileName: "contrato.pdf", signers: [{ name: "Maria", email: "maria@x.com" }], sandbox: true },
      fake(200, { data: { createDocument: { id: "doc-1", signatures: [{ action: null, link: null }, { action: { name: "SIGN" }, link: { short_link: "https://assina.ae/x" } }] } } }, calls),
    );
    expect(r).toEqual({ id: "doc-1", signLink: "https://assina.ae/x" });
    const form = calls[0]!.body as FormData;
    const ops = JSON.parse(String(form.get("operations")));
    expect(ops.variables).toMatchObject({ file: null, sandbox: true, signers: [{ name: "Maria", email: "maria@x.com", action: "SIGN" }] });
    expect(JSON.parse(String(form.get("map")))).toEqual({ file: ["variables.file"] });
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(calls[0]!.headers["Content-Type"]).toBeUndefined(); // o fetch põe o boundary do multipart
  });

  it("situação do documento: assinou, recusou e o PDF assinado", async () => {
    const doc = await getAutentiqueDocument(
      "tok",
      "doc-1",
      fake(200, {
        data: {
          document: {
            id: "doc-1",
            files: { signed: "https://x/signed.pdf" },
            signatures: [
              { email: "dono@x.com", action: null, signed: null, rejected: null },
              { email: "maria@x.com", action: { name: "SIGN" }, signed: { created_at: "2026-10-13 18:00:00" }, rejected: null },
            ],
          },
        },
      }),
    );
    expect(doc).toEqual({ id: "doc-1", signedFileUrl: "https://x/signed.pdf", signatures: [{ email: "maria@x.com", signedAt: "2026-10-13 18:00:00", rejectedAt: null, rejectReason: null }] });
  });
});

describe("contrato da candidata (D-AUTENTIQUE2)", () => {
  it("cancelar manda deleteDocument com o id", async () => {
    const calls: Call[] = [];
    await deleteAutentiqueDocument("tok", "doc-9", fake(200, { data: { deleteDocument: true } }, calls));
    expect(JSON.parse(calls[0]!.body as string)).toMatchObject({ variables: { id: "doc-9" } });
    expect(String(JSON.parse(calls[0]!.body as string).query)).toContain("deleteDocument");
  });

  it("link no WhatsApp só das 9h às 20h de São Paulo", () => {
    const at = (iso: string) => nextWhatsAppTime(new Date(iso)).toISOString();
    expect(at("2026-10-29T15:00:00Z")).toBe("2026-10-29T15:00:00.000Z"); // 12h em SP: agora
    expect(at("2026-10-29T10:00:00Z")).toBe("2026-10-29T12:00:00.000Z"); // 7h em SP: às 9h do mesmo dia
    expect(at("2026-10-30T01:30:00Z")).toBe("2026-10-30T12:00:00.000Z"); // 22h30 do dia 29 em SP: 9h do dia 30
  });

  it("mensagens aprovadas: link do contrato e recusa, com o primeiro nome", () => {
    const link = contractLinkMessage({ name: "Maria da Silva", brand: "Botanika", link: "https://assina.ae/x" });
    expect(link).toMatch(/^Oi, Maria! Recebemos seu cadastro na Botanika/);
    expect(link).toContain("🔗 https://assina.ae/x");
    expect(rejectionMessage({ name: "Maria da Silva", brand: "VermeFree" })).toMatch(/^Oi, Maria! Obrigada pelo interesse em ser parceira da VermeFree .* Um abraço!$/);
  });
});

describe("PDF do contrato (D-AUTENTIQUE)", () => {
  it("gera PDF com o título e o texto, acentos mantidos e emoji trocado", async () => {
    const body = Array.from({ length: 120 }, (_, i) => `Cláusula ${i + 1}: a creator divulga a marca com o cupom e recebe comissão ✅.`).join("\n");
    const pdf = await contractPdf("Contrato de parceria — Botanika", body);
    const doc = await getDocumentProxy(pdf);
    expect(doc.numPages).toBeGreaterThan(1);
    const { text } = await extractText(doc, { mergePages: true });
    expect(text).toContain("Contrato de parceria");
    expect(text).toContain("Cláusula 120");
  });
});
