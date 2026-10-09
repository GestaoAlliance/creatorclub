import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/jobs/run/route";
import { backoffMs } from "@/lib/jobs/queue";
import { isAuthorizedBearer } from "@/lib/jobs/secret";

const SECRET = "s".repeat(40);

describe("fila: espera entre tentativas", () => {
  it("dobra a cada tentativa, de 30 s até no máximo 1 h", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe("segredo das chamadas agendadas", () => {
  it("aceita só o segredo exato no formato Bearer", () => {
    expect(isAuthorizedBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedBearer(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedBearer(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedBearer(null, SECRET)).toBe(false);
  });

  it("sem segredo configurado, ou curto demais, ninguém passa", () => {
    expect(isAuthorizedBearer("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
    expect(isAuthorizedBearer("Bearer curto", "curto")).toBe(false);
  });
});

describe("POST /api/jobs/run", () => {
  it("responde 401 sem o segredo, sem tocar no banco", async () => {
    process.env.JOBS_SECRET = SECRET;
    delete process.env.DATABASE_URL;
    const res = await POST(new Request("http://x/api/jobs/run", { method: "POST", headers: { authorization: "Bearer errado" } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });
});
