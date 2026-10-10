import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { checkNf, checkWithdrawalRequest, dayKey, parseNfseText, receiptText, type WithdrawalError } from "@/domain";
import { creatorBalance, releasedThroughFor } from "@/lib/commission/release";
import type { PortalContext } from "@/lib/portal/context";
import { isValidCpf, pendingTerms } from "@/lib/terms/terms";
import { pdfText } from "./nf";

/**
 * Pedido de saque pela creator (E7.7, D-WDRULES). A nota fiscal (PDF até 10 MB) sobe direto do navegador para o
 * bucket privado `nf` por um link assinado; aqui o servidor confere o arquivo e grava o pedido. Tudo numa transação
 * que trava a creator (`FOR UPDATE`), recalcula o saldo e aplica as regras: liberada (D-WDLOCK), janela, mínimo,
 * valor igual ao total disponível (D-CONTRACT), um pedido em aberto (índice `Withdrawal_one_open_per_creator`). O mesmo `requestId` nunca cria dois pedidos.
 * O valor só sai do saldo quando o Pagamento marcar como pago (E8); até lá fica "em saque" (reservado).
 * D-NFCHECK: a nota é lida e conferida (tomadora, valor, emissor, código 17.06, chave nunca usada); diferença bloqueia
 * com o motivo; nota que o sistema não consegue ler entra marcada para o Pagamento conferir.
 */

export class WithdrawalRequestError extends Error {}

export const NF_BUCKET = "nf";
export const MAX_NF_BYTES = 10 * 1024 * 1024;

const RULE_TEXT: Record<WithdrawalError, string> = {
  FORA_DA_JANELA: "Os pedidos de saque abrem só na janela do mês.",
  VALOR_INVALIDO: "Informe um valor válido.",
  ABAIXO_DO_MINIMO: "O valor está abaixo do mínimo por pedido.",
  SALDO_INSUFICIENTE: "Seu saldo disponível mudou. Recarregue a página e confira o valor.",
  VALOR_PARCIAL: "Seu saldo disponível mudou. Recarregue a página e confira o valor.",
  SAQUE_EM_ABERTO: "Você já tem um pedido de saque em análise.",
};

const NF_USED = "Esta nota fiscal já foi usada em outro pedido de saque. Emita uma nota nova.";

export function nfPath(brandId: string, creatorId: string, requestId: string): string {
  return `${brandId}/${creatorId}/${requestId}.pdf`;
}

export function assertRequestId(requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new WithdrawalRequestError("Pedido inválido. Recarregue a página.");
}

/** PDF de verdade: começa com "%PDF-" e cabe no limite. */
export function checkPdf(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new WithdrawalRequestError("Envie a nota fiscal em PDF.");
  if (bytes.byteLength > MAX_NF_BYTES) throw new WithdrawalRequestError("A nota fiscal passa de 10 MB.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new WithdrawalRequestError("O arquivo não é um PDF.");
}

/** Regras que não dependem do valor: visualização da equipe, saque liberado e termo aceito (D-TERMS). */
export async function assertCanStart(prisma: PrismaClient, ctx: PortalContext) {
  if (ctx.viewAs) throw new WithdrawalRequestError("Visualização da equipe: nada é pedido em nome da creator.");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { withdrawalsUnlockedAt: true } });
  if (!creator.withdrawalsUnlockedAt) throw new WithdrawalRequestError("Seu saldo está em conferência; o saque ainda não foi liberado.");
  if (await pendingTerms(prisma, ctx)) throw new WithdrawalRequestError("Aceite o termo do Creator Club antes de pedir saque.");
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type LockedCreator = {
  id: string;
  brandId: string;
  receivesAsIndividual: boolean;
  account: { id: string; pixKey: string | null; cnpj: string | null; cpf: string | null };
  brand: { name: string; legalName: string | null; nfTakerDocument: string | null; timezone: string };
};

/** O que cada tipo de pedido grava no saque: a nota (PJ) ou o recibo aceito (pessoa física, D-PFRECEIPT). */
type Document = {
  check(creator: LockedCreator, tx: Tx, releasedThrough: string | null): Promise<{ data: Record<string, unknown>; audit: object; after?: (withdrawalId: string) => Promise<unknown> }>;
};

