import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { importLegacyCreators } from "@/lib/import/legacy";
import { processOrder } from "@/lib/shopify/orders";
import { shopifyOrder } from "../shopify-order-fixture";
import { testClient, letters } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const HEADER = "id,brandId,status,email,passwordHash,name,phone,couponCode,commissionRate,couponDiscountRate,approvedAt,createdAt,accountId,cpf,pixKey,shopifyDiscountId";
const line = (o: Record<string, string>) =>
  HEADER.split(",").map((h) => (o[h] ?? "").includes(",") ? `"${o[h]}"` : (o[h] ?? "")).join(",");

async function setup() {
  const legacy = `legacy-${randomUUID().slice(0, 8)}`;
  const brand = await prisma.brand.create({ data: { slug: `b-${randomUUID().slice(0, 8)}`, name: "Botanika", legacyId: legacy } });
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN" } } } });
  return { brand, legacy, admin: await loadActor(prisma, id) };
}

const rows = (legacy: string, s: string) => [
  line({ id: `c1-${s}`, brandId: legacy, status: "APPROVED", email: `ANA-${s}@Exemplo.com`, passwordHash: "x", name: "Ana Souza", phone: "11999", couponCode: `ana${s}`, commissionRate: "0.15", couponDiscountRate: "0.05", approvedAt: "2026-07-21 00:45:04.412", createdAt: "2026-07-21 00:34:04.498", cpf: "123", pixKey: "pix-ana" }),
  line({ id: `c2-${s}`, brandId: legacy, status: "APPROVED", email: `bia-${s}@import.creatorclub`, name: "Bia, a Creator", couponCode: `BIA${s}`, commissionRate: "0.2", approvedAt: "2026-07-22 10:00:00", createdAt: "2026-07-22 09:00:00" }),
  line({ id: `c3-${s}`, brandId: "outra-marca", status: "APPROVED", email: `cia-${s}@x.com`, name: "Cia", couponCode: `CIA${s}`, commissionRate: "0.15", approvedAt: "2026-07-22 10:00:00" }),
  line({ id: `c4-${s}`, brandId: legacy, status: "APPROVED", email: "", name: "Sem Email", couponCode: `SEM${s}`, commissionRate: "0.15", approvedAt: "2026-07-22 10:00:00" }),
];

describe("importação do app antigo (banco real)", () => {
  it("importa só a marca escolhida, tudo a confirmar; segunda vez não duplica nem sobrescreve e mostra diferenças", async () => {
    const { brand, legacy, admin } = await setup();
    const s = letters();
    const csv = [HEADER, ...rows(legacy, s)].join("\n");

    const first = await importLegacyCreators(prisma, admin, { brandId: brand.id, csv });
    expect(first).toMatchObject({ rowsInFile: 4, rowsForBrand: 3, created: { accounts: 2, creators: 2, coupons: 2, assignments: 2, policies: 2 } });
    expect(first.errors).toEqual([{ legacyId: `c4-${s}`, error: "linha sem id, nome ou e-mail" }]);
    expect(first.fakeEmails.map((f) => f.name)).toEqual(["Bia, a Creator"]);

    const ana = await prisma.creator.findUniqueOrThrow({
      where: { brandId_legacyId: { brandId: brand.id, legacyId: `c1-${s}` } },
      include: { account: true, commissionPolicies: true, couponAssignments: { include: { coupon: true } } },
    });
    expect(ana).toMatchObject({ status: "ACTIVE", source: "legacy_import" });
    expect(ana.account).toMatchObject({ email: `ana-${s.toLowerCase()}@exemplo.com`, phone: "11999", pixKey: "pix-ana", legacyId: `c1-${s}` });
    expect(ana.commissionPolicies).toMatchObject([{ rateBps: 1500, confirmedAt: null }]);
    expect(ana.commissionPolicies[0]!.validFrom.toISOString()).toBe("2026-07-21T00:45:04.412Z");
    expect(ana.couponAssignments).toMatchObject([{ confirmedAt: null, coupon: { code: `ANA${s}`, kind: null, discountBps: 500 } }]);

    // A Ana corrige o telefone no sistema; o app antigo continua com o antigo.
    await prisma.creatorAccount.update({ where: { id: ana.accountId }, data: { phone: "11888" } });
    const second = await importLegacyCreators(prisma, admin, { brandId: brand.id, csv });
    expect(second.created).toEqual({ accounts: 0, creators: 0, coupons: 0, assignments: 0, policies: 0 });
    expect(second.unchanged).toBe(1);
    expect(second.differences).toEqual([{ legacyId: `c1-${s}`, name: "Ana Souza", field: "telefone", file: "11999", current: "11888" }]);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: ana.accountId } })).phone).toBe("11888");
    expect(await prisma.auditLog.count({ where: { action: "import.legacy", entityId: brand.id } })).toBe(2);
  });

  it("só super admin; arquivo de outra tabela é recusado", async () => {
    const { brand, admin } = await setup();
    await expect(importLegacyCreators(prisma, null, { brandId: brand.id, csv: HEADER })).rejects.toThrow(/Sem permissão/);
    await expect(importLegacyCreators(prisma, admin, { brandId: brand.id, csv: "id,email\n1,a@b.c" })).rejects.toThrow(/não parece/);
  });

  it("código visto num pedido vira cupom da marca, sem tipo", async () => {
    const { brand } = await setup();
    await processOrder(prisma, brand.id, shopifyOrder({ discountCodes: ["promo10", "MARIA"] }));
    const coupons = await prisma.coupon.findMany({ where: { brandId: brand.id }, orderBy: { code: "asc" } });
    expect(coupons.map((c) => [c.code, c.kind])).toEqual([["MARIA", null], ["PROMO10", null]]);
    // Pedido já gravado por versão antiga (sem cupons registrados): a repetição registra.
    await prisma.coupon.deleteMany({ where: { brandId: brand.id } });
    expect((await processOrder(prisma, brand.id, shopifyOrder({ discountCodes: ["promo10", "MARIA"] }))).outcome).toBe("stale");
    expect(await prisma.coupon.count({ where: { brandId: brand.id } })).toBe(2);
  });
});
