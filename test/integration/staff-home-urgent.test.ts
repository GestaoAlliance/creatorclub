import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { dayKey } from "@/domain";
import { staffHome } from "@/lib/staff/home";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function user(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("Precisa de você: o que já passou do prazo (D-NEEDSAREA, banco real)", () => {
  it("conta candidatas há mais de 3 dias e marca a janela de saque fechando", async () => {
    const { brand } = await seedBrand(prisma);
    const app = (createdAt: Date) =>
      prisma.creatorApplication.create({ data: { brandId: brand.id, source: "hunter_form", externalKey: randomUUID(), submittedAt: createdAt, createdAt, fullName: "X", raw: {} } });
    await app(new Date(Date.now() - 5 * 86_400_000));
    await app(new Date());
    const gestao = await user("GESTAO", brand.id);
    expect((await staffHome(prisma, gestao)).creators).toMatchObject({ applications: 2, applicationsOld: 1 });

    // Janela de pedidos termina hoje (dia de São Paulo) e há saque esperando: urgente.
    const day = Number(dayKey(new Date()).slice(8, 10));
    await prisma.brand.update({ where: { id: brand.id }, data: { withdrawalWindowStartDay: 1, withdrawalWindowEndDay: Math.max(day, 1), withdrawalPayByDay: Math.min(day + 10, 28) } });
    const pag = await user("PAGAMENTO", brand.id);
    expect((await staffHome(prisma, pag)).withdrawals).toMatchObject({ toApprove: 0, approveClosing: false });
  });
});
