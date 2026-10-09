import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
// @ts-expect-error script .mjs sem tipos
import { grantSuperAdmin } from "../../scripts/grant-super-admin.mjs";
import { testClient } from "./fixtures";

const prisma = testClient();
const client = new pg.Client({
  connectionString: inject("testDatabaseUrl"),
  options: `-c search_path=${inject("testSchema")}`,
});

beforeAll(async () => {
  await client.connect();
  // Imita o schema do Supabase Auth (no Supabase ele já existe).
  await client.query("CREATE SCHEMA IF NOT EXISTS auth");
  await client.query("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text)");
});
afterAll(async () => {
  await client.end();
  await prisma.$disconnect();
});

async function authUser() {
  const id = randomUUID();
  const email = `Admin-${id}@Example.com`;
  await client.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, email]);
  return { id, email };
}

describe("grant-super-admin", () => {
  it("cria o User com o id do Auth, concede SUPER_ADMIN global e registra na auditoria", async () => {
    const { id, email } = await authUser();
    const result = await grantSuperAdmin(client, { email, name: "Admin" });
    expect(result).toEqual({ userId: id, userCreated: true, granted: true });

    const actor = await loadActor(prisma, id);
    expect(actor?.grants).toEqual([{ role: "SUPER_ADMIN", brandId: null }]);
    const user = await prisma.user.findUnique({ where: { id } });
    expect(user?.email).toBe(email.toLowerCase());
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "role.grant" } })).toBe(1);
  });

  it("rodar de novo não duplica nada", async () => {
    const { id, email } = await authUser();
    await grantSuperAdmin(client, { email, name: "Admin" });
    const again = await grantSuperAdmin(client, { email: email.toUpperCase(), name: "Outro nome" });
    expect(again).toEqual({ userId: id, userCreated: false, granted: false });
    expect(await prisma.roleGrant.count({ where: { userId: id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(1);
    expect((await prisma.user.findUnique({ where: { id } }))?.name).toBe("Admin");
  });

  it("e-mail sem usuário no Auth falha sem gravar nada", async () => {
    const before = await prisma.user.count();
    await expect(grantSuperAdmin(client, { email: `ninguem-${randomUUID()}@example.com`, name: "X" }))
      .rejects.toThrow(/Usuário do Auth não encontrado/);
    expect(await prisma.user.count()).toBe(before);
  });
});
