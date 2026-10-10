import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { acceptTerms, creatorTermsStatus, pendingTerms, publishTerms, termsOverview } from "@/lib/terms/terms";
import { assertCanStart } from "@/lib/withdrawals/request";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const BODY = "Texto do termo de teste, com as regras do programa, longo o bastante para publicar. ".repeat(2);
const CPF = "529.982.247-25";

async function setup() {
  const a = await seedBrand(prisma);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { withdrawalsUnlockedAt: new Date(), withdrawalsUnlockedById: "pag" } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const saId = randomUUID();
  await prisma.user.create({ data: { id: saId, email: `${saId}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
  const sa = (await loadActor(prisma, saId))!;
  return { ...a, ctx, userId, sa };
}

const input = (s: { userId: string }, termsVersionId: string, extra: object = {}) => ({
  actorUserId: s.userId,
  termsVersionId,
  fullName: "Maria da Silva",
  cpf: CPF,
  accept: true,
  ip: "200.1.2.3",
  userAgent: "teste",
  ...extra,
});

describe("termo de aceite (banco real)", () => {
  it("sem termo nada bloqueia; publicado, bloqueia até aceitar; aceite grava prova e o CPF na conta", async () => {
    const s = await setup();
    expect(await pendingTerms(prisma, s.ctx)).toBeNull();
    await expect(publishTerms(prisma, s.sa, { brandId: s.brand.id, title: "Termo", body: "curto" })).rejects.toThrow(/texto completo/);
    await publishTerms(prisma, s.sa, { brandId: s.brand.id, title: "Termo", body: BODY });
    const pending = (await pendingTerms(prisma, s.ctx))!;
    expect(pending.version).toBe(1);
    await expect(assertCanStart(prisma, s.ctx)).rejects.toThrow(/termo/);

    await expect(acceptTerms(prisma, s.ctx, input(s, pending.id, { accept: false }))).rejects.toThrow(/Marque/);
    await expect(acceptTerms(prisma, s.ctx, input(s, pending.id, { fullName: "Maria" }))).rejects.toThrow(/nome completo/);
    await expect(acceptTerms(prisma, s.ctx, input(s, pending.id, { cpf: "111.111.111-11" }))).rejects.toThrow(/CPF inválido/);
    await expect(acceptTerms(prisma, { ...s.ctx, viewAs: { userId: "sa" } }, input(s, pending.id))).rejects.toThrow(/Visualização/);

    await acceptTerms(prisma, s.ctx, input(s, pending.id));
    await acceptTerms(prisma, s.ctx, input(s, pending.id)); // repetir não duplica
    expect(await prisma.termsAcceptance.count({ where: { creatorId: s.creator.id } })).toBe(1);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: s.account.id } })).cpf).toBe("52998224725");
    expect(await pendingTerms(prisma, s.ctx)).toBeNull();
    await assertCanStart(prisma, s.ctx);
    const status = await creatorTermsStatus(prisma, s.creator.id, s.brand.id);
    expect(status).toMatchObject({ currentVersion: 1, last: { version: 1, name: "Maria da Silva", cpf: "***.982.247-**", ip: "200.1.2.3" } });
    expect(await termsOverview(prisma, s.sa, s.brand.id)).toMatchObject({ accepted: 1, creators: 1 });
  });

  it("versão nova pede novo aceite; aceite de versão velha é recusado; CPF diferente do cadastro é recusado", async () => {
    const s = await setup();
    await publishTerms(prisma, s.sa, { brandId: s.brand.id, title: "Termo", body: BODY });
    const v1 = (await pendingTerms(prisma, s.ctx))!;
    await acceptTerms(prisma, s.ctx, input(s, v1.id));
    await expect(publishTerms(prisma, s.sa, { brandId: s.brand.id, title: "Termo", body: BODY })).rejects.toThrow(/Nada mudou/);
    await publishTerms(prisma, s.sa, { brandId: s.brand.id, title: "Termo", body: `${BODY} Nova cláusula.` });
    const v2 = (await pendingTerms(prisma, s.ctx))!;
    expect(v2.version).toBe(2);
    await expect(acceptTerms(prisma, s.ctx, input(s, v1.id))).rejects.toThrow(/atualizado/);
    await expect(acceptTerms(prisma, s.ctx, input(s, v2.id, { cpf: "111.444.777-35" }))).rejects.toThrow(/diferente/);
    await acceptTerms(prisma, s.ctx, input(s, v2.id));
    expect(await pendingTerms(prisma, s.ctx)).toBeNull();
  });

  it("só super admin publica", async () => {
    const s = await setup();
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: s.brand.id } } } });
    await expect(publishTerms(prisma, await loadActor(prisma, id), { brandId: s.brand.id, title: "T", body: BODY })).rejects.toThrow(/super admin/);
  });

  it("travas do banco: CPF, nome, versão válida e só inserção", async () => {
    const s = await setup();
    await publishTerms(prisma, s.sa, { brandId: s.brand.id, title: "Termo", body: BODY });
    const v = (await pendingTerms(prisma, s.ctx))!;
    const row = { brandId: s.brand.id, creatorId: s.creator.id, termsVersionId: v.id, userId: s.userId, fullName: "Maria Silva", cpf: "52998224725" };
    await expectDbError(prisma.termsAcceptance.create({ data: { ...row, cpf: "123" } }), /TermsAcceptance_cpf/);
    await expectDbError(prisma.termsAcceptance.create({ data: { ...row, fullName: " " } }), /TermsAcceptance_name/);
    await expectDbError(prisma.termsVersion.create({ data: { brandId: s.brand.id, version: 0, title: "x", body: "y", createdById: "x" } }), /TermsVersion_valid/);
    await expectDbError(prisma.termsVersion.update({ where: { id: v.id }, data: { title: "outro" } }), /somente inserção/);
    const a = await prisma.termsAcceptance.create({ data: row });
    await expectDbError(prisma.termsAcceptance.delete({ where: { id: a.id } }), /somente inserção/);
  });
});
