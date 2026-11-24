import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { CONTRACT_BUCKET, checkContractPdf, contractFilePath } from "@/lib/contracts/attachment";
import { enqueueJob } from "@/lib/jobs/queue";
import { autentiqueQuery, getAutentiqueDocument, type Fetcher } from "./client";
import { loadAutentique } from "./credentials";

/**
 * D-LEGACYCONTRACT (Guilherme e Vanessa, 2026-11-24; respostas do responsável): os contratos que a equipe mandou à mão
 * pelo Autentique antes do Creator Club ficam lá, fora da ficha. Uma vez por dia (e pelo botão em Ações), o sistema lê a
 * conta de cada marca (as 3), pula o que ele mesmo enviou e o que já leu, e liga cada documento assinado por todos à
 * creator da marca: pelo e-mail de quem assinou; senão, pelo nome completo (sem acento nem maiúsculas). Uma creator só:
 * ligado; mais de uma: dúvida; nenhuma: sem creator (as duas a Gestão resolve em Ações). Depois anexa na ficha o PDF do
 * contrato ligado mais recente, se ela ainda não tem contrato anexado (o que a equipe anexou continua valendo).
 */

export class LegacyContractError extends Error {}

export const LEGACY_SCAN_JOB = "autentique.legacy_scan";
const SYSTEM = "system:autentique";
const PAGE = 60;
const MAX_PAGES = 100;
const MAX_ATTEMPTS = 5;

type Deps = {
  fetcher?: Fetcher;
  encKey?: Buffer;
  download?: (url: string, token: string) => Promise<Uint8Array>;
  upload?: (bucket: string, path: string, pdf: Uint8Array) => Promise<void>;
};

const LIST = `query documents($limit: Int!, $page: Int!) {
  documents(limit: $limit, page: $page) { total data { id name created_at signatures { public_id name email action { name } signed { created_at } } } }
}`;

type RawDoc = { id: string; name: string | null; created_at: string | null; signatures: { name: string | null; email: string | null; action: { name: string } | null; signed: { created_at: string } | null }[] | null };

