import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/forms/[marca]/hunter/route";

const ctx = { params: Promise.resolve({ marca: "botanika" }) } as Parameters<typeof POST>[1];
const SECRET = "s".repeat(40);
const req = (auth: string | null, body: string) =>
  new Request("http://x/api/forms/botanika/hunter", { method: "POST", headers: auth ? { authorization: auth } : {}, body });

afterEach(() => {
  delete process.env.FORMS_SECRET;
});

describe("rota do formulário Hunter", () => {
  it("sem o segredo certo: 401 (e sem segredo configurado, nada entra)", async () => {
    expect((await POST(req(`Bearer ${SECRET}`, "{}"), ctx)).status).toBe(401);
    process.env.FORMS_SECRET = SECRET;
    expect((await POST(req(null, "{}"), ctx)).status).toBe(401);
    expect((await POST(req("Bearer errado", "{}"), ctx)).status).toBe(401);
  });

  it("corpo inválido: 400", async () => {
    process.env.FORMS_SECRET = SECRET;
    expect((await POST(req(`Bearer ${SECRET}`, "não é json"), ctx)).status).toBe(400);
    expect((await POST(req(`Bearer ${SECRET}`, JSON.stringify({ responseId: "1", submittedAt: "x", answers: {} })), ctx)).status).toBe(400);
  });
});
