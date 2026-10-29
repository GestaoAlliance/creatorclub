import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { runShippingAlerts } from "@/lib/notifications/shipping";
import { WhatsAppError, type WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { createShipment, markShipped } from "@/lib/shipments/shipments";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const AT_10H = new Date("2026-11-03T13:05:00Z"); // 10h05 em São Paulo
const AT_10H30 = new Date("2026-11-03T13:30:00Z");
const AT_11H = new Date("2026-11-03T14:01:00Z");
const AT_22H = new Date("2026-11-04T01:00:00Z"); // 22h do dia 3 em São Paulo

async function user(role: "ENVIO" | "GESTAO", brandId: string, phone: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, phone, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("avisos de envio no WhatsApp de quem é Envio (D-SHIPALERT, banco real)", () => {
  it("resumo de hora em hora dos novos em Preparando; só Envio; falha tenta de novo; lembrete dos parados há 3 dias", async () => {
    const s = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: s.brand.id }, data: { whatsappInstance: "botanika" } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { name: "Ana Exemplo" } });
    const product = await prisma.product.create({ data: { brandId: s.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title: "Colágeno" } });
    const alvaro = await user("ENVIO", s.brand.id, "5531911112222");
    await user("GESTAO", s.brand.id, "5531933334444"); // Gestão não recebe
    await user("ENVIO", s.brand.id, null); // sem telefone: fica de fora
    const address = { zip: "01310100", street: "Av. Paulista", number: "1000", complement: null, district: "Bela Vista", city: "São Paulo", state: "SP" };
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { addrZip: address.zip, addrStreet: address.street, addrNumber: address.number, addrDistrict: address.district, addrCity: address.city, addrState: address.state } });

    const mine = (sent: WhatsAppMessage[]) => sent.filter((m) => m.brand === s.brand.name);
    const sent: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void sent.push(m);

    // Envio registrado num horário do teste (o relógio real é outro).
    const ship = async (quantity: number, at: Date) => {
      const id = await createShipment(prisma, alvaro, { creatorId: s.creator.id, items: [{ productId: product.id, quantity }] });
      await prisma.shipment.update({ where: { id }, data: { createdAt: at } });
      return id;
    };
    const first = await ship(2, AT_10H);
    // Falha do n8n: nada marcado, tenta de novo no minuto seguinte.
    const failing = async () => { throw new WhatsAppError("fora"); };
    await runShippingAlerts(prisma, failing, "https://x.test", AT_10H);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: first } })).staffNotifiedAt).toBeNull();

    await runShippingAlerts(prisma, sender, "https://x.test", AT_10H);
    expect(mine(sent)).toHaveLength(1);
    expect(mine(sent)[0]).toMatchObject({ phone: "5531911112222", kind: "SHIPPING_NEW", instance: "botanika" });
    expect(mine(sent)[0]!.text).toContain("1 envio novo para preparar");
    expect(mine(sent)[0]!.text).toContain("• Ana Exemplo: 2x Colágeno");
    expect(mine(sent)[0]!.text).toContain("https://x.test/admin/envios?situacao=PREPARING");

    // Outro envio na mesma hora espera o próximo resumo.
    await ship(1, AT_10H30);
    await runShippingAlerts(prisma, sender, "https://x.test", AT_10H30);
    expect(mine(sent)).toHaveLength(1);
    await runShippingAlerts(prisma, sender, "https://x.test", AT_11H);
    expect(mine(sent)).toHaveLength(2);
    expect(mine(sent)[1]!.text).toContain("1 envio novo");
    await runShippingAlerts(prisma, sender, "https://x.test", new Date(AT_11H.getTime() + 60_000));
    expect(mine(sent)).toHaveLength(2);

    // Fora do horário, nada.
    await ship(1, AT_22H);
    await runShippingAlerts(prisma, sender, "https://x.test", AT_22H);
    expect(mine(sent)).toHaveLength(2);

    // Parado há 3 dias: lembrete uma vez por dia; enviado sai da lista.
    await prisma.shipment.update({ where: { id: first }, data: { createdAt: new Date(AT_10H.getTime() - 4 * 86_400_000) } });
    const nextDay = new Date(AT_10H.getTime() + 86_400_000);
    await runShippingAlerts(prisma, sender, "https://x.test", nextDay);
    const stuck = mine(sent).filter((m) => m.kind === "SHIPPING_STUCK");
    expect(stuck).toHaveLength(1);
    expect(stuck[0]!.text).toContain("1 envio parado");
    expect(stuck[0]!.text).toContain("(há 5 dias)");
    await runShippingAlerts(prisma, sender, "https://x.test", new Date(nextDay.getTime() + 3_600_000));
    expect(mine(sent).filter((m) => m.kind === "SHIPPING_STUCK")).toHaveLength(1);
    await markShipped(prisma, alvaro, { shipmentId: first, carrier: "Correios", trackingCode: "AB123456789BR" });
    await runShippingAlerts(prisma, sender, "https://x.test", new Date(nextDay.getTime() + 86_400_000));
    expect(mine(sent).filter((m) => m.kind === "SHIPPING_STUCK")).toHaveLength(1);
  });
});
