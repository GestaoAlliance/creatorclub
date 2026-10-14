import { Link2, MessageCircle, Target } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/portal/copy-button";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { hunterCodeFrom, whatsappLink } from "@/domain";
import type { hunterPanel } from "@/lib/onboarding/hunters";
import { CreateLinkForm, PhoneForm } from "./forms";

type Brands = Awaited<ReturnType<typeof hunterPanel>>;


/** Tela Hunters (D-HUNTERLINK): link de cada hunter, cliques e candidatas; links pré-preenchidos dos formulários. */
export function HuntersView({ brands, origin }: { brands: Brands; origin: string }) {
  return (
    <>
      <PageHeader title="Hunters">
        Cada hunter tem o próprio link para o formulário de inscrição: a candidata chega marcada com quem a trouxe. Para
        ter um hunter aqui, convide a pessoa em Equipe com o papel Hunter.
      </PageHeader>
      {brands.map((b) => (
        <div key={b.id} className="flex flex-col gap-6">
          {brands.length > 1 && <h2 className={ui.title}>{b.name}</h2>}
          <Card title={`Hunters (${b.hunters.length})`} icon={<Target className="size-4" />}>
            {b.hunters.length === 0 ? (
              <p className={ui.muted}>
                Nenhum hunter ainda. <Link href="/admin/equipe" className={ui.link}>Convidar em Equipe</Link>.
              </p>
            ) : (
              <ul className={ui.list}>
                {b.hunters.map((x) => (
                  <li key={x.userId} className={ui.row}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{x.name}</p>
                        <p className={ui.hint}>{x.email}</p>
                        {x.phone && (
                          <p className="mt-0.5 flex items-center gap-2 text-sm">
                            {x.phone}
                            {whatsappLink(x.phone, `Oi, ${x.name.split(" ")[0]}!`) && (
                              <a href={whatsappLink(x.phone, `Oi, ${x.name.split(" ")[0]}!`)!} target="_blank" rel="noopener noreferrer" className={`${ui.link} inline-flex items-center gap-1 text-xs`}>
                                <MessageCircle className="size-3.5" /> WhatsApp
                              </a>
                            )}
                          </p>
                        )}
                      </div>
                      {x.link && (
                        <span className="flex flex-wrap gap-1.5">
                          <span className={badge.neutral}>{x.link.clicks30} cliques em 30 dias</span>
                          <span className={badge.sky}>{x.link.applications} candidatas</span>
                          <span className={badge.green}>{x.link.approved} aprovadas</span>
                        </span>
                      )}
                    </div>
                    {x.link ? (
                      <div className={`${ui.inset} flex items-center justify-between gap-2`}>
                        <div className="min-w-0">
                          <p className="text-xs text-stone-500">Link de inscrição do hunter</p>
                          <p className="truncate font-mono text-xs">{`${origin}/i/${x.link.code}`}</p>
                        </div>
                        <CopyButton value={`${origin}/i/${x.link.code}`} label="Copiar" />
                      </div>
                    ) : (
                      <CreateLinkForm brandId={b.id} userId={x.userId} suggestion={hunterCodeFrom(x.name)} phone={x.phone} />
                    )}
                    {x.link && <PhoneForm brandId={b.id} userId={x.userId} phone={x.phone} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Formulário de inscrição" icon={<Link2 className="size-4" />}>
            <p className={ui.muted}>Link geral (sem hunter), para divulgar em qualquer lugar:</p>
            <div className={`${ui.inset} flex items-center justify-between gap-2`}>
              <p className="truncate font-mono text-xs">{`${origin}/inscricao`}</p>
              <CopyButton value={`${origin}/inscricao`} label="Copiar" />
            </div>
            <p className={ui.hint}>As respostas viram candidatas em Candidatas. Os formulários antigos do Google continuam chegando lá também.</p>
          </Card>
        </div>
      ))}
    </>
  );
}
