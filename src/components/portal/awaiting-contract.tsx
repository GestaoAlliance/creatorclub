import { FileSignature } from "lucide-react";
import { ui } from "@/components/ui/styles";

/**
 * Portal travado depois da aprovação (D-CONTRACTFLOW): a creator foi aprovada e assina o contrato pelo Autentique.
 * Cupom, extrato e pedidos aparecem quando a parceria fica ativa (depois da assinatura).
 */
export function AwaitingContractGate({ brandName, wait }: { brandName: string; wait: { signed: boolean; status: string | null; signLink: string | null; email: string | null } }) {
  return (
    <section className={`${ui.card} mx-auto w-full max-w-2xl`}>
      <span className={`${ui.pillOn} self-start`}>{wait.signed ? "Quase lá" : "Falta 1 passo"}</span>
      <h1 className={`${ui.title} flex items-center gap-2`}>
        <FileSignature className="size-6" /> {wait.signed ? "Contrato assinado!" : "Sua parceria foi aprovada!"}
      </h1>
      {wait.signed ? (
        <p className={ui.muted}>Recebemos a sua assinatura. Estamos ativando o seu cupom e o seu portal da {brandName}: em poucos minutos você recebe a mensagem com tudo pronto.</p>
      ) : wait.status === "SENT" ? (
        <>
          <p className={ui.muted}>
            Para ativar o seu portal da {brandName} (cupom, vendas, saldo e o seu primeiro pedido), assine o contrato da parceria. Ele foi para o
            seu e-mail{wait.email ? ` (${wait.email})` : ""} pelo Autentique e para o seu WhatsApp.
          </p>
          {wait.signLink && (
            <a href={wait.signLink} target="_blank" rel="noopener noreferrer" className={`${ui.btn} self-start`}>
              Assinar o contrato
            </a>
          )}
          <p className={ui.hint}>Depois de assinar, o portal libera sozinho em alguns minutos.</p>
        </>
      ) : wait.status === "REJECTED" ? (
        <p className={ui.muted}>O contrato foi recusado no Autentique. A equipe da {brandName} vai falar com você para resolver.</p>
      ) : (
        <p className={ui.muted}>Estamos preparando o seu contrato. Em instantes ele chega no seu e-mail e no seu WhatsApp para você assinar.</p>
      )}
    </section>
  );
}