/** Sem acento, minúsculas, espaços simples: "Júlia  Colares" = "julia colares". */
export function foldName(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Jeitos de escrever o nome da marca no nome do documento ("Revita Derma", "revitaderma", "revita-derma"). */
function brandKeys(b: { name: string; slug: string }): string[] {
  const n = foldName(b.name);
  return [...new Set([n, n.replace(/\s+/g, ""), foldName(b.slug.replace(/-/g, " ")), b.slug.replace(/-/g, "")])].filter((k) => k.length >= 4);
}

/**
 * D-LEGACYCONTRACT (filtro de marca, 2026-11-24): a conta do Autentique da Botanika também guarda contratos da VermeFree.
 * Documento cujo nome cita outra marca (e não a própria) não é desta marca: fica de fora.
 */
export function otherBrandDocument(docName: string, own: { name: string; slug: string }, others: { name: string; slug: string }[]): boolean {
  const n = foldName(docName);
  const compact = n.replace(/[^a-z0-9]/g, "");
  const has = (k: string) => n.includes(k) || compact.includes(k.replace(/[^a-z0-9]/g, ""));
  if (brandKeys(own).some(has)) return false;
  return others.some((o) => brandKeys(o).some(has));
}

/** Data do Autentique ("2026-09-22 15:04:00", horário de Brasília) ou ISO. */
export function autentiqueDate(s: string): Date {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(" ", "T") : `${s.replace(" ", "T")}-03:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new LegacyContractError(`Data do Autentique inválida: ${s}`);
  return d;
}

type Signer = { name: string; email: string };
type Person = { id: string; email: string; name: string };

/** Quem é a creator do documento: por e-mail; senão, pelo nome. */
export function matchSigners(signers: Signer[], people: Person[]): { status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED"; creatorId: string | null; matchedBy: "EMAIL" | "NAME" | null; candidates: string[] } {
  const emails = new Set(signers.map((s) => s.email.trim().toLowerCase()).filter(Boolean));
  const byEmail = [...new Set(people.filter((p) => emails.has(p.email.trim().toLowerCase())).map((p) => p.id))];
  const pick = (ids: string[], by: "EMAIL" | "NAME") =>
    ids.length === 1 ? { status: "MATCHED" as const, creatorId: ids[0]!, matchedBy: by, candidates: ids } : { status: "AMBIGUOUS" as const, creatorId: null, matchedBy: null, candidates: ids };
  if (byEmail.length) return pick(byEmail, "EMAIL");
  const names = new Set(signers.map((s) => foldName(s.name)).filter((n) => n.includes(" ")));
  const byName = [...new Set(people.filter((p) => names.has(foldName(p.name))).map((p) => p.id))];
  if (byName.length) return pick(byName, "NAME");
  return { status: "UNMATCHED", creatorId: null, matchedBy: null, candidates: [] };
}

/** Lê a conta do Autentique da marca e grava os documentos assinados que ainda não conhece. */
export async function scanLegacyContracts(prisma: PrismaClient, brandId: string, deps: Deps = {}) {
  const out = { read: 0, created: 0, matched: 0, otherBrand: 0 };
  const conn = await loadAutentique(prisma, brandId, deps.encKey);
  if (!conn) return out;
  const [brands, requests, terminations, known, creators] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.contractRequest.findMany({ select: { externalId: true } }),
    prisma.creatorTermination.findMany({ where: { externalId: { not: null } }, select: { externalId: true } }),
    prisma.autentiqueLegacyContract.findMany({ select: { externalId: true } }),
    prisma.creator.findMany({ where: { brandId }, select: { id: true, account: { select: { email: true, name: true } } } }),
  ]);
  const skip = new Set([...requests.map((r) => r.externalId), ...terminations.map((t) => t.externalId!), ...known.map((k) => k.externalId)]);
  const people = creators.map((c) => ({ id: c.id, email: c.account.email, name: c.account.name }));
  const own = brands.find((b) => b.id === brandId)!;
  const others = brands.filter((b) => b.id !== brandId);
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await autentiqueQuery<{ documents: { total: number; data: RawDoc[] } }>(conn.token, LIST, { limit: PAGE, page }, deps.fetcher);
    const docs = data.documents?.data ?? [];
    if (docs.length === 0) break;
    for (const d of docs) {
      out.read++;
      if (skip.has(d.id)) continue;
      if (otherBrandDocument(d.name ?? "", own, others)) {
        out.otherBrand++;
        continue;
      } // contrato de outra marca na mesma conta
      const signers = (d.signatures ?? []).filter((s) => s.action !== null);
      // Só o que todos já assinaram.
      if (signers.length === 0 || signers.some((s) => !s.signed?.created_at)) continue;
      const signedAt = new Date(Math.max(...signers.map((s) => autentiqueDate(s.signed!.created_at).getTime())));
      const list = signers.map((s) => ({ name: (s.name ?? "").trim(), email: (s.email ?? "").trim().toLowerCase() }));
      const m = matchSigners(list, people);
      const { count } = await prisma.autentiqueLegacyContract.createMany({
        data: [{
          brandId, externalId: d.id, name: (d.name ?? "(sem nome)").slice(0, 300), signerNames: list.map((s) => s.name).filter(Boolean), signerEmails: list.map((s) => s.email).filter(Boolean),
          signedAt, status: m.status, creatorId: m.creatorId, matchedBy: m.matchedBy, candidateIds: m.candidates,
        }],
        skipDuplicates: true,
      });
      skip.add(d.id);
      out.created += count;
      if (count && m.status === "MATCHED") out.matched++;
    }
    if (docs.length < PAGE) break;
  }
  if (out.created) {
    await prisma.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "contract.legacy_scan", entity: "Brand", entityId: brandId, after: out } });
  }
  return out;
}

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

/** Anexa na ficha (sem contrato anexado) o PDF do contrato ligado mais recente de cada creator. Até 20 por rodada. */
export async function attachLegacyContracts(prisma: PrismaClient, brandId: string, deps: Deps = {}) {
  const out = { attached: 0, errors: 0 };
  const rows = await prisma.autentiqueLegacyContract.findMany({
    where: { brandId, status: "MATCHED", creator: { contractFileId: null } },
    orderBy: { signedAt: "desc" },
    select: { id: true, externalId: true, creatorId: true, fileId: true, fileAttempts: true },
  });
  // O mais recente de cada creator (os outros ficam guardados na lista).
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.creatorId!)) latest.set(r.creatorId!, r);
  const todo = [...latest.values()].filter((r) => !r.fileId && r.fileAttempts < MAX_ATTEMPTS).slice(0, 20);
  if (!todo.length) return out;
  const conn = await loadAutentique(prisma, brandId, deps.encKey);
  if (!conn) return out;
  for (const r of todo) {
    try {
      const doc = await getAutentiqueDocument(conn.token, r.externalId, deps.fetcher);
      if (!doc.signedFileUrl) throw new Error("O Autentique ainda não tem o PDF assinado.");
      const pdf = await (deps.download ?? defaultDownload)(doc.signedFileUrl, conn.token);
      checkContractPdf(pdf);
      const path = contractFilePath(brandId, r.creatorId!, randomUUID());
      await (deps.upload ?? defaultUpload)(CONTRACT_BUCKET, path, pdf);
      const attached = await prisma.$transaction(async (tx) => {
        const file = await tx.file.create({
          data: { brandId, bucket: CONTRACT_BUCKET, path, mime: "application/pdf", sizeBytes: pdf.byteLength, sha256: createHash("sha256").update(pdf).digest("hex"), uploadedById: null },
        });
        await tx.autentiqueLegacyContract.update({ where: { id: r.id }, data: { fileId: file.id, fileError: null, fileAttempts: { increment: 1 } } });
        const { count } = await tx.creator.updateMany({ where: { id: r.creatorId!, contractFileId: null }, data: { contractFileId: file.id } });
        await tx.auditLog.create({
          data: { brandId, actorType: "SYSTEM", actorId: SYSTEM, action: "contract.legacy_file", entity: "Creator", entityId: r.creatorId!, after: { legacyId: r.id, externalId: r.externalId, fileId: file.id, attached: count > 0 } },
        });
        return count > 0;
      });
      if (attached) out.attached++;
    } catch (error) {
      out.errors++;
      await prisma.autentiqueLegacyContract.update({ where: { id: r.id }, data: { fileError: String(error instanceof Error ? error.message : error).slice(0, 300), fileAttempts: { increment: 1 } } });
    }
  }
  return out;
}

/** Busca e anexa (a tarefa da fila e o botão). */
export async function runLegacyImport(prisma: PrismaClient, brandId: string, deps: Deps = {}) {
  const scan = await scanLegacyContracts(prisma, brandId, deps);
  const files = await attachLegacyContracts(prisma, brandId, deps);
  return { ...scan, ...files };
}

/** Uma vez por dia, por marca. */
export async function enqueueDueLegacyScans(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.brand.findMany({ where: { archivedAt: null }, select: { id: true } });
  let n = 0;
  for (const b of brands) if (await enqueueJob(prisma, { type: LEGACY_SCAN_JOB, brandId: b.id, dedupeKey: `legacy-scan:${b.id}:${dayKey(now)}`, runAt: now, maxAttempts: 2 })) n++;
  return n;
}

/** Botão "Buscar agora" em Ações (Gestão da marca). */
export async function requestLegacyScan(prisma: PrismaClient, actor: Actor | null, brandId: string, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new LegacyContractError("Sem permissão.");
  await enqueueJob(prisma, { type: LEGACY_SCAN_JOB, brandId, dedupeKey: `legacy-scan:${brandId}:manual:${Math.floor(now.getTime() / 600_000)}`, runAt: now, maxAttempts: 2 });
}

/** A Gestão liga o documento a uma creator da marca (ou diz que não é de creator). */
export async function decideLegacyContract(prisma: PrismaClient, actor: Actor | null, legacyId: string, creatorId: string | null, now = new Date()) {
  const row = await prisma.autentiqueLegacyContract.findUnique({ where: { id: legacyId }, select: { id: true, brandId: true, status: true } });
  if (!row) throw new LegacyContractError("Contrato não encontrado.");
  if (!actor || !can(actor.grants, "creators.edit", row.brandId)) throw new LegacyContractError("Sem permissão.");
  if (row.status !== "AMBIGUOUS" && row.status !== "UNMATCHED") throw new LegacyContractError("Este contrato já foi resolvido. Atualize a página.");
  if (creatorId) {
    const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true } });
    if (!c || c.brandId !== row.brandId) throw new LegacyContractError("Escolha uma creator desta marca.");
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.autentiqueLegacyContract.updateMany({
      where: { id: legacyId, status: { in: ["AMBIGUOUS", "UNMATCHED"] } },
      data: creatorId ? { status: "MATCHED", creatorId, matchedBy: "TEAM", decidedById: actor.userId, decidedAt: now } : { status: "IGNORED", decidedById: actor.userId, decidedAt: now },
    });
    if (count === 0) throw new LegacyContractError("Este contrato já foi resolvido. Atualize a página.");
    await tx.auditLog.create({
      data: { brandId: row.brandId, actorType: "USER", actorId: actor.userId, action: creatorId ? "contract.legacy_linked" : "contract.legacy_ignored", entity: "AutentiqueLegacyContract", entityId: legacyId, after: { creatorId } },
    });
    if (creatorId) await enqueueJob(tx, { type: LEGACY_SCAN_JOB, brandId: row.brandId, dedupeKey: `legacy-scan:${row.brandId}:link:${legacyId}`, runAt: now, maxAttempts: 2 });
  });
}

/** Para Ações: o que a Gestão precisa resolver e o resumo do que já foi anexado. */
export async function legacyReview(prisma: PrismaClient, brandId: string) {
  const [open, attached, matched] = await Promise.all([
    prisma.autentiqueLegacyContract.findMany({
      where: { brandId, status: { in: ["AMBIGUOUS", "UNMATCHED"] } },
      orderBy: { signedAt: "desc" },
      take: 100,
      select: { id: true, name: true, signerNames: true, signerEmails: true, signedAt: true, status: true, candidateIds: true },
    }),
    prisma.autentiqueLegacyContract.count({ where: { brandId, status: "MATCHED", fileId: { not: null } } }),
    prisma.autentiqueLegacyContract.count({ where: { brandId, status: "MATCHED" } }),
  ]);
  const creators = open.length
    ? await prisma.creator.findMany({ where: { brandId, archivedAt: null }, orderBy: { account: { name: "asc" } }, select: { id: true, account: { select: { name: true } } } })
    : [];
  const names = new Map(creators.map((c) => [c.id, c.account.name]));
  return {
    open: open.map((o) => ({ ...o, candidates: o.candidateIds.map((id) => ({ id, name: names.get(id) ?? "(arquivada)" })) })),
    creators: creators.map((c) => ({ id: c.id, name: c.account.name })),
    attached,
    matched,
  };
}

export function legacyHandlers(prisma: PrismaClient) {
  return {
    [LEGACY_SCAN_JOB]: async (job: { brandId: string | null }) => {
      if (job.brandId) await runLegacyImport(prisma, job.brandId);
    },
  };
}
