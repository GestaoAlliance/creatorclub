import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { OLIST_API, type OlistFetcher } from "@/lib/olist/client";
import { OLIST_ORDER_JOB, olistRef, sendOlistOrder, trackOlistOrders } from "@/lib/olist/orders";
import { approveShipment } from "@/lib/shipments/kits";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Olist falso (D-REALSTORE: nunca o real): guarda os pedidos e devolve o rastreio combinado. */
function fakeOlist(opts: { duplicate?: boolean; tracking?: string; reject?: string; objectShape?: boolean; existing?: boolean } = {}) {
  const calls: { method: string; params: URLSearchParams }[] = [];
  const fetcher: OlistFetcher = async (url, init) => {
    const params = new URLSearchParams(init.body);
    const method = url.replace(`${OLIST_API}/`, "").replace(".php", "");
    calls.push({ method, params });
    const reply =
      method === "pedido.incluir"
        ? opts.reject
          ? { status: "Erro", codigo_erro: 31, registros: [{ registro: { sequencia: "1", status: "Erro", erros: [{ erro: opts.reject }] } }] }
          : opts.duplicate
            ? { status: "Erro", codigo_erro: 30, registros: [{ registro: { sequencia: "1", status: "Erro", erros: [{ erro: "Pedido com número X já existe" }] } }] }
            : opts.objectShape
              ? { status_processamento: 3, status: "OK", registros: { registro: { sequencia: "1", status: "OK", id: "789456", numero: "12345" } } }
              : { status: "OK", registros: [{ registro: { sequencia: 1, status: "OK", id: 789456, numero: 12345 } }] }
        : method === "pedidos.pesquisa"
          ? opts.existing || (opts.duplicate && calls.some((c) => c.method === "pedido.incluir"))
            ? { status: "OK", pedidos: [{ pedido: { id: 555, numero: 777 } }] }
            : { status: "Erro", codigo_erro: 20, erros: [{ erro: "A consulta não retornou registros" }] }
          : { status: "OK", pedido: { situacao: opts.tracking ? "enviado" : "aprovado", codigo_rastreamento: opts.tracking ?? "", nome_transportador: "Correios" } };
    return { ok: true, status: 200, text: async () => JSON.stringify({ retorno: reply }) };
  };
  return { fetcher, calls };
}

async function setup() {
  const s = await seedBrand(prisma);
  await prisma.brand.update({ where: { id: s.brand.id }, data: { olistNatureId: "337803880" } });
  await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { cpf: "52998224725", phone: "31991234567" } });
  const mk = (title: string, sku: string | null, costCents: number | null) => prisma.product.create({ data: { brandId: s.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title, sku, costCents } });
  const whey = await mk("Whey", "80.1.8", 4250);
  const address = { zip: "30130010", street: "Rua X", number: "10", complement: null, district: "Centro", city: "Belo Horizonte", state: "MG" };
  const ship = (status: "PREPARING" | "AWAITING_APPROVAL", productId = whey.id, title = "Whey") =>
    prisma.shipment.create({
      data: { brandId: s.brand.id, creatorId: s.creator.id, status, address, note: "Kit de boas-vindas (1 suplemento)", createdById: "x", ...(status === "PREPARING" ? { approvedAt: new Date(), approvedById: "x" } : {}), items: { create: [{ productId, title, quantity: 2 }] } },
    });
  return { ...s, whey, mk, ship };
}

