import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorProfile, listCreators, updateProfile } from "@/lib/creators/profile";
import { staffShipments } from "@/lib/shipments/shipments";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("perfil opcional na ficha (M4.3, D-PROFILEFIELDS, banco real)", () => {
  it("Gestão salva e apaga; Pagamento não edita; cidade/UF e nichos na lista; alergias em Envios; trava do banco", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    await expect(updateProfile(prisma, await userWith("PAGAMENTO", brand.id), creator.id, { niches: ["Fitness"] })).rejects.toThrow(/permissão/);
    await expect(updateProfile(prisma, gestao, creator.id, { mediaKitUrl: "javascript:x" })).rejects.toThrow(/https/);

    await updateProfile(prisma, gestao, creator.id, { professionalId: "CRN 123", niches: ["Nutrição", "Fitness"], youtube: "@canal", kwai: "", allergies: "lactose", mediaKitUrl: "canva.com/kit" });
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { addrCity: "Belo Horizonte", addrState: "MG" } });
    const p = await creatorProfile(prisma, gestao, creator.id);
    expect(p.profile).toEqual({ professionalId: "CRN 123", niches: ["Fitness", "Nutrição"], youtube: "canal", kwai: null, allergies: "lactose", mediaKitUrl: "https://canva.com/kit" });
    expect(p.place).toBe("Belo Horizonte/MG");
    expect((await listCreators(prisma, gestao, brand.id)).find((c) => c.id === creator.id)).toMatchObject({ city: "Belo Horizonte", state: "MG", niches: ["Fitness", "Nutrição"] });
    expect(await prisma.auditLog.count({ where: { entityId: account.id, action: "creator.profile" } })).toBe(1);

    await prisma.shipment.create({ data: { brandId: brand.id, creatorId: creator.id, address: {}, createdById: "x" } });
    const ships = await staffShipments(prisma, await userWith("SUPER_ADMIN", null));
    expect(ships.find((s) => s.creator.id === creator.id)?.creator.account.allergies).toBe("lactose");

    await updateProfile(prisma, gestao, creator.id, {});
    expect((await creatorProfile(prisma, gestao, creator.id)).profile).toEqual({ professionalId: null, niches: [], youtube: null, kwai: null, allergies: null, mediaKitUrl: null });
    await expectDbError(prisma.creatorAccount.update({ where: { id: account.id }, data: { mediaKitUrl: "http://x.com" } }), /CreatorAccount_profile/);
  });
});
