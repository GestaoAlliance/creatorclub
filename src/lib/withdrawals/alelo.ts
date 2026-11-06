import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";

/**
 * D-ALELOCARD (respostas do Sr. Guilherme e do responsável, 2026-11-06): pessoa física recebe a comissão no cartão
 * Alelo. O Pagamento baixa a planilha de pedido de cartão (modelo "Solicitação de Cartão Personalizado Pré-Pago" da
 * Alelo) com as creators ativas de CPF que ainda não tiveram o cartão pedido e já têm os dados que a Alelo pede (CPF,
 * data de nascimento, nome da mãe). Quem entra na planilha fica marcado ("cartão pedido em …") para não repetir.
 * Matrícula e centro de custo ficam vazios (resposta do Sr. Guilherme).
 */

export class AleloError extends Error {}

export const ALELO_CARD_HEADER = ["Nome Completo", "Data de Nascimento", "CPF", "Matricula", "E-mail", "Nome da Mãe", "DDD Telefone Fixo", "Telefone Fixo", "DDD Telefone Celular", "Telefone Celular", "Centro de Custo"] as const;
const SHEET = "Solicitacao_de_Cartao_Personali";

/** Celular do cadastro → [DDD, número] (sem o +55). */
export function splitPhone(raw: string | null | undefined): [string, string] | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return [d.slice(0, 2), d.slice(2)];
}

function assertManage(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "withdrawals.manage", brandId)) throw new AleloError("Sem permissão.");
}

/** Quem está pronta para o pedido de cartão e quem ainda falta dado (nome da mãe, data de nascimento ou CPF). */
export async function aleloCardStatus(prisma: PrismaClient, actor: Actor | null, brandId: string) {
  assertManage(actor, brandId);
  const creators = await prisma.creator.findMany({
    where: { brandId, status: "ACTIVE", archivedAt: null, awaitingContractAt: null, receivesAsIndividual: true, aleloCardRequestedAt: null },
    orderBy: { account: { name: "asc" } },
    select: { id: true, account: { select: { name: true, cpf: true, birthDate: true, motherName: true, email: true, phone: true } } },
  });
  const missing = (a: (typeof creators)[number]["account"]) =>
    [!a.motherName && "nome da mãe", !a.birthDate && "data de nascimento", (a.cpf ?? "").replace(/\D/g, "").length !== 11 && "CPF"].filter(Boolean) as string[];
  return {
    ready: creators.filter((c) => missing(c.account).length === 0),
    incomplete: creators.flatMap((c) => (missing(c.account).length ? [{ id: c.id, name: c.account.name, missing: missing(c.account) }] : [])),
  };
}

/** Gera a planilha com quem está pronta e marca o pedido do cartão (nada é apagado; tudo na auditoria). */
export async function aleloCardSheet(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  const { ready } = await aleloCardStatus(prisma, actor, brandId);
  if (ready.length === 0) throw new AleloError("Ninguém pronto para o pedido de cartão agora.");
  const rows: XlsxCell[][] = [[...ALELO_CARD_HEADER]];
  for (const c of ready) {
    const a = c.account;
    const phone = splitPhone(a.phone);
    rows.push([a.name, a.birthDate, a.cpf!.replace(/\D/g, ""), null, a.email, a.motherName, null, null, phone?.[0] ?? null, phone?.[1] ?? null, null]);
  }
  const ids = ready.map((c) => c.id);
  await prisma.$transaction([
    prisma.creator.updateMany({ where: { id: { in: ids }, aleloCardRequestedAt: null }, data: { aleloCardRequestedAt: now } }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor!.userId, action: "alelo.card_sheet", entity: "Brand", entityId: brandId, after: { creators: ids } } }),
  ]);
  return { file: buildXlsx(SHEET, rows), count: ready.length };
}
