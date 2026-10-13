import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorProfile } from "@/lib/creators/profile";
import { informedAddressFor } from "@/lib/shipments/shipments";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("endereço informado na ficha e no portal (D-ADDRINFORMED, banco real)", () => {
  it("endereço da carga numa linha aparece como a confirmar; completo aparece formatado; Pagamento não vê", async () => {
    const a = await seedBrand(prisma);
    const user = async (role: "GESTAO" | "PAGAMENTO") => {
      const id = randomUUID();
      await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId: a.brand.id } } } });
      return (await loadActor(prisma, id))!;
    };
    const gestao = await user("GESTAO");
    const pagamento = await user("PAGAMENTO");

    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { addrStreet: "Rua das Flores, 10, Centro, Belo Horizonte - MG, 30140-071" } });
    expect(await informedAddressFor(prisma, a.creator.id)).toBe("Rua das Flores, 10, Centro, Belo Horizonte - MG, 30140-071");
    expect((await creatorProfile(prisma, gestao, a.creator.id)).address).toEqual({ lines: ["Rua das Flores, 10, Centro, Belo Horizonte - MG, 30140-071"], confirmed: false });
    expect((await creatorProfile(prisma, pagamento, a.creator.id)).address).toBeNull();

    // Sem nada na conta, na inscrição, no contrato ou em envio: nenhum endereço.
    const acc = await prisma.creatorAccount.create({ data: { name: "Y", email: `${randomUUID()}@x.com` } });
    const c = await prisma.creator.create({ data: { brandId: a.brand.id, accountId: acc.id, categories: [] } });
    expect(await informedAddressFor(prisma, c.id)).toBeNull();
    expect((await creatorProfile(prisma, gestao, c.id)).address).toEqual({ lines: [], confirmed: false });

    // Endereço completo nos campos: aparece formatado e confirmado.
    await prisma.creatorAccount.update({
      where: { id: acc.id },
      data: { addrZip: "30140071", addrStreet: "Rua A", addrNumber: "10", addrDistrict: "Centro", addrCity: "Belo Horizonte", addrState: "MG" },
    });
    expect((await creatorProfile(prisma, gestao, c.id)).address).toMatchObject({ confirmed: true, lines: ["Rua A, 10", "Centro · Belo Horizonte/MG", "CEP 30140-071"] });
  });
});
