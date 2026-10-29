import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique, loadAutentique } from "@/lib/autentique/credentials";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const encKey = randomBytes(32);
const ok: Fetcher = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: { me: { id: "u", name: "Botanika", email: "creators@x.com" } } }) });
const refused: Fetcher = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: "Unauthenticated." }) });

describe("conexão do Autentique (D-AUTENTIQUE, banco real)", () => {
  it("só super admin conecta; chave conferida, guardada cifrada e lida de volta; chave recusada não grava", async () => {
    const { brand } = await seedBrand(prisma);
    const mk = async (role: "SUPER_ADMIN" | "GESTAO") => {
      const id = randomUUID();
      await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId: role === "SUPER_ADMIN" ? null : brand.id } } } });
      return (await loadActor(prisma, id))!;
    };
    const admin = await mk("SUPER_ADMIN");
    const gestao = await mk("GESTAO");
    const token = "a".repeat(64);

    await expect(connectAutentique(prisma, gestao, { brandId: brand.id, token, sandbox: false }, ok, encKey)).rejects.toThrow(/Sem permissão/);
    await expect(connectAutentique(prisma, admin, { brandId: brand.id, token, sandbox: false }, refused, encKey)).rejects.toThrow(/recusada/);
    expect(await loadAutentique(prisma, brand.id, encKey)).toBeNull();

    expect(await connectAutentique(prisma, admin, { brandId: brand.id, token, sandbox: true }, ok, encKey)).toEqual({ account: "creators@x.com" });
    const row = await prisma.brandIntegration.findUniqueOrThrow({ where: { brandId_kind: { brandId: brand.id, kind: "AUTENTIQUE" } } });
    expect(row.secretEncrypted).not.toContain(token);
    expect(await loadAutentique(prisma, brand.id, encKey)).toEqual({ brandId: brand.id, token, sandbox: true, account: "creators@x.com" });
  });
});