/** Núcleo do pedido: trava a creator, aplica as regras de saldo e janela, grava o pedido com o documento e audita. */
async function createRequest(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: { actorUserId: string; requestId: string; amountCents: number; pixKey?: string },
  doc: Document,
  now: Date,
): Promise<{ withdrawalId: string; created: boolean }> {
  const key = `withdrawal:${input.requestId}`;
  const existing = await prisma.withdrawal.findUnique({ where: { idempotencyKey: key }, select: { id: true, creatorId: true } });
  if (existing) {
    if (existing.creatorId !== ctx.creatorId) throw new WithdrawalRequestError("Pedido inválido. Recarregue a página.");
    return { withdrawalId: existing.id, created: false };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Creator" WHERE id = ${ctx.creatorId} FOR UPDATE`;
      // Outro envio do mesmo pedido pode ter terminado enquanto este esperava a trava.
      const again = await tx.withdrawal.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
      if (again) return { withdrawalId: again.id, created: false };
      const creator = await tx.creator.findUniqueOrThrow({
        where: { id: ctx.creatorId },
        include: {
          account: { select: { id: true, pixKey: true, cnpj: true, cpf: true } },
          brand: {
            select: {
              name: true,
              legalName: true,
              nfTakerDocument: true,
              timezone: true,
              withdrawalMinCents: true,
              withdrawalWindowStartDay: true,
              withdrawalWindowEndDay: true,
            },
          },
        },
      });
      const [balance, released] = await Promise.all([creatorBalance(tx, creator, creator.brand.timezone, now), releasedThroughFor(tx, [creator.id])]);
      const errors = checkWithdrawalRequest(
        { amountCents: input.amountCents, availableCents: balance.availableCents, hasOpenWithdrawal: balance.reservedCents > 0, now },
        {
          minCents: creator.brand.withdrawalMinCents,
          windowStartDay: creator.brand.withdrawalWindowStartDay,
          windowEndDay: creator.brand.withdrawalWindowEndDay,
          timeZone: creator.brand.timezone,
        },
      );
      if (errors.length) throw new WithdrawalRequestError(RULE_TEXT[errors[0]!]);

      const document = await doc.check(creator, tx, released.get(creator.id) ?? null);

      const pix = input.pixKey?.trim();
      if (!creator.account.pixKey) {
        if (!pix) throw new WithdrawalRequestError("Informe a chave Pix para receber.");
        await tx.creatorAccount.update({ where: { id: creator.account.id }, data: { pixKey: pix.slice(0, 140) } });
      }

      const withdrawal = await tx.withdrawal.create({
        data: { brandId: creator.brandId, creatorId: creator.id, amountCents: input.amountCents, idempotencyKey: key, requestedAt: now, ...document.data },
      });
      await document.after?.(withdrawal.id);
      await tx.auditLog.create({
        data: {
          brandId: creator.brandId,
          actorType: "USER",
          actorId: input.actorUserId,
          action: "withdrawal.request",
          entity: "Withdrawal",
          entityId: withdrawal.id,
          after: { amountCents: input.amountCents, availableCents: balance.availableCents, pixKeySet: !creator.account.pixKey, ...document.audit },
        },
      });
      return { withdrawalId: withdrawal.id, created: true };
    });
  } catch (error) {
    if (error instanceof WithdrawalRequestError) throw error;
    if (String(error).includes("Withdrawal_one_open_per_creator")) throw new WithdrawalRequestError(RULE_TEXT.SAQUE_EM_ABERTO);
    if (String(error).includes("Withdrawal_nf_access_key_once")) throw new WithdrawalRequestError(NF_USED);
    throw error;
  }
}

