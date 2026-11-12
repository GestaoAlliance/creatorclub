/**
 * Configurações (D-SETTINGSBOARD): nomes legíveis das mudanças da auditoria e o que cada permissão quer dizer, para o
 * histórico de cada aba e a tabela "Quem pode o quê" da Equipe.
 */

export const AUDIT_LABEL: Record<string, string> = {
  "brand.create": "Criou a marca",
  "brand.update": "Editou os dados da marca",
  "brand.kit_options": "Mudou os produtos do kit",
  "brand.welcome_products": "Mudou o envio inicial",
  "brand.contract_lock": "Ligou ou desligou a trava do contrato",
  "brand.asset.set": "Trocou o logo",
  "brand.asset.remove": "Tirou o logo",
  "brand.prospect_messages": "Editou as mensagens de prospecção",
  "invite.create": "Convidou alguém",
  "invite.accept": "Aceitou o convite",
  "invite.revoke": "Cancelou um convite",
  "invite.emailed": "Convite enviado por e-mail",
  "invite.email_failed": "Convite não saiu por e-mail",
  "role.grant": "Deu papel numa marca",
  "role.change": "Trocou o papel",
  "role.revoke": "Tirou um papel",
  "user.disable": "Removeu da equipe",
  "user.login_email": "Trocou o e-mail de entrar",
  "staff.phone": "Mudou o telefone",
  "password.reset_email": "Mandou nova senha por e-mail",
  "password.reset_link": "Gerou link de nova senha",
  "password.temporary": "Gerou senha provisória",
  "contract.published": "Publicou texto de contrato",
  "terms.published": "Publicou o termo",
  "integration.connect": "Conectou a loja",
  "sheet.apply": "Aplicou mudanças da planilha",
  "sheet.undo": "Desfez mudanças da planilha",
  "sheet.creator": "Creator vinda da planilha",
  "sheet.shipment": "Envio vindo da planilha",
  "import.legacy": "Importou do app antigo",
};

export const auditLabel = (action: string) => AUDIT_LABEL[action] ?? action;

/** O que cada permissão libera, em português simples (para a tabela da Equipe). */
export const PERMISSION_LABEL: Record<string, string> = {
  "creators.view": "Ver creators e fichas",
  "creators.edit": "Editar creators, cupons e comissão",
  "money.view": "Ver vendas, comissões e saldos",
  "withdrawals.view": "Ver saques e notas",
  "withdrawals.approve": "Aprovar saques",
  "withdrawals.manage": "Pagar saques e aprovar a abertura",
  "shipping.view": "Ver envios",
  "shipping.manage": "Registrar e enviar produtos",
  "personal.address": "Ver endereço",
  "personal.fiscal": "Ver CPF, CNPJ e Pix",
  "ledger.adjust": "Ajustar saldo à mão",
  "prospects.own": "Prospectar (hunter)",
  "integrations.manage": "Conectar a loja e importar",
  "staff.manage": "Convidar a equipe e configurar a marca",
  "portal.viewAs": "Ver o portal como a creator",
  "tiktok.view": "Ver a lista do TikTok",
  "performance.view": "Ver o Desempenho",
};
