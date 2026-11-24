import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique } from "@/lib/autentique/credentials";
import { decideLegacyContract, legacyReview, runLegacyImport } from "@/lib/autentique/legacy-import";
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

type Doc = { id: string; name: string; signers: { name: string; email: string; signed: string | null }[] };

/** Autentique falso: a conta tem os documentos dados; cada documento tem o PDF assinado. */
function fakeAutentique(docs: Doc[]) {
  const fetcher: Fetcher = async (_url, init) => {
    const reply = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) });
    const q = JSON.parse(init.body as string) as { query: string; variables: { id?: string; page?: number; limit?: number } };
    if (q.query.includes("me {")) return reply({ me: { id: "u", name: "Marca", email: "contratos@marca.com" } });
    if (q.query.includes("documents(")) {
      const page = q.variables.page ?? 1;
      const slice = page === 1 ? docs : [];
      return reply({
        documents: {
          total: docs.length,
          data: slice.map((d) => ({
            id: d.id, name: d.name, created_at: "2026-08-01 10:00:00",
            signatures: [{ public_id: "dono", name: "Marca", email: "contratos@marca.com", action: null, signed: null }, ...d.signers.map((s, i) => ({ public_id: `s${i}`, name: s.name, email: s.email, action: { name: "SIGN" }, signed: s.signed ? { created_at: s.signed } : null }))],
          })),
        },
      });
    }
    return reply({ document: { id: q.variables.id, files: { signed: `https://files.test/${q.variables.id}.pdf` }, signatures: [] } });
  };
  return fetcher;
}

const PDF = new TextEncoder().encode("%PDF-1.4 contrato");

async function setup() {
  const s = await seedBrand(prisma);
  const sa = randomUUID();
  await prisma.user.create({ data: { id: sa, email: `${sa}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
  const gestao = randomUUID();
  await prisma.user.create({ data: { id: gestao, email: `${gestao}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: s.brand.id } } } });
  const mk = async (name: string, email: string) => {
    const a = await prisma.creatorAccount.create({ data: { name, email } });
    return prisma.creator.create({ data: { brandId: s.brand.id, accountId: a.id, categories: ["INFLUENCER"] } });
  };
  return { ...s, sa: (await loadActor(prisma, sa))!, gestao: (await loadActor(prisma, gestao))!, mk };
}

