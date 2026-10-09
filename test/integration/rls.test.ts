import { afterAll, describe, expect, inject, it } from "vitest";
import { testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("RLS (Data API do Supabase)", () => {
  it("toda tabela do schema tem RLS ligado", async () => {
    const tabelas = await prisma.$queryRaw<{ relname: string; rls: boolean }[]>`
      SELECT c.relname, c.relrowsecurity AS rls FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${inject("testSchema")} AND c.relkind IN ('r', 'p')
      ORDER BY 1`;
    expect(tabelas.length).toBeGreaterThan(15);
    expect(tabelas.filter((t) => !t.rls).map((t) => t.relname)).toEqual([]);
  });

  it("o dono das tabelas (o app) continua lendo e gravando", async () => {
    const brand = await prisma.brand.create({ data: { slug: `rls-${Date.now()}`, name: "RLS" } });
    expect(await prisma.brand.findUnique({ where: { id: brand.id } })).not.toBeNull();
  });
});
