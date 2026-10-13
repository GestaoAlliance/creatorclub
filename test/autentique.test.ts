import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { AUTENTIQUE_URL, AutentiqueError, autentiqueMe, createAutentiqueDocument, getAutentiqueDocument, type Fetcher } from "@/lib/autentique/client";
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
      fake(200, { data: { createDocument: { id: "doc-1" } } }, calls),
    );
    expect(r.id).toBe("doc-1");
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
