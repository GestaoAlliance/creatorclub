import { db } from "@/lib/db";
import { creatorInviteByToken } from "@/lib/team/creator-invites";
import { inviteByToken } from "@/lib/team/invites";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  GESTAO: "Gestão",
  ENVIO: "Envio",
  PAGAMENTO: "Pagamento",
  HUNTER: "Hunter",
};

export type ResolvedInvite = {
  kind: "staff" | "creator";
  state: "valid" | "invalid" | "expired" | "used" | "revoked";
  email: string;
  name: string;
  /** Texto do que a pessoa recebe ao aceitar. */
  grantText: string;
};

/** Um link de convite serve para equipe ou creator: procura nos dois. */
export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  const staff = await inviteByToken(db(), token);
  if (staff.invite) {
    const where = staff.invite.brand ? `na marca ${staff.invite.brand.name}` : "(todas as marcas)";
    return {
      kind: "staff",
      state: staff.state,
      email: staff.invite.email,
      name: staff.invite.name,
      grantText: `${ROLE_LABEL[staff.invite.role]} ${where}`,
    };
  }
  const creator = await creatorInviteByToken(db(), token);
  if (creator.invite) {
    const brands = creator.invite.account.creators.map((c) => c.brand.name).join(", ");
    return {
      kind: "creator",
      state: creator.state,
      email: creator.invite.account.email.toLowerCase(),
      name: creator.invite.account.name,
      grantText: `creator${brands ? ` (${brands})` : ""}`,
    };
  }
  return null;
}