describe("contratos antigos do Autentique (D-LEGACYCONTRACT, banco real)", () => {
  it("liga por e-mail ou nome, anexa o mais recente, deixa a dúvida para a Gestão e não lê de novo", async () => {
    const s = await setup();
    const u = randomUUID().slice(0, 8);
    const julia = await s.mk(`Júlia Colares ${u}`, `julia-${u}@x.com`);
    const ana = await s.mk(`Ana Souza ${u}`, `ana-${u}@x.com`);
    const ana2 = await s.mk(`Ana  souza ${u}`, `ana2-${u}@x.com`); // mesmo nome: dúvida
    const team = await s.mk(`Equipe Anexou ${u}`, `team-${u}@x.com`);
    const file = await prisma.file.create({ data: { brandId: s.brand.id, bucket: "contratos", path: `x/${u}`, mime: "application/pdf", sizeBytes: 1, sha256: "x" } });
    await prisma.creator.update({ where: { id: team.id }, data: { contractFileId: file.id } });
    const docs: Doc[] = [
      { id: `old-${u}`, name: "Contrato Julia 2026-07", signers: [{ name: "Julia", email: `JULIA-${u}@x.com`, signed: "2026-07-21 10:00:00" }] },
      { id: `new-${u}`, name: "Contrato Julia renovado", signers: [{ name: "Outro nome", email: `julia-${u}@x.com`, signed: "2026-09-01 10:00:00" }] },
      { id: `nome-${u}`, name: "Contrato por nome", signers: [{ name: `julia colares ${u}`, email: `pessoal-${u}@y.com`, signed: "2026-08-01 10:00:00" }] },
      { id: `amb-${u}`, name: "Contrato Ana", signers: [{ name: `Ana Souza ${u}`, email: `outra-${u}@y.com`, signed: "2026-08-02 10:00:00" }] },
      { id: `none-${u}`, name: "Termo qualquer", signers: [{ name: "Fulano", email: `fulano-${u}@y.com`, signed: "2026-08-03 10:00:00" }] },
      { id: `open-${u}`, name: "Ainda sem assinar", signers: [{ name: `Ana Souza ${u}`, email: `ana-${u}@x.com`, signed: null }] },
      { id: `team-${u}`, name: "Contrato equipe", signers: [{ name: "x", email: `team-${u}@x.com`, signed: "2026-08-04 10:00:00" }] },
    ];
    const uploads: string[] = [];
    const deps = { fetcher: fakeAutentique(docs), encKey, download: async () => PDF, upload: async (_b: string, p: string) => void uploads.push(p) };
    await connectAutentique(prisma, s.sa, { brandId: s.brand.id, token: "t".repeat(40), sandbox: true }, deps.fetcher, encKey);

    const r = await runLegacyImport(prisma, s.brand.id, deps);
    expect(r).toMatchObject({ created: 6, matched: 4, attached: 1 }); // "open" fica de fora (sem assinar)
    const rows = await prisma.autentiqueLegacyContract.findMany({ where: { brandId: s.brand.id } });
    const by = (id: string) => rows.find((x) => x.externalId === `${id}-${u}`)!;
    expect(by("old")).toMatchObject({ status: "MATCHED", creatorId: julia.id, matchedBy: "EMAIL", fileId: null });
    expect(by("new")).toMatchObject({ status: "MATCHED", creatorId: julia.id, matchedBy: "EMAIL" });
    expect(by("new").fileId).not.toBeNull(); // o mais recente vai para a ficha
    expect(by("nome")).toMatchObject({ status: "MATCHED", creatorId: julia.id, matchedBy: "NAME" });
    expect(by("amb")).toMatchObject({ status: "AMBIGUOUS", creatorId: null });
    expect([...by("amb").candidateIds].sort()).toEqual([ana.id, ana2.id].sort());
    expect(by("none")).toMatchObject({ status: "UNMATCHED", creatorId: null });
    expect(by("team")).toMatchObject({ status: "MATCHED", creatorId: team.id, fileId: null }); // a equipe já anexou: o dela vale
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: julia.id } })).contractFileId).toBe(by("new").fileId);
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: team.id } })).contractFileId).toBe(file.id);
    expect(uploads).toHaveLength(1);

    // De novo: nada novo, nada baixado de novo.
    expect(await runLegacyImport(prisma, s.brand.id, deps)).toMatchObject({ created: 0, attached: 0 });

    // A Gestão resolve a dúvida e o que não é de creator.
    const review = await legacyReview(prisma, s.brand.id);
    expect(review.open.map((o) => o.status).sort()).toEqual(["AMBIGUOUS", "UNMATCHED"]);
    await expect(decideLegacyContract(prisma, s.gestao, by("amb").id, julia.id === ana.id ? ana2.id : "x")).rejects.toThrow(/desta marca/);
    await decideLegacyContract(prisma, s.gestao, by("amb").id, ana2.id);
    await decideLegacyContract(prisma, s.gestao, by("none").id, null);
    await expect(decideLegacyContract(prisma, s.gestao, by("none").id, null)).rejects.toThrow(/já foi resolvido/);
    expect(await runLegacyImport(prisma, s.brand.id, deps)).toMatchObject({ attached: 1 });
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: ana2.id } })).contractFileId).not.toBeNull();
    expect((await legacyReview(prisma, s.brand.id)).open).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { brandId: s.brand.id, action: { in: ["contract.legacy_linked", "contract.legacy_ignored"] } } })).toBe(2);
  });

  it("travas do banco", async () => {
    const s = await setup();
    const base = { brandId: s.brand.id, name: "x", signedAt: new Date() };
    await expectDbError(prisma.autentiqueLegacyContract.create({ data: { ...base, externalId: randomUUID(), status: "MATCHED" } }), /AutentiqueLegacyContract_matched/);
    await expectDbError(prisma.autentiqueLegacyContract.create({ data: { ...base, externalId: randomUUID(), status: "OUTRO" } }), /AutentiqueLegacyContract_status/);
    await expectDbError(prisma.autentiqueLegacyContract.create({ data: { ...base, externalId: randomUUID(), status: "MATCHED", creatorId: s.creator.id, matchedBy: "X" } }), /AutentiqueLegacyContract_matched_by/);
  });
});
