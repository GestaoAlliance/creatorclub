import { redirect } from "next/navigation";
import { normalizeHunterCode } from "@/domain";

export const dynamic = "force-dynamic";

// Endereço antigo com a marca (D-SIGNUP): leva ao formulário sem marca, mantendo o código do hunter.
export default async function OldSignupPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const code = normalizeHunterCode(typeof h === "string" ? h : "");
  redirect(code ? `/inscricao?h=${encodeURIComponent(code)}` : "/inscricao");
}
