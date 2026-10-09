import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

export function testClient(): PrismaClient {
  const schema = inject("testSchema");
  // search_path também no schema de teste: SQL cru (ex.: fila de tarefas) usa nomes sem schema.
  const adapter = new PrismaPg(
    { connectionString: inject("testDatabaseUrl"), options: `-c search_path=${schema},public` },
    { schema },
  );
  return new PrismaClient({ adapter });
}

const suffix = () => randomUUID().slice(0, 8);

/** Monta uma marca com uma creator, um cupom CREATOR e um pedido. Dados isolados por chamada. */
export async function seedBrand(prisma: PrismaClient) {
  const s = suffix();
  const brand = await prisma.brand.create({ data: { slug: `marca-${s}`, name: `Marca ${s}` } });
  const account = await prisma.creatorAccount.create({
    data: { name: `Creator ${s}`, email: `creator-${s}@example.com` },
  });
  const creator = await prisma.creator.create({
    data: { brandId: brand.id, accountId: account.id, categories: ["INFLUENCER"] },
  });
  const coupon = await prisma.coupon.create({
    data: { brandId: brand.id, code: `C${s.replace(/\d/g, "X").toUpperCase()}`, kind: "CREATOR" },
  });
  const order = await prisma.order.create({
    data: {
      brandId: brand.id,
      shopifyId: `gid://shopify/Order/${s}`,
      name: `#${s}`,
      createdAtShop: new Date("2026-09-01T12:00:00Z"),
      paidAt: new Date("2026-09-01T12:00:00Z"),
      financialStatus: "PAID",
      subtotalCents: 20_000,
      totalCents: 22_000,
      discountCodes: [coupon.code],
      shopifyUpdatedAt: new Date("2026-09-01T12:00:00Z"),
    },
  });
  return { brand, account, creator, coupon, order };
}

export function commissionEntry(
  ids: { brandId: string; creatorId: string; orderId: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    brandId: ids.brandId,
    creatorId: ids.creatorId,
    orderId: ids.orderId,
    type: "COMMISSION" as const,
    amountCents: 3_000,
    baseCents: 20_000,
    rateBps: 1500,
    availableAt: new Date("2026-09-01T12:00:00Z"),
    idempotencyKey: `commission:${ids.orderId}:${randomUUID()}`,
    ...overrides,
  };
}

/** Mensagem original do Postgres dentro de um erro do Prisma (driver adapter). */
export function dbMessage(error: unknown): string {
  const e = error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } }; message?: string };
  return e.meta?.driverAdapterError?.cause?.originalMessage ?? e.message ?? String(error);
}

/** Espera que a operação falhe no banco com uma mensagem que case com o padrão. */
export async function expectDbError(op: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await op;
  } catch (error) {
    const message = dbMessage(error);
    if (!pattern.test(message)) throw new Error(`erro inesperado do banco: ${message}`);
    return;
  }
  throw new Error("a operação deveria ter falhado no banco, mas passou");
}
