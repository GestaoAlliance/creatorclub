import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addMonthsToDay, dayKey, longDate } from "@/domain";
import { loadActor } from "@/lib/auth/actor";
import { contractsOverview, creatorContractSignature, pendingContract, publishContract, signContract, signedContractText } from "@/lib/contracts/sign";
import { approveApplication, receiveApplication } from "@/lib/onboarding/applications";
import { chooseKit, myPendingKits } from "@/lib/shipments/kits";
import { informedAddress, updateMyAddress } from "@/lib/shipments/shipments";
import { portalContext } from "@/lib/portal/context";
import type { ShopifyClient } from "@/lib/shopify/client";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Shopify falsa: nunca toca a loja real (D-REALSTORE). */
const shop = async () => ({ shop: "x", graphql: async () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://x/1" }, userErrors: [] } }) }) as unknown as ShopifyClient;

const BODY = "Contrato de teste. CONTRATADA: {{CONTRATADA}}. Cupom {{CUPOM}} com {{DESCONTO}}; comissão {{COMISSAO}}; mínimo {{MINIMO}}.\nKit:\n{{KIT}}\nPrazo {{MESES}}. {{DATA}}. ".padEnd(260, "x");

async function userWith(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

async function setup() {
  const { brand } = await seedBrand(prisma);
  const sa = await userWith("SUPER_ADMIN", null);
  const template = await prisma.contractTemplate.create({
    data: { brandId: brand.id, key: `influencer-${letters(4)}`, name: "Influencer teste", releaseMinCents: 50_000, months: 6, kitTiers: [{ fromCents: 100_000, products: 1 }], welcomeProducts: 2 },
  });
  const email = `${randomUUID()}@exemplo.com`;
  const app = await receiveApplication(prisma, {
    brandSlug: brand.slug, source: "site_form", externalKey: randomUUID(), submittedAt: new Date(), consentAt: new Date(),
    answers: { "Seu nome completo:": "Maria da Silva", "EMAIL:": email, "Sou:": "Influencer", "CPF: ": "529.982.247-25", "ENDEREÇO PARA ENTREGA DOS SUPLEMENTOS (Endereço completo com: Rua/Av, bairro, número, cidade, Estado, CEP, ponto de referência)": "Rua A, 10\nCentro, São Paulo - SP" },
  });
  const code = letters(6);
  const r = await approveApplication(prisma, sa, { applicationId: app.id, couponCode: code, category: "INFLUENCER", rateBps: 1500, discountBps: 500, contractTemplateId: template.id }, shop);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: r.accountId }, data: { userId } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, brand.slug);
  return { brand, sa, template, r, code, userId, ctx };
}

const sign = (s: { userId: string }, documentId: string, extra: object = {}) => ({
  actorUserId: s.userId, documentId, fullName: "Maria da Silva", cpf: "529.982.247-25", address: "Rua A, 10, Centro, São Paulo - SP", cnpj: "", companyName: "", accept: true, ip: "200.1.2.3", userAgent: "teste", ...extra,
});

describe("contrato assinado no portal (D-SIGNCONTRACT, banco real)", () => {
  it("aprovada com versão de contrato: portal travado até assinar; assinatura guarda o texto preenchido e marca a ficha", async () => {
    const s = await setup();
    // Sem texto publicado para o tipo: não trava.
    expect(await pendingContract(prisma, s.ctx)).toBeNull();
    await expect(publishContract(prisma, await userWith("GESTAO", s.brand.id), { brandId: s.brand.id, kind: "INFLUENCER", title: "Contrato", body: BODY })).rejects.toThrow(/super admin/);
    await expect(publishContract(prisma, s.sa, { brandId: s.brand.id, kind: "INFLUENCER", title: "Contrato", body: `${BODY} {{CUPON}}` })).rejects.toThrow(/\{\{CUPON\}\}/);
    await publishContract(prisma, s.sa, { brandId: s.brand.id, kind: "INFLUENCER", title: "Contrato", body: BODY });

    const pending = (await pendingContract(prisma, s.ctx))!;
    expect(pending.prefill).toMatchObject({ fullName: "Maria da Silva", cpf: "52998224725", address: "Rua A, 10, Centro, São Paulo - SP" });
    expect(pending.fixed).toMatchObject({ coupon: s.code, discountBps: 500, rateBps: 1500, releaseMinCents: 50_000, months: 6 });
    expect((await contractsOverview(prisma, s.sa, s.brand.id)).waiting.map((w) => w.id)).toEqual([s.r.creatorId]);

    await expect(signContract(prisma, s.ctx, sign(s, pending.documentId, { cpf: "111.111.111-11" }))).rejects.toThrow(/CPF inválido/);
    await expect(signContract(prisma, s.ctx, sign(s, pending.documentId, { accept: false }))).rejects.toThrow(/concorda/);
    await expect(signContract(prisma, s.ctx, sign(s, pending.documentId, { cnpj: "11.222.333/0001-81" }))).rejects.toThrow(/razão social/);
    await expect(signContract(prisma, { ...s.ctx, viewAs: { userId: "x" } }, sign(s, pending.documentId))).rejects.toThrow(/Visualização/);

    // Texto mudou entre abrir e assinar: pede para recarregar.
    await publishContract(prisma, s.sa, { brandId: s.brand.id, kind: "INFLUENCER", title: "Contrato v2", body: `${BODY} v2` });
    await expect(signContract(prisma, s.ctx, sign(s, pending.documentId))).rejects.toThrow(/atualizado/);
    const v2 = (await pendingContract(prisma, s.ctx))!;
    const now = new Date();
    await signContract(prisma, s.ctx, sign(s, v2.documentId, { cnpj: "11.222.333/0001-81", companyName: "Maria LTDA" }), now);

    const sig = await prisma.contractSignature.findFirstOrThrow({ where: { creatorId: s.r.creatorId } });
    expect(sig.body).toContain("Maria LTDA, inscrita no CNPJ sob o nº 11.222.333/0001-81");
    expect(sig.body).toContain(`Cupom ${s.code} com 5%; comissão 15%; mínimo R$ 500,00.`);
    expect(sig.body).toContain(longDate(now));
    expect(sig.bodySha256).toBe(createHash("sha256").update(sig.body).digest("hex"));
    expect(await prisma.creator.findUniqueOrThrow({ where: { id: s.r.creatorId } })).toMatchObject({
      contractSigned: true, contractStart: new Date(`${dayKey(now)}T00:00:00Z`), contractEnd: new Date(`${addMonthsToDay(dayKey(now), 6)}T00:00:00Z`),
    });
    expect(await pendingContract(prisma, s.ctx)).toBeNull();
    await expect(signContract(prisma, s.ctx, sign(s, v2.documentId))).rejects.toThrow(/Não há contrato/);

    // D-WELCOMEKIT: assinar libera o kit de boas-vindas da versão do contrato; a escolha vira envio na fila do Envio.
    const { kits } = await myPendingKits(prisma, s.ctx);
    expect(kits).toMatchObject([{ kind: "WELCOME", products: 2, salesCents: 0 }]);
    expect(await prisma.notification.findMany({ where: { creatorId: s.r.creatorId }, select: { kind: true, title: true } })).toEqual([
      { kind: "KIT_AVAILABLE", title: "Seu kit de boas-vindas: 2 suplementos" },
    ]);
    expect(await informedAddress(prisma, s.ctx)).toBe("Rua A, 10, Centro, São Paulo - SP");
    const product = await prisma.product.create({ data: { brandId: s.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title: "Whey", active: true } });
    await updateMyAddress(prisma, s.ctx, s.userId, { zip: "01000-000", street: "Rua A", number: "10", complement: "", district: "Centro", city: "São Paulo", state: "SP" });
    const shipmentId = await chooseKit(prisma, s.ctx, s.userId, kits[0]!.id, [{ productId: product.id, quantity: 2 }]);
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } })).toMatchObject({ status: "PREPARING", note: "Kit de boas-vindas (2 suplementos)" });
    expect((await creatorContractSignature(prisma, s.r.creatorId)).signature).toMatchObject({ version: 2, kind: "INFLUENCER", cpf: "***.982.247-**" });
    await expect(signedContractText(prisma, await userWith("PAGAMENTO", s.brand.id), sig.id)).resolves.toMatchObject({ body: sig.body });
    expect(await prisma.auditLog.count({ where: { action: "contract.signed", entityId: sig.id } })).toBe(1);
  });

  it("creator sem a marca da aprovação (já ativa) não é travada; travas do banco", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "C" } });
    const acc = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id }, select: { accountId: true } });
    await prisma.creatorAccount.update({ where: { id: acc.accountId }, data: { userId } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, brand.slug);
    const sa = await userWith("SUPER_ADMIN", null);
    await publishContract(prisma, sa, { brandId: brand.id, kind: "INFLUENCER", title: "Contrato", body: BODY });
    expect(await pendingContract(prisma, ctx)).toBeNull();

    await expectDbError(prisma.contractTemplate.create({ data: { brandId: brand.id, key: "x", name: "x", months: 6, documentKind: "OUTRO" } }), /ContractTemplate_documentKind/);
    await expectDbError(prisma.contractDocument.create({ data: { brandId: brand.id, kind: "OUTRO", version: 9, title: "t", body: "b", createdById: "x" } }), /ContractDocument_valid/);
    const doc = await prisma.contractDocument.findFirstOrThrow({ where: { brandId: brand.id } });
    const t = await prisma.contractTemplate.create({ data: { brandId: brand.id, key: `k-${letters(4)}`, name: "k", months: 6 } });
    const row = { brandId: brand.id, creatorId: creator.id, contractDocumentId: doc.id, contractTemplateId: t.id, userId, fullName: "Maria", cpf: "52998224725", address: "Rua A, 1", body: "texto", bodySha256: "a".repeat(64) };
    await expectDbError(prisma.contractSignature.create({ data: { ...row, cpf: "123" } }), /ContractSignature_valid/);
    await expectDbError(prisma.contractSignature.create({ data: { ...row, bodySha256: "x" } }), /ContractSignature_valid/);
    const ok = await prisma.contractSignature.create({ data: row });
    await expectDbError(prisma.contractSignature.update({ where: { id: ok.id }, data: { body: "outro" } }), /somente inserção/);
    await expectDbError(prisma.contractDocument.delete({ where: { id: doc.id } }), /somente inserção/);
    await expectDbError(prisma.kitGrant.create({ data: { brandId: brand.id, creatorId: creator.id, kind: "OUTRO", month: "2026-10", salesCents: 0, products: 1 } }), /KitGrant_kind/);
    await expectDbError(prisma.kitGrant.create({ data: { brandId: brand.id, creatorId: creator.id, kind: "WELCOME", month: "2026-10", salesCents: 100, products: 1 } }), /KitGrant_kind/);
    await expectDbError(prisma.contractTemplate.create({ data: { brandId: brand.id, key: `w-${letters(4)}`, name: "w", months: 6, welcomeProducts: 21 } }), /ContractTemplate_welcomeProducts/);
    // Kit do mês e de boas-vindas no mesmo mês convivem.
    await prisma.kitGrant.create({ data: { brandId: brand.id, creatorId: creator.id, kind: "WELCOME", month: "2026-10", salesCents: 0, products: 1 } });
    await prisma.kitGrant.create({ data: { brandId: brand.id, creatorId: creator.id, month: "2026-10", salesCents: 100_000, products: 1 } });
  });
});
