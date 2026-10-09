import type { PrismaClient } from "@/generated/prisma/client";
import { brandsWith, type Grant, type Permission } from "./permissions";

/** Quem está agindo: pessoa da equipe (papéis por marca) e/ou creator (participações por marca). */
export type Actor = {
  userId: string;
  grants: Grant[];
  /** Participações de creator: brandId → creatorId. Creator só vê os próprios dados. */
  creatorIds: Record<string, string>;
};

/**
 * Carrega o Actor de um usuário do Auth. Sem `User` correspondente ou com `disabledAt`: sem acesso (null).
 * Nunca liga conta por e-mail: só pelo id do Auth (= User.id).
 */
export async function loadActor(prisma: PrismaClient, userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      disabledAt: true,
      roleGrants: { select: { role: true, brandId: true } },
      creatorAccount: { select: { creators: { select: { id: true, brandId: true } } } },
    },
  });
  if (!user || user.disabledAt) return null;
  const creatorIds: Record<string, string> = {};
  for (const c of user.creatorAccount?.creators ?? []) creatorIds[c.brandId] = c.id;
  return { userId, grants: user.roleGrants, creatorIds };
}

/**
 * Filtro de marca para consultas da equipe: `{}` (todas), `{ brandId: { in } }` ou `null` (nenhuma — não consultar).
 * Toda consulta de dados de marca passa por aqui.
 */
export function staffBrandFilter(
  actor: Actor,
  permission: Permission,
): Record<string, never> | { brandId: { in: string[] } } | null {
  const allowed = brandsWith(actor.grants, permission);
  if (allowed === "ALL") return {};
  return allowed.length ? { brandId: { in: allowed } } : null;
}
