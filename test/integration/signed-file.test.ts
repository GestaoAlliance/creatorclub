import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique } from "@/lib/autentique/credentials";
import { enqueueDueSignedFiles, fetchSignedFiles, SIGNED_FILE_JOB, SIGNED_FILE_MAX_ATTEMPTS } from "@/lib/autentique/signed-file";
import { publishContract } from "@/lib/contracts/sign";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
const encKey = randomBytes(32);
const PREV_KEY = process.env.INTEGRATION_ENC_KEY;
beforeAll(() => {
  process.env.INTEGRATION_ENC_KEY = encKey.toString("base64");
});
afterAll(async () => {
  process.env.INTEGRATION_ENC_KEY = PREV_KEY;
  await prisma.$disconnect();
});

const BODY = "Contrato de parceria entre a marca e a creator, com as regras de comissão, cupom e prazo de vigência. ".repeat(3);
const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n${text}\n%%EOF`);

/** Autentique falso (D-REALSTORE): `signedUrl` nulo simula o PDF ainda não pronto. */
function fakeAutentique() {
  const state = { signedUrl: "https://autentique.test/assinado.pdf" as string | null };
  const fetcher: Fetcher = async (_url, init) => {
    const q = JSON.parse(String(init.body)).query as string;
    const data = q.includes("me {")
      ? { me: { id: "acc", name: "Conta", email: "c@x.com" } }
      : { document: { id: "d", files: { signed: state.signedUrl }, signatures: [] } };
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
  };
  return { state, fetcher };
}

async function setup() {
  const { brand, creator } = await seedBrand(prisma);
  const saId = randomUUID();
  await prisma.user.create({ data: { id: saId, email: `${saId}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
  const sa = (await loadActor(prisma, saId))!;
  await publishContract(prisma, sa, { brandId: brand.id, kind: "INFLUENCER_PF", title: "Contrato", body: BODY });
  const doc = await prisma.contractDocument.findFirstOrThrow({ where: { brandId: brand.id } });
  const template = await prisma.contractTemplate.create({ data: { brandId: brand.id, key: `t-${randomUUID()}`, name: "T", months: 6, documentKind: "INFLUENCER" } });
  const aut = fakeAutentique();
  await connectAutentique(prisma, sa, { brandId: brand.id, token: "t".repeat(40), sandbox: true }, aut.fetcher, encKey);
  const request = (creatorId: string, status: "SIGNED" | "SENT" = "SIGNED") =>
    prisma.contractRequest.create({
      data: { brandId: brand.id, creatorId, contractDocumentId: doc.id, contractTemplateId: template.id, externalId: randomUUID(), signerName: "M", signerEmail: "m@x.com", body: "b", bodySha256: "h", createdById: "t", status, signedAt: status === "SIGNED" ? new Date() : null },
    });
  return { brand, creator, aut, request };
}

describe("PDF assinado do Autentique anexado sozinho (D-AUTOCONTRACTFILE, banco real)", () => {
  it("baixa, guarda e anexa na ficha; mantém o PDF que a equipe já anexou; não repete", async () => {
    const s = await setup();
    const signed = await s.request(s.creator.id);
    // Outra creator da marca, já com contrato anexado pela equipe.
    const account = await prisma.creatorAccount.create({ data: { name: "Outra Exemplo", email: `${randomUUID()}@x.com` } });
    const other = await prisma.creator.create({ data: { brandId: s.brand.id, accountId: account.id, categories: ["INFLUENCER"] } });
    const manual = await prisma.file.create({ data: { brandId: s.brand.id, bucket: "contratos", path: `${randomUUID()}.pdf`, mime: "application/pdf", sizeBytes: 1, sha256: "x" } });
    await prisma.creator.update({ where: { id: other.id }, data: { contractFileId: manual.id } });
    await s.request(other.id);
    // Contrato ainda não assinado fica de fora.
    const third = await prisma.creator.create({ data: { brandId: s.brand.id, accountId: (await prisma.creatorAccount.create({ data: { name: "Terceira Exemplo", email: `${randomUUID()}@x.com` } })).id, categories: ["INFLUENCER"] } });
    await s.request(third.id, "SENT");

    expect(await enqueueDueSignedFiles(prisma)).toBeGreaterThanOrEqual(1);
    expect(await prisma.job.count({ where: { type: SIGNED_FILE_JOB, brandId: s.brand.id } })).toBe(1);

    const uploads: string[] = [];
    const deps = { fetcher: s.aut.fetcher, encKey, download: async () => pdf("assinado"), upload: async (_b: string, path: string) => void uploads.push(path) };
    const r = await fetchSignedFiles(prisma, s.brand.id, deps);
    expect(r).toMatchObject({ saved: 2, attached: 1, errors: 0 });

    const req = await prisma.contractRequest.findUniqueOrThrow({ where: { id: signed.id } });
    const c = await prisma.creator.findUniqueOrThrow({ where: { id: s.creator.id } });
    expect(c.contractFileId).toBe(req.signedFileId);
    expect(uploads[0]).toContain(`${s.brand.id}/${s.creator.id}/`);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: other.id } })).contractFileId).toBe(manual.id);
    expect(await prisma.auditLog.count({ where: { action: "contract.signed_file", brandId: s.brand.id } })).toBe(2);

    // Nada mais a fazer: não baixa de novo.
    expect(await fetchSignedFiles(prisma, s.brand.id, deps)).toMatchObject({ saved: 0 });
  });

  it("PDF ainda não pronto: grava o erro e para depois de 5 tentativas", async () => {
    const s = await setup();
    const signed = await s.request(s.creator.id);
    s.aut.state.signedUrl = null;
    const deps = { fetcher: s.aut.fetcher, encKey, download: async () => pdf("x"), upload: async () => {} };
    for (let i = 0; i < SIGNED_FILE_MAX_ATTEMPTS + 1; i++) await fetchSignedFiles(prisma, s.brand.id, deps);
    expect(await prisma.contractRequest.findUniqueOrThrow({ where: { id: signed.id } })).toMatchObject({ signedFileId: null, signedFileAttempts: SIGNED_FILE_MAX_ATTEMPTS, signedFileError: "O Autentique ainda não tem o PDF assinado." });
    // Arquivo que não é PDF também vira erro.
    s.aut.state.signedUrl = "https://autentique.test/x";
    await prisma.contractRequest.update({ where: { id: signed.id }, data: { signedFileAttempts: 0 } });
    await fetchSignedFiles(prisma, s.brand.id, { ...deps, download: async () => new TextEncoder().encode("html") });
    expect((await prisma.contractRequest.findUniqueOrThrow({ where: { id: signed.id } })).signedFileError).toMatch(/não é um PDF/);
    await expectDbError(prisma.contractRequest.update({ where: { id: signed.id }, data: { signedFileAttempts: 21 } }), /ContractRequest_signed_file_attempts/);
  });
});
