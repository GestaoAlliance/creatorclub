import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";

/**
 * Desligar as planilhas, marca a marca (M4.7, D-SHEETOFF): quando a equipe combina parar de usar uma planilha, o super
 * admin desliga a leitura dela; o script continua rodando, mas o sistema não aplica mais nada (responde "desligada").
 * Religar volta a ler (na Central, a primeira leitura depois disso só registra o ponto de partida de novo). Tudo na
 * auditoria.
 */

export const SHEETS = ["central", "envios", "pagamentos"] as const;
export type SheetName = (typeof SHEETS)[number];

export const SHEET_LABEL: Record<SheetName, string> = { central: "Central de creators", envios: "Envios de pedidos", pagamentos: "Pagamentos influencers" };

/** O que cada planilha faz e onde isso já está no sistema (checklist antes de desligar). */
export const SHEET_COVERAGE: Record<SheetName, { task: string; where: string }[]> = {
  central: [
    { task: "Cadastro e contato (nome, WhatsApp, e-mail, @)", where: "Creators → ficha → Cadastro" },
    { task: "Cupom, comissão e desconto", where: "Creators → ficha → Resumo" },
    { task: "Contrato (início, fim, assinatura) e checklist (cupom cadastrado, grupo, segue no Instagram, marcada)", where: "Creators → ficha → Contrato" },
    { task: "Situação (ativa, pausada, encerrada) e observações", where: "Creators → ficha (situação e linha do tempo)" },
    { task: "Novas creators", where: "Candidatas (site, formulários e Nova candidata)" },
  ],
  envios: [
    { task: "O que mandar para cada creator (kit, produtos)", where: "Envios (e kit escolhido pela creator no portal)" },
    { task: "Endereço de entrega", where: "Portal → Envios (a creator mantém) e ficha → Cadastro" },
    { task: "Enviado? e código de rastreio", where: "Envios → marcar enviado com o rastreio (a creator é avisada)" },
    { task: "Frete", where: "Envios (frete de cada envio, entra no custo do programa)" },
  ],
  pagamentos: [
    { task: "Comissão de cada creator no período", where: "Creators → ficha → Extrato e Pagamentos" },
    { task: "Pedido de pagamento, nota fiscal e Pix", where: "Pagamentos → Saques (a creator pede no portal com a NF)" },
    { task: "O que já foi pago", where: "Pagamentos → Saques (Pago) e extrato" },
  ],
};

export class SheetSwitchError extends Error {}

export async function setSheetReading(prisma: PrismaClient, actor: Actor | null, brandId: string, sheet: string, on: boolean, now = new Date()) {
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new SheetSwitchError("Só super admin.");
  if (!(SHEETS as readonly string[]).includes(sheet)) throw new SheetSwitchError("Planilha desconhecida.");
  const off = { disabledAt: now, disabledById: actor.userId };
  await prisma.$transaction([
    prisma.sheetSync.upsert({
      where: { brandId_sheet: { brandId, sheet } },
      // Religar a Central zera o ponto de partida: a próxima leitura só registra, sem aplicar por cima do sistema o que
      // mudou na planilha enquanto estava desligada. Envios guarda linha → envio (zerar duplicaria envios): fica.
      update: on ? { disabledAt: null, disabledById: null, ...(sheet === "central" ? { snapshot: Prisma.DbNull } : {}) } : off,
      create: { brandId, sheet, ...(on ? {} : off) },
    }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action: on ? "sheet.on" : "sheet.off", entity: "SheetSync", entityId: `${brandId}:${sheet}` } }),
  ]);
}

/** A leitura desta planilha está desligada? */
export async function sheetDisabled(prisma: PrismaClient, slug: string, sheet: string) {
  const s = await prisma.sheetSync.findFirst({ where: { sheet, brand: { slug } }, select: { disabledAt: true } });
  return s?.disabledAt ?? null;
}
