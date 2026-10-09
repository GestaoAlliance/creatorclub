import { describe, expect, inject, it } from "vitest";

describe("GET /api/ready (banco real)", () => {
  it("responde ok quando alcança o banco", async () => {
    process.env.DATABASE_URL = inject("testDatabaseUrl");
    const { GET } = await import("@/app/api/ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "ok" });
  });
});
