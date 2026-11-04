import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * D-CONTRACTFILE: PDF do contrato assinado anexado na ficha (pedido da Revita). A Gestão da marca (quem edita creators)
 * anexa; a creator vê e baixa no portal. O arquivo sobe direto do navegador para o bucket privado `contratos` por um
 * link de uso único; aqui o servidor confere o PDF e grava. Anexar outro aponta para o novo arquivo; o anterior continua
 * guardado (nada é apagado) e tudo vai para a auditoria.
 */

export class ContractFileError extends Error {}

export const CONTRACT_BUCKET = "contratos";
export const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

export function assertUploadId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ContractFileError("Envio inválido. Escolha o arquivo de novo.");
}

export const contractFilePath = (brandId: string, creatorId: string, uploadId: string) => `${brandId}/${creatorId}/${uploadId}.pdf`;

/** Quem edita creators da marca dela pode anexar. Devolve a marca (para montar o caminho do arquivo). */
export async function assertCanAttach(prisma: PrismaClient, actor: Actor | null, creatorId: string): Promise<{ brandId: string }> {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
  if (!c) throw new ContractFileError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", c.brandId)) throw new ContractFileError("Sem permissão.");
  return { brandId: c.brandId };
}

export function checkContractPdf(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new ContractFileError("Envie o contrato em PDF.");
  if (bytes.byteLength > MAX_CONTRACT_BYTES) throw new ContractFileError("O PDF passa de 10 MB.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new ContractFileError("O arquivo não é um PDF.");
}

export async function attachContractFile(prisma: PrismaClient, actor: Actor | null, creatorId: string, uploadId: string, pdf: Uint8Array) {
  assertUploadId(uploadId);
  const { brandId } = await assertCanAttach(prisma, actor, creatorId);
  checkContractPdf(pdf);
  const path = contractFilePath(brandId, creatorId, uploadId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { contractFileId: true } });
    const file = await tx.file.create({
      data: { brandId, bucket: CONTRACT_BUCKET, path, mime: "application/pdf", sizeBytes: pdf.byteLength, sha256: createHash("sha256").update(pdf).digest("hex"), uploadedById: actor!.userId },
    });
    await tx.creator.update({ where: { id: creatorId }, data: { contractFileId: file.id } });
    await tx.auditLog.create({
      data: { brandId, actorType: "USER", actorId: actor!.userId, action: "creator.contract_file", entity: "Creator", entityId: creatorId, before: { contractFileId: before.contractFileId }, after: { contractFileId: file.id, sizeBytes: pdf.byteLength } },
    });
    return { fileId: file.id };
  });
}

/** Onde está o contrato anexado, para a equipe (quem vê a creator) ou para a própria creator (`creatorId` do portal). */
export async function contractFileLocation(prisma: PrismaClient, who: { actor: Actor | null } | { portalCreatorId: string }, creatorId: string) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, contractFile: { select: { bucket: true, path: true } } } });
  if (!c) throw new ContractFileError("Creator não encontrada.");
  const allowed = "actor" in who ? !!who.actor && can(who.actor.grants, "creators.view", c.brandId) : who.portalCreatorId === creatorId;
  if (!allowed) throw new ContractFileError("Sem permissão.");
  if (!c.contractFile) throw new ContractFileError("Nenhum contrato anexado.");
  return c.contractFile;
}
