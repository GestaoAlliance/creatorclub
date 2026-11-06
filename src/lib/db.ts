import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * D-DBPOOL (queda de 06/11/2026: "max client connections reached, limit: 200"): cada instância da Vercel abre no
 * máximo `DB_POOL_MAX` conexões, fecha as paradas em poucos segundos e avisa a Vercel (`attachDatabasePool`) para
 * fechá-las antes de a instância ser suspensa. Sem isso, cada instância segurava até 10 conexões abertas no pooler
 * do Supabase e, com muitas instâncias, o limite de 200 estourava e o site caía.
 */
export const DB_POOL_MAX = 3;

/** Configuração do pool de cada instância (limite baixo, conexões paradas fecham em 5 s). */
export function poolConfig(connectionString: string) {
  if (!connectionString) throw new Error("DATABASE_URL não configurado.");
  return { connectionString, max: DB_POOL_MAX, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 15_000 };
}

/** Cria um cliente Prisma para a URL dada (Postgres via driver `pg`). */
export function createPrismaClient(connectionString: string): PrismaClient {
  const pool = new Pool(poolConfig(connectionString));
  attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

// Um cliente por processo; em dev o hot reload reaproveita o mesmo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient(process.env.DATABASE_URL ?? "");
  return globalForPrisma.prisma;
}
