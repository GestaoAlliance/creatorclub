import type { PrismaClient } from "@/generated/prisma/client";
import { addMonthsToDay, contractMonthsFor, isDayKey } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Contrato e checklist da creator (D-CHECKLIST): início e fim do contrato (sem fim informado, o fim é o início + 6
 * meses, UGC 3) e os itens que a Central controlava: contrato assinado, cupom cadastrado, seguimos no Instagram,
 * grupo e etiquetada; e se recebe como pessoa física (D-PFRECEIPT). Quem edita creators (Gestão, super admin) muda; vai para a auditoria.
 */

export class ContractError extends Error {}

export type ChecklistInput = {
  start: string | null;
  end: string | null;
  contractSigned: boolean | null;
  couponRegistered: boolean | null;
  followsOnInstagram: boolean | null;
  inGroup: boolean | null;
  tagged: boolean | null;
  note: string | null;
  /** D-CONTRACTVER: modelo de contrato assinado (da mesma marca); `undefined` = não mexe. */
  templateId?: string | null;
  /** D-PFRECEIPT: recebe como pessoa física (recibo no lugar da nota); `undefined` = não mexe. */
  receivesAsIndividual?: boolean;
};

const toDate = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`) : null);
export const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function updateChecklist(prisma: PrismaClient, actor: Actor | null, creatorId: string, input: ChecklistInput) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) throw new ContractError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", creator.brandId)) throw new ContractError("Sem permissão.");
  for (const d of [input.start, input.end]) if (d !== null && !isDayKey(d)) throw new ContractError("Data inválida.");
  const end = input.end ?? (input.start ? addMonthsToDay(input.start, contractMonthsFor(creator.categories)) : null);
  if (input.start && end && end <= input.start) throw new ContractError("O fim do contrato precisa ser depois do início.");
  const note = input.note?.trim().replace(/\s+/g, " ").slice(0, 300) || null;
  if (input.templateId) {
    const t = await prisma.contractTemplate.findFirst({ where: { id: input.templateId, brandId: creator.brandId }, select: { id: true } });
    if (!t) throw new ContractError("Modelo de contrato inválido.");
  }
  const data = {
    contractStart: toDate(input.start),
    contractEnd: toDate(end),
    contractSigned: input.contractSigned,
    couponRegistered: input.couponRegistered,
    followsOnInstagram: input.followsOnInstagram,
    inGroup: input.inGroup,
    tagged: input.tagged,
    checklistNote: note,
    ...(input.templateId !== undefined ? { contractTemplateId: input.templateId } : {}),
    ...(input.receivesAsIndividual !== undefined ? { receivesAsIndividual: input.receivesAsIndividual } : {}),
  };
  const before = {
    contractTemplateId: creator.contractTemplateId,
    contractStart: dayOf(creator.contractStart),
    contractEnd: dayOf(creator.contractEnd),
    contractSigned: creator.contractSigned,
    couponRegistered: creator.couponRegistered,
    followsOnInstagram: creator.followsOnInstagram,
    inGroup: creator.inGroup,
    tagged: creator.tagged,
    checklistNote: creator.checklistNote,
    receivesAsIndividual: creator.receivesAsIndividual,
  };
  await prisma.$transaction([
    prisma.creator.update({ where: { id: creatorId }, data }),
    prisma.auditLog.create({
      data: {
        brandId: creator.brandId,
        actorType: "USER",
        actorId: actor.userId,
        action: "creator.checklist",
        entity: "Creator",
        entityId: creatorId,
        before,
        after: { ...data, contractStart: input.start, contractEnd: end },
      },
    }),
  ]);
  return { end };
}
