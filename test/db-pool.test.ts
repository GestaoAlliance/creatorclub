import { describe, expect, it } from "vitest";
import { DB_POOL_MAX, poolConfig } from "@/lib/db";

describe("D-DBPOOL: pool de conexões por instância", () => {
  it("limita as conexões e fecha as paradas", () => {
    const c = poolConfig("postgresql://u:p@h:6543/db");
    expect(c.max).toBe(DB_POOL_MAX);
    expect(DB_POOL_MAX).toBeLessThanOrEqual(5);
    expect(c.idleTimeoutMillis).toBeLessThanOrEqual(10_000);
    expect(c.connectionTimeoutMillis).toBeGreaterThan(0);
  });
  it("sem URL, erro claro", () => {
    expect(() => poolConfig("")).toThrow("DATABASE_URL não configurado.");
  });
});
