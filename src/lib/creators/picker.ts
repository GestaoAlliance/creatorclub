import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";

/** Campos que a lista de creators do seletor usa para distinguir nomes parecidos. */
export const PICKER_SELECT = {
  account: { select: { name: true, email: true, instagram: true } },
  couponAssignments: { where: { validTo: null }, select: { coupon: { select: { code: true } } } },
} as const;

/** "CUPOM · @insta · e-mail" (e-mail de importação não aparece). */
export function pickerDetail(c: { account: { email: string; instagram: string | null }; couponAssignments: { coupon: { code: string } }[] }): string {
  const parts = [
    ...c.couponAssignments.map((a) => a.coupon.code),
    c.account.instagram ? `@${c.account.instagram.replace(/^@/, "")}` : null,
    c.account.email.endsWith(FAKE_EMAIL_DOMAIN) ? null : c.account.email,
  ];
  return parts.filter(Boolean).join(" · ");
}
