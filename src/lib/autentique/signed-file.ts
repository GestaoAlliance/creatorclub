import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { CONTRACT_BUCKET, checkContractPdf, contractFilePath } from "@/lib/contracts/attachment";
import { enqueueJob } from "@/lib/jobs/queue";
import { getAutentiqueDocument, type Fetcher } from "./client";
import { loadAutentique } from "./credentials";

/**
 * D-AUTOCONTRACTFILE (pedido da Fátima, 2026-11-06): assinado o contrato no Autentique, o sistema baixa o PDF assinado
 * e guarda no bucket `contratos`. Se a ficha ainda não tem contrato anexado, ele passa a ser o contrato da ficha (a
 * creator vê em "Meu contrato"); se a equipe já anexou um, o dela continua valendo. Vale para as três marcas e para quem
 * já tinha assinado antes. Cada contrato tenta no máximo 5 vezes; o erro fica gravado.
 */

export const SIGNED_FILE_JOB = "autentique.signed_file";
export const SIGNED_FILE_MAX_ATTEMPTS = 5;
const SYSTEM = "system:autentique";

export type SignedFileDeps = {
  fetcher?: Fetcher;
  encKey?: Buffer;
  /** Baixa o PDF assinado (o link vem do Autentique). */
  download?: (url: string, token: string) => Promise<Uint8Array>;
  /** Grava no Storage (bucket privado). */
  upload?: (bucket: string, path: string, pdf: Uint8Array) => Promise<void>;
};

const defaultDownload = async (url: string, token: string) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download do PDF assinado respondeu ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
};

const defaultUpload = async (bucket: string, path: string, pdf: Uint8Array) => {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { error } = await supabaseAdmin().storage.from(bucket).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(`Storage: ${error.message}`);
};

const pendingWhere = { provider: "AUTENTIQUE", status: "SIGNED" as const, creatorId: { not: null }, signedFileId: null, signedFileAttempts: { lt: SIGNED_FILE_MAX_ATTEMPTS } };

/** Agenda (de hora em hora) as marcas com contrato assinado ainda sem o PDF guardado. */
export async function enqueueDueSignedFiles(prisma: PrismaClient, now = new Date()): Promise<number> {
  const hour = Math.floor(now.getTime() / 3_600_000);
  const brands = await prisma.contractRequest.findMany({ where: pendingWhere, distinct: ["brandId"], select: { brandId: true } });
  let n = 0;
  for (const { brandId } of brands) {
    if (await enqueueJob(prisma, { type: SIGNED_FILE_JOB, brandId, dedupeKey: `signed-file:${brandId}:${hour}`, runAt: now, maxAttempts: 1 })) n++;
  }
  return n;
}

/** Baixa e guarda os PDFs assinados da marca (até 20 por rodada). */
export async function fetchSignedFiles(prisma: PrismaClient, brandId: string, deps: SignedFileDeps = {}) {
  const out = { saved: 0, attached: 0, errors: 0 };
  const reqs = await prisma.contractRequest.findMany({ where: { ...pendingWhere, brandId }, orderBy: { signedAt: "asc" }, take: 20, select: { id: true, externalId: true, creatorId: true } });
  if (!reqs.length) return out;
  const conn = await loadAutentique(prisma, brandId, deps.encKey);
  if (!conn) return out;
  for (const req of reqs) {
    try {
      const doc = await getAutentiqueDocument(conn.token, req.externalId, deps.fetcher);
      if (!doc.signedFileUrl) throw new Error("O Autentique ainda não tem o PDF assinado.");
      const pdf = await (deps.download ?? defaultDownload)(doc.signedFileUrl, conn.token);
      checkContractPdf(pdf);
      const path = contractFilePath(brandId, req.creatorId!, randomUUID());
      await (deps.upload ?? defaultUpload)(CONTRACT_BUCKET, path, pdf);
      const attached = await prisma.$transaction(async (tx) => {
        const file = await tx.file.create({
          data: { brandId, bucket: CONTRACT_BUCKET, path, mime: "application/pdf", sizeBytes: pdf.byteLength, sha256: createHash("sha256").update(pdf).digest("hex"), uploadedById: null },
        });
        await tx.contractRequest.update({ where: { id: req.id }, data: { signedFileId: file.id, signedFileError: null, signedFileAttempts: { increment: 1 } } });
        // A equipe já anexou um contrato: o dela continua valendo.
        const { count } = await tx.creator.updateMany({ where: { id: req.creatorId!, contractFileId: null }, data: { contractFileId: file.id } });
        await tx.auditLog.create({
          data: { brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "contract.signed_file", entity: "Creator", entityId: req.creatorId!, after: { contractRequestId: req.id, fileId: file.id, sizeBytes: pdf.byteLength, attached: count > 0 } },
        });
        return count > 0;
      });
      out.saved++;
      if (attached) out.attached++;
    } catch (error) {
      out.errors++;
      const msg = String(error instanceof Error ? error.message : error).slice(0, 300);
      await prisma.contractRequest.update({ where: { id: req.id }, data: { signedFileError: msg, signedFileAttempts: { increment: 1 } } });
    }
  }
  return out;
}
