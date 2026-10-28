import type { PrismaClient } from "@/generated/prisma/client";
import { financeNfEmail, formatDoc } from "@/domain";
import { EmailError, type EmailSender } from "@/lib/email/sender";

/**
 * D-NFMAIL (reunião de 2026-10-27): a cada nota fiscal enviada, um e-mail individual para o financeiro da marca
 * (`Brand.financeEmail`), com o PDF anexo e o link da tela de Saques. Sem e-mail na marca ou sem remetente, nada sai.
 * Falha no envio não desfaz o pedido de saque: fica na auditoria.
 */
export async function emailNfToFinance(
  prisma: PrismaClient,
  sender: EmailSender | null,
  input: { withdrawalId: string; pdf: Uint8Array; origin: string; actorUserId: string },
): Promise<boolean> {
  const w = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: input.withdrawalId },
    select: {
      brandId: true,
      amountCents: true,
      nfAccessKey: true,
      brand: { select: { name: true, slug: true, financeEmail: true } },
      creator: { select: { account: { select: { name: true, cnpj: true } } } },
    },
  });
  if (!sender || !w.brand.financeEmail) return false;
  const { name, cnpj } = w.creator.account;
  try {
    const { id } = await sender({
      ...financeNfEmail({ brandName: w.brand.name, creatorName: name, cnpj: cnpj ? formatDoc(cnpj) : null, amountCents: w.amountCents, accessKey: w.nfAccessKey, link: `${input.origin}/admin/saques` }),
      to: w.brand.financeEmail,
      brand: { slug: w.brand.slug, name: w.brand.name },
      attachments: [{ filename: `NF-${name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.pdf`, content: input.pdf }],
      idempotencyKey: `nf-finance-${input.withdrawalId}`,
    });
    await prisma.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: input.actorUserId, action: "withdrawal.nf_emailed", entity: "Withdrawal", entityId: input.withdrawalId, after: { to: w.brand.financeEmail, providerId: id } },
    });
    return true;
  } catch (error) {
    if (!(error instanceof EmailError)) throw error;
    await prisma.auditLog.create({
      data: { brandId: w.brandId, actorType: "USER", actorId: input.actorUserId, action: "withdrawal.nf_email_failed", entity: "Withdrawal", entityId: input.withdrawalId, after: { reason: error.message } },
    });
    return false;
  }
}
