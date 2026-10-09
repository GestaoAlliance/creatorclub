import Link from "next/link";
import { redirect } from "next/navigation";
import { brandsWith } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../entrar/actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  GESTAO: "Gestão",
  ENVIO: "Envio",
  PAGAMENTO: "Pagamento",
  HUNTER: "Hunter",
};

// Página mínima de quem entrou: e-mail e papéis. As telas de cada papel vêm depois.
function canSeeCreators(grants: Parameters<typeof brandsWith>[0]): boolean {
  const brands = brandsWith(grants, "creators.view");
  return brands === "ALL" || brands.length > 0;
}

function canEditCreators(grants: Parameters<typeof brandsWith>[0]): boolean {
  const brands = brandsWith(grants, "creators.edit");
  return brands === "ALL" || brands.length > 0;
}

export default async function ContaPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar?next=/conta");
  const actor = await currentActor();
  const roles = actor?.grants.map((g) => `${ROLE_LABEL[g.role] ?? g.role}${g.brandId ? "" : " (todas as marcas)"}`) ?? [];
  const brands = Object.keys(actor?.creatorIds ?? {}).length;
  // Creator sem papel na equipe vai direto para o portal.
  if (actor && brands > 0 && actor.grants.length === 0) redirect("/portal");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Você entrou</h1>
      <p className="text-stone-600">{String(data.claims.email ?? "")}</p>
      {roles.length > 0 && <p className="text-sm">{roles.join(" · ")}</p>}
      {brands > 0 && (
        <Link href="/portal" className="text-sm underline">Meu portal de creator ({brands} marca{brands > 1 ? "s" : ""})</Link>
      )}
      {!actor && <p className="text-sm text-stone-500">Seu acesso ainda não foi liberado.</p>}
      {actor && brandsWith(actor.grants, "staff.manage") === "ALL" && (
        <Link href="/admin/equipe" className="text-sm underline">Equipe e convites</Link>
      )}
      {actor && canSeeCreators(actor.grants) && (
        <Link href="/admin/creators" className="text-sm underline">Creators</Link>
      )}
      {actor && canEditCreators(actor.grants) && (
        <Link href="/admin/cupons" className="text-sm underline">Conferência de cupons</Link>
      )}
      {actor && (brandsWith(actor.grants, "shipping.view") === "ALL" || brandsWith(actor.grants, "shipping.view").length > 0) && (
        <Link href="/admin/envios" className="text-sm underline">Envios</Link>
      )}
      {actor && brandsWith(actor.grants, "integrations.manage") === "ALL" && (
        <Link href="/admin/sync" className="text-sm underline">Saúde do sync (Shopify)</Link>
      )}
      {actor && brandsWith(actor.grants, "integrations.manage") === "ALL" && (
        <Link href="/admin/importar" className="text-sm underline">Importar creators do app antigo</Link>
      )}
      <form action={signOut}>
        <button className="rounded border border-stone-300 px-3 py-2">Sair</button>
      </form>
    </main>
  );
}
