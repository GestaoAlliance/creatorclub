import { UserRound } from "lucide-react";
import { AddressCard } from "@/components/portal/address-card";
import { PixChange } from "@/components/portal/pix-change";
import { PartnershipCard, PersonalCard, PixCard, ProfileProgress, SocialCard } from "@/components/portal/profile-view";
import { PhotoEditor } from "@/components/ui/photo-editor";
import { MotherAsk } from "@/components/portal/mother-ask";
import { Avatar } from "@/components/ui/avatar";
import { db } from "@/lib/db";
import { currentPortalContext } from "@/lib/portal/current";
import { portalProfile } from "@/lib/portal/profile";

export const dynamic = "force-dynamic";

// Meu cadastro (D-PORTALPROFILE): a creator vê os próprios dados, muda o que é dela e pede a correção do resto (D-DATAFIX).
export default async function ProfilePage({ params }: { params: Promise<{ marca: string }> }) {
  const { marca } = await params;
  const ctx = await currentPortalContext(marca);
  const p = await portalProfile(db(), ctx);
  const viewOnly = ctx.viewAs !== null;
  const base = `/portal/${ctx.brand.slug}`;
  // D-PORTALSIMPLE: o nome da mãe (cartão Alelo), que saiu do Início, fica aqui enquanto não respondido; TikTok e aniversário já estão em "Redes e aniversário".
  const ask = viewOnly ? null : await db().creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { receivesAsIndividual: true, account: { select: { motherName: true } } } });
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="@container relative isolate overflow-visible rounded-[32px] text-white shadow-[0_30px_60px_-34px_var(--brand)]">
        <div aria-hidden className="brand-art absolute inset-0 -z-10 overflow-hidden rounded-[32px]" />
        <div aria-hidden className="absolute inset-0 -z-10 rounded-[32px] bg-[radial-gradient(80%_60%_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]" />
        <div className="flex flex-col gap-5 p-5 md:p-7">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/75"><UserRound className="size-3.5" />Meu cadastro</p>
          <div className="flex items-center gap-4">
            {viewOnly ? <Avatar name={p.name} id={ctx.creatorId} size="hero" className="ring-2 ring-white/60" /> : <PhotoEditor creatorId={ctx.creatorId} name={p.name} marca={ctx.brand.slug} size="hero" light />}
            <div className="min-w-0">
              <p className="truncate text-2xl font-semibold leading-tight">{p.name}</p>
              <p className="text-sm text-white/80">{p.partnership.types.join(" · ") || "Creator"} da {ctx.brand.name}</p>
              {!viewOnly && <p className="mt-0.5 text-xs text-white/70">Toque na foto para trocar.</p>}
            </div>
          </div>
          <ProfileProgress p={p} />
        </div>
      </section>
      {ask && ask.receivesAsIndividual && !ask.account.motherName && <div id="pergunta-mae" className="scroll-mt-24"><MotherAsk marca={ctx.brand.slug} /></div>}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4 md:gap-6">
          <PersonalCard p={p} marca={ctx.brand.slug} viewOnly={viewOnly} />
          <div id="redes" className="scroll-mt-24"><SocialCard p={p} marca={ctx.brand.slug} viewOnly={viewOnly} /></div>
        </div>
        <div className="flex flex-col gap-4 md:gap-6">
          {!ctx.ugcOnly && <PixCard p={p}>{!viewOnly && <PixChange marca={ctx.brand.slug} />}</PixCard>}
          <AddressCard marca={ctx.brand.slug} address={p.address} viewOnly={viewOnly} informed={p.informed} />
        </div>
      </div>
      <PartnershipCard p={p} base={base} />
    </div>
  );
}