/** Pedido com nota fiscal (creator com CNPJ). */
export async function requestWithdrawal(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: { actorUserId: string; requestId: string; amountCents: number; pdf: Uint8Array; pixKey?: string },
  now = new Date(),
): Promise<{ withdrawalId: string; created: boolean }> {
  assertRequestId(input.requestId);
  await assertCanStart(prisma, ctx);
  checkPdf(input.pdf);
  const nfFields = parseNfseText(await pdfText(input.pdf));
  return createRequest(
    prisma,
    ctx,
    input,
    {
      async check(creator, tx) {
        if (creator.receivesAsIndividual) throw new WithdrawalRequestError("Seu cadastro está como pessoa física: o saque é com recibo, sem nota.");
        const nf = checkNf(nfFields, { takerDoc: creator.brand.nfTakerDocument, takerName: creator.brand.name, amountCents: input.amountCents, issuerDoc: creator.account.cnpj });
        if (nf.problems.length) throw new WithdrawalRequestError(nf.problems.join(" "));
        const accessKey = nfFields.accessKey;
        if (accessKey && (await tx.withdrawal.count({ where: { nfAccessKey: accessKey, status: { in: ["REQUESTED", "PAID"] } } })))
          throw new WithdrawalRequestError(NF_USED);
        // Ficha sem CNPJ: grava o CNPJ de quem emitiu a nota.
        if (!creator.account.cnpj && nf.issuerDoc?.length === 14)
          await tx.creatorAccount.update({ where: { id: creator.account.id }, data: { cnpj: nf.issuerDoc } });
        const file = await tx.file.create({
          data: {
            brandId: creator.brandId,
            bucket: NF_BUCKET,
            path: nfPath(creator.brandId, creator.id, input.requestId),
            mime: "application/pdf",
            sizeBytes: input.pdf.byteLength,
            sha256: createHash("sha256").update(input.pdf).digest("hex"),
            uploadedById: input.actorUserId,
          },
        });
        return { data: { method: "NF_PIX", nfFileId: file.id, nfAccessKey: accessKey, nfCheck: nf.status }, audit: { nfCheck: nf.status } };
      },
    },
    now,
  );
}

/** Texto do recibo que a creator pessoa física vê antes de aceitar (D-PFRECEIPT). */
export function buildReceipt(creator: Pick<LockedCreator, "brand">, input: { fullName: string; cpf: string; amountCents: number }, releasedThrough: string | null, now: Date) {
  return receiptText({
    fullName: input.fullName,
    cpf: input.cpf,
    payerName: creator.brand.legalName ?? creator.brand.name,
    payerDocument: creator.brand.nfTakerDocument,
    brandName: creator.brand.name,
    amountCents: input.amountCents,
    releasedThrough,
    day: dayKey(now, creator.brand.timezone),
  });
}

/** Pedido com recibo (creator marcada como pessoa física na ficha, D-PFRECEIPT). */
export async function requestWithdrawalWithReceipt(
  prisma: PrismaClient,
  ctx: PortalContext,
  input: { actorUserId: string; requestId: string; amountCents: number; fullName: string; cpf: string; accept: boolean; pixKey?: string; ip?: string | null; userAgent?: string | null },
  now = new Date(),
): Promise<{ withdrawalId: string; created: boolean }> {
  assertRequestId(input.requestId);
  await assertCanStart(prisma, ctx);
  const fullName = input.fullName.trim().replace(/\s+/g, " ").slice(0, 160);
  const cpf = input.cpf.replace(/\D/g, "");
  if (fullName.split(" ").length < 2) throw new WithdrawalRequestError("Digite seu nome completo.");
  if (!isValidCpf(cpf)) throw new WithdrawalRequestError("CPF inválido. Confira os números.");
  if (!input.accept) throw new WithdrawalRequestError("Marque que você confere e aceita o recibo.");
  return createRequest(
    prisma,
    ctx,
    input,
    {
      async check(creator, tx, releasedThrough) {
        if (!creator.receivesAsIndividual) throw new WithdrawalRequestError("O saque com recibo é só para quem a equipe cadastrou como pessoa física.");
        const saved = creator.account.cpf?.replace(/\D/g, "") || null;
        if (saved && saved !== cpf) throw new WithdrawalRequestError("O CPF não confere com o seu cadastro. Fale com a equipe.");
        if (!saved) await tx.creatorAccount.update({ where: { id: creator.account.id }, data: { cpf } });
        const body = buildReceipt(creator, { fullName, cpf, amountCents: input.amountCents }, releasedThrough, now);
        return {
          data: { method: "RECEIPT_PIX" },
          audit: { method: "RECEIPT_PIX" },
          after: (withdrawalId) =>
            tx.withdrawalReceipt.create({
              data: { brandId: creator.brandId, withdrawalId, userId: input.actorUserId, fullName, cpf, body, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null, acceptedAt: now },
            }),
        };
      },
    },
    now,
  );
}
