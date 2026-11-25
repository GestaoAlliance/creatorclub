import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import type { Fetcher } from "@/lib/autentique/client";
import { connectAutentique } from "@/lib/autentique/credentials";
import { runLegacyImport } from "@/lib/autentique/legacy-import";
import { seedBrand, testClient } from "./fixtures";

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

type Doc = { id: string; name: string; signers: { email: string; signed: boolean }[] };

/** Autentique falso com uma conta por chave: cada chave vê os seus documentos. */
function fakeAccounts(byToken: Record<string, Doc[]>) {
  const fetcher: Fetcher = async (_url, init) => {
    const reply = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) });
    const token = init.headers.Authorization!.replace("Bearer ", "");
    const q = JSON.parse(init.body as string) as { query: string; variables: { id?: string; page?: number } };
    if (q.query.includes("me {")) return reply({ me: { id: token, name: "Conta", email: `${token.slice(0, 4)}@x.com` } });
    if (q.query.includes("documents(")) {
      const docs = (q.variables.page ?? 1) === 1 ? (byToken[token] ?? []) : [];
      return reply({ documents: { total: docs.length, data: docs.map((d) => ({ id: d.id, name: d.name, signatures: d.signers.map((s, i) => ({ public_id: `s${i}`, name: "", email: s.email, action: { name: "SIGN" }, signed: s.signed ? { created_at: "2026-07-28 10:00:00" } : null })) })) } });
    }
    if (q.query.includes("folders(")) return reply({ folders: { data: [] } });
    return reply({ document: { id: q.variables.id, files: { signed: `https://files.test/${token.slice(0, 4)}/${q.variables.id}.pdf` }, signatures: [] } });
  };
  return fetcher;
}

describe("contratos antigos em conta de outra marca (D-LEGACYCROSS, banco real)", () => {
  it("contrato BT da Botanika na conta da VermeFree vai para a ficha da Botanika, baixado pela chave da VermeFree", async () => {
    const u = randomUUID().slice(0, 8);
    const bk = (await seedBrand(prisma)).brand;
    const vf = (await seedBrand(prisma)).brand;
    await prisma.brand.update({ where: { id: bk.id }, data: { storeUrl: `https://bk${u}.com.br` } });
    await prisma.brand.update({ where: { id: vf.id }, data: { storeUrl: `https://vf${u}.com.br` } });
    const sa = randomUUID();
    await prisma.user.create({ data: { id: sa, email: `${sa}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
    const actor = (await loadActor(prisma, sa))!;
    const acc = await prisma.creatorAccount.create({ data: { name: `Grace ${u}`, email: `grace-${u}@gmail.com` } });
    const grBk = await prisma.creator.create({ data: { brandId: bk.id, accountId: acc.id, categories: ["PRESCRITOR"] } });
    const grVf = await prisma.creator.create({ data: { brandId: vf.id, accountId: acc.id, categories: ["PRESCRITOR"] } });
    const tBk = `bk${u}`.padEnd(40, "k");
    const tVf = `vf${u}`.padEnd(40, "v");
    const bt: Doc = { id: `bt-${u}`, name: "Contrato Prescritor BT", signers: [{ email: `grace-${u}@gmail.com`, signed: true }, { email: `financeiro@bk${u}.com.br`, signed: true }, { email: "contador@gmail.com", signed: false }] };
    const neutral: Doc = { id: `ugc-${u}`, name: "Contrato UGC - Grace.docx", signers: [{ email: `grace-${u}@gmail.com`, signed: true }] };
    const fetcher = fakeAccounts({ [tBk]: [], [tVf]: [bt, neutral] });
    await connectAutentique(prisma, actor, { brandId: bk.id, token: tBk, sandbox: true }, fetcher, encKey);
    await connectAutentique(prisma, actor, { brandId: vf.id, token: tVf, sandbox: true }, fetcher, encKey);
    const downloads: string[] = [];
    const deps = { fetcher, encKey, download: async (url: string) => (downloads.push(url), new TextEncoder().encode("%PDF-1.4")), upload: async () => {} };

    // As outras marcas do banco de teste não têm Autentique: cada busca lê a própria conta e a da outra.
    const rb = await runLegacyImport(prisma, bk.id, deps);
    expect(rb).toMatchObject({ created: 1, matched: 1, attached: 1 }); // só o BT; o neutro da conta da VermeFree não é da Botanika
    const row = await prisma.autentiqueLegacyContract.findUniqueOrThrow({ where: { brandId_externalId: { brandId: bk.id, externalId: bt.id } } });
    expect(row).toMatchObject({ creatorId: grBk.id, sourceBrandId: vf.id });
    expect(downloads).toEqual([`https://files.test/vf${u.slice(0, 2)}/${bt.id}.pdf`]); // baixado com a chave da VermeFree
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: grBk.id } })).contractFileId).toBe(row.fileId);

    const rv = await runLegacyImport(prisma, vf.id, deps);
    expect(rv).toMatchObject({ created: 1, matched: 1 }); // só o neutro: o BT é da Botanika (assinado pelo domínio dela)
    expect((await prisma.autentiqueLegacyContract.findUniqueOrThrow({ where: { brandId_externalId: { brandId: vf.id, externalId: neutral.id } } })).creatorId).toBe(grVf.id);
  });
});
