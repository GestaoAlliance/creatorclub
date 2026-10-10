import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { approveApplication, listApplications, receiveApplication, rejectApplication } from "@/lib/onboarding/applications";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

const answers = (email: string, extra: object = {}) => ({
  "Seu nome completo:": "Maria da Silva",
  "Sou:": "Influencer",
  "EMAIL:": email,
  "SUGESTÃO DE NOME DE CUPOM:": "maria",
  "CPF:": "529.982.247-25",
  "PIX PARA PAGAMENTO (pix da conta CNPJ)": "maria@pix.com",
  ...extra,
});

async function received(slug: string, email = `${randomUUID()}@exemplo.com`) {
  return receiveApplication(prisma, { brandSlug: slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: answers(email) });
}

describe("candidatas do formulário Hunter (banco real)", () => {
  it("recebe a resposta uma vez só; Gestão aprova: creator, cupom, dona, taxa confirmadas e saque liberado", async () => {
    const { brand } = await seedBrand(prisma);
    const key = randomUUID();
    const email = `${randomUUID()}@exemplo.com`;
    const input = { brandSlug: brand.slug, source: "hunter_form", externalKey: key, submittedAt: new Date(), answers: answers(email) };
    const first = await receiveApplication(prisma, input);
    expect(first.created).toBe(true);
    expect(await receiveApplication(prisma, input)).toEqual({ id: first.id, created: false });

    const gestao = await userWith("GESTAO", brand.id);
    const list = await listApplications(prisma, gestao);
    expect(list.rows.find((r) => r.id === first.id)).toMatchObject({ couponProposal: "MARIA", categoryProposal: "INFLUENCER", cpf: "529.982.247-25", canDecide: true });

    const code = letters(6);
    const r = await approveApplication(prisma, gestao, { applicationId: first.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 500 });
    const creator = await prisma.creator.findUniqueOrThrow({
      where: { id: r.creatorId },
      include: { account: true, couponAssignments: { include: { coupon: true } }, commissionPolicies: true },
    });
    expect(creator).toMatchObject({ status: "ACTIVE", categories: ["INFLUENCER"], source: "hunter_form", account: { email, cpf: "52998224725", pixKey: "maria@pix.com" } });
    expect(creator.withdrawalsUnlockedAt).not.toBeNull();
    expect(creator.reviewedAt).not.toBeNull();
    expect(creator.couponAssignments[0]).toMatchObject({ coupon: { code, kind: "CREATOR", discountBps: 500 } });
    expect(creator.couponAssignments[0]!.confirmedAt).not.toBeNull();
    expect(creator.commissionPolicies[0]).toMatchObject({ rateBps: 1500 });
    expect(creator.commissionPolicies[0]!.confirmedAt).not.toBeNull();
    await expect(approveApplication(prisma, gestao, { applicationId: first.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500 })).rejects.toThrow(/já foi decidida/);
    expect(await prisma.auditLog.count({ where: { action: "application.approved", entityId: first.id } })).toBe(1);
  });

  it("recusa: cupom repetido ou inválido, sem e-mail, já creator; Pagamento vê mas não decide; Envio nem vê; recusar", async () => {
    const { brand } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const a = await received(brand.slug);
    const existing = letters(6);
    await prisma.coupon.create({ data: { brandId: brand.id, code: existing, kind: "PROMO", classifiedAt: new Date(), classifiedById: "x" } });
    await expect(approveApplication(prisma, gestao, { applicationId: a.id, couponCode: existing, category: "INFLUENCER", rateBps: 1500, discountBps: 500 })).rejects.toThrow(/já existe/);
    await expect(approveApplication(prisma, gestao, { applicationId: a.id, couponCode: "AB12", category: "INFLUENCER", rateBps: 1500, discountBps: 500 })).rejects.toThrow(/só letras/);
    await expect(approveApplication(prisma, gestao, { applicationId: a.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500, email: "x" })).rejects.toThrow(/e-mail/);

    const pagamento = await userWith("PAGAMENTO", brand.id);
    const seen = (await listApplications(prisma, pagamento)).rows;
    expect(seen.find((r) => r.id === a.id)?.canDecide).toBe(false);
    await expect(approveApplication(prisma, pagamento, { applicationId: a.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500 })).rejects.toThrow(/permissão/);
    await expect(listApplications(prisma, await userWith("ENVIO", brand.id))).rejects.toThrow(/permissão/);

    await rejectApplication(prisma, gestao, a.id, "perfil fora do nicho");
    await expect(rejectApplication(prisma, gestao, a.id, "")).rejects.toThrow(/já foi decidida/);

    // Mesma pessoa (e-mail) em duas respostas: a segunda aprovação é recusada.
    const email = `${randomUUID()}@exemplo.com`;
    const b1 = await received(brand.slug, email);
    const b2 = await received(brand.slug, email);
    await approveApplication(prisma, gestao, { applicationId: b1.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500 });
    await expect(approveApplication(prisma, gestao, { applicationId: b2.id, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500 })).rejects.toThrow(/já é creator/);
  });

  it("trava do banco: decisão coerente e nome preenchido", async () => {
    const { brand } = await seedBrand(prisma);
    const a = await received(brand.slug);
    await expectDbError(prisma.creatorApplication.update({ where: { id: a.id }, data: { status: "APPROVED", decidedAt: new Date(), decidedById: "x" } }), /CreatorApplication_decided/);
    await expectDbError(prisma.creatorApplication.update({ where: { id: a.id }, data: { fullName: " " } }), /CreatorApplication_name/);
  });
});
