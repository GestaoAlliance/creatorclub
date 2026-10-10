import { Link2, Target } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/portal/copy-button";
import { Card, PageHeader } from "@/components/ui/page";
import { badge, ui } from "@/components/ui/styles";
import { hunterCodeFrom } from "@/domain";
import type { hunterPanel } from "@/lib/onboarding/hunters";
import { CreateLinkForm, FormLinkForm } from "./forms";

type Brands = Awaited<ReturnType<typeof hunterPanel>>;

const FORMS = [
  { form: "hunter", label: "Formulário Hunter" },
  { form: "captacao", label: "Formulário de Captação" },
] as const;

/** Tela Hunters (D-HUNTERLINK): link de cada hunter, cliques e candidatas; links pré-preenchidos dos formulários. */
export function HuntersView({ brands, origin }: { brands: Brands; origin: string }) {
  return (
    <>
      <PageHeader title="Hunters">
        Cada hunter tem o próprio link para os formulários: a candidata chega marcada com quem a trouxe. Para ter um
        hunter aqui, convide a pessoa em Equipe com o papel Hunter.
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
                      <div className="grid gap-2 sm:grid-cols-2">
                        {FORMS.map((f) => {
                          const url = `${origin}/f/${b.slug}/${f.form}/${x.link!.code}`;
                          return (
                            <div key={f.form} className={`${ui.inset} flex items-center justify-between gap-2`}>
                              <div className="min-w-0">
                                <p className="text-xs text-stone-500">{f.label}{!b.forms[f.form] && " · link do formulário não configurado"}</p>
                                <p className="truncate font-mono text-xs">{url}</p>
                              </div>
                              <CopyButton value={url} label="Copiar" />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <CreateLinkForm brandId={b.id} userId={x.userId} suggestion={hunterCodeFrom(x.name)} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Links dos formulários" icon={<Link2 className="size-4" />}>
            <p className={ui.muted}>
              No Google Forms, adicione a pergunta &quot;Código de quem te convidou&quot; (resposta curta, opcional). Depois, em
              ⋮ &gt; &quot;Obter link pré-preenchido&quot;, escreva CODIGO nessa pergunta, clique em &quot;Gerar link&quot; e cole aqui.
            </p>
            {FORMS.map((f) => (
              <FormLinkForm key={f.form} brandId={b.id} form={f.form} current={b.forms[f.form]} label={f.label} />
            ))}
          </Card>
        </div>
      ))}
    </>
  );
}
