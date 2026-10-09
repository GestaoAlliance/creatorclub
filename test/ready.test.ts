import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/ready/route";

describe("GET /api/ready", () => {
  it("responde 503 sem detalhes quando o banco não está configurado", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: "erro" });
  });
});