describe("pedido da creator no Olist (D-OLISTORDER, banco real)", () => {
  it("cria o pedido aprovado com a natureza da marca, CPF, endereço, SKU e custo; o rastreio volta e marca como enviado", async () => {
    const s = await setup();
    const shipment = await s.ship("PREPARING");
    const o = fakeOlist();
    expect(await sendOlistOrder(prisma, shipment.id, { token: null, fetcher: o.fetcher })).toMatchObject({ ok: false, error: "skip" }); // sem token: nada
    expect(await sendOlistOrder(prisma, shipment.id, { token: "tok", fetcher: o.fetcher, now: new Date("2026-11-05T15:00:00Z") })).toEqual({ ok: true, id: "789456", numero: "12345" });
    const sent = JSON.parse(o.calls.find((c) => c.method === "pedido.incluir")!.params.get("pedido")!).pedido;
    expect(sent).toMatchObject({
      numero_pedido_ecommerce: olistRef(shipment.id), data_pedido: "05/11/2026", situacao: "aprovado", id_natureza_operacao: "337803880", frete_por_conta: "R",
      cliente: { tipo_pessoa: "F", cpf_cnpj: "52998224725", endereco: "Rua X", numero: "10", bairro: "Centro", cep: "30130010", cidade: "Belo Horizonte", uf: "MG" },
      itens: [{ item: { codigo: "80.1.8", descricao: "Whey", unidade: "UN", quantidade: "2", valor_unitario: "42.50" } }],
    });
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).toMatchObject({ olistOrderId: "789456", olistOrderNumber: "12345", olistError: null });
    // A fila repetiu: não cria outro.
    expect(await sendOlistOrder(prisma, shipment.id, { token: "tok", fetcher: o.fetcher })).toMatchObject({ ok: false, error: "skip" });

    // Sem rastreio ainda: nada muda. Com rastreio: enviado, com aviso à creator.
    expect(await trackOlistOrders(prisma, s.brand.id, { token: "tok", fetcher: fakeOlist().fetcher })).toEqual({ checked: 1, shipped: 0 });
    expect(await trackOlistOrders(prisma, s.brand.id, { token: "tok", fetcher: fakeOlist({ tracking: "AA123456789BR" }).fetcher })).toEqual({ checked: 1, shipped: 1 });
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).toMatchObject({ status: "SHIPPED", carrier: "Correios", trackingCode: "AA123456789BR" });
    expect(await prisma.notification.count({ where: { creatorId: s.creator.id, kind: "SHIPPED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: shipment.id, actorType: "SYSTEM", action: "shipment.shipped" } })).toBe(1);
  });

  it("empresa sai com CNPJ; pedido já existente é achado pelo número; falta de SKU e recusa do Olist ficam no envio", async () => {
    const s = await setup();
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { cnpj: "11222333000181" } });
    await prisma.creator.update({ where: { id: s.creator.id }, data: { receivesAsIndividual: false } });
    const a = await s.ship("PREPARING");
    const dup = fakeOlist({ duplicate: true });
    expect(await sendOlistOrder(prisma, a.id, { token: "tok", fetcher: dup.fetcher })).toEqual({ ok: true, id: "555", numero: "777" });
    expect(dup.calls.map((c) => c.method)).toEqual(["pedidos.pesquisa", "pedido.incluir", "pedidos.pesquisa"]);
    expect(JSON.parse(dup.calls[1]!.params.get("pedido")!).pedido.cliente).toMatchObject({ tipo_pessoa: "J", cpf_cnpj: "11222333000181" });
    expect(dup.calls[0]!.params.get("numeroEcommerce")).toBe(olistRef(a.id));

    // Resposta real do Olist com "registros" como objeto; e pedido que já existia não é criado de novo.
    const obj = await s.ship("PREPARING");
    expect(await sendOlistOrder(prisma, obj.id, { token: "tok", fetcher: fakeOlist({ objectShape: true }).fetcher })).toEqual({ ok: true, id: "789456", numero: "12345" });
    const again = await s.ship("PREPARING");
    const ex = fakeOlist({ existing: true });
    expect(await sendOlistOrder(prisma, again.id, { token: "tok", fetcher: ex.fetcher })).toEqual({ ok: true, id: "555", numero: "777" });
    expect(ex.calls.map((c) => c.method)).toEqual(["pedidos.pesquisa"]);

    const noSku = await s.mk("Sem SKU", null, 1000);
    const b = await s.ship("PREPARING", noSku.id, "Sem SKU");
    expect(await sendOlistOrder(prisma, b.id, { token: "tok", fetcher: fakeOlist().fetcher })).toMatchObject({ ok: false });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: b.id } })).olistError).toMatch(/sem SKU/);

    const c = await s.ship("PREPARING");
    await sendOlistOrder(prisma, c.id, { token: "tok", fetcher: fakeOlist({ reject: "O campo cliente.cep é inválido" }).fetcher });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: c.id } })).olistError).toBe("Olist recusou: O campo cliente.cep é inválido");
  });

  it("aprovar o pedido da creator agenda o pedido no Olist só na marca com Olist ligado", async () => {
    const s = await setup();
    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "Gestão", roleGrants: { create: { role: "GESTAO", brandId: s.brand.id } } } });
    const gestao = (await loadActor(prisma, gid))!;
    const before = process.env.OLIST_TOKENS;
    process.env.OLIST_TOKENS = JSON.stringify({ [s.brand.slug]: "a".repeat(40) });
    try {
      const ship = await s.ship("AWAITING_APPROVAL");
      await approveShipment(prisma, gestao, ship.id);
      expect(await prisma.job.count({ where: { type: OLIST_ORDER_JOB, dedupeKey: `olist-order:${ship.id}` } })).toBe(1);
      await prisma.brand.update({ where: { id: s.brand.id }, data: { olistNatureId: null } });
      const other = await s.ship("AWAITING_APPROVAL");
      await approveShipment(prisma, gestao, other.id);
      expect(await prisma.job.count({ where: { type: OLIST_ORDER_JOB, dedupeKey: `olist-order:${other.id}` } })).toBe(0);
    } finally {
      if (before === undefined) delete process.env.OLIST_TOKENS;
      else process.env.OLIST_TOKENS = before;
    }
  });
});
