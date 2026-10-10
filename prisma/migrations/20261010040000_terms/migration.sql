-- CreateTable
CREATE TABLE "TermsVersion" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "termsVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TermsVersion_brandId_version_key" ON "TermsVersion"("brandId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TermsVersion_id_brandId_key" ON "TermsVersion"("id", "brandId");

-- CreateIndex
CREATE INDEX "TermsAcceptance_termsVersionId_idx" ON "TermsAcceptance"("termsVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_creatorId_termsVersionId_key" ON "TermsAcceptance"("creatorId", "termsVersionId");

-- AddForeignKey
ALTER TABLE "TermsVersion" ADD CONSTRAINT "TermsVersion_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_termsVersionId_brandId_fkey" FOREIGN KEY ("termsVersionId", "brandId") REFERENCES "TermsVersion"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS (D-RLS).
ALTER TABLE "TermsVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TermsAcceptance" ENABLE ROW LEVEL SECURITY;

-- Travas (D-TERMS): versão positiva, texto não vazio, CPF com 11 números, nome preenchido.
ALTER TABLE "TermsVersion"
  ADD CONSTRAINT "TermsVersion_valid" CHECK ("version" > 0 AND btrim("title") <> '' AND btrim("body") <> '');
ALTER TABLE "TermsAcceptance"
  ADD CONSTRAINT "TermsAcceptance_cpf" CHECK ("cpf" ~ '^[0-9]{11}$'),
  ADD CONSTRAINT "TermsAcceptance_name" CHECK (btrim("fullName") <> '');

-- Texto e aceite são prova: só recebem inserções.
CREATE TRIGGER "TermsVersion_append_only"
  BEFORE UPDATE OR DELETE ON "TermsVersion"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE TRIGGER "TermsAcceptance_append_only"
  BEFORE UPDATE OR DELETE ON "TermsAcceptance"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Versão 1 da Botanika: rascunho aprovado pelo responsável no PR (D-TERMS). Só se a marca existir.
INSERT INTO "TermsVersion" ("id", "brandId", "version", "title", "body", "createdById")
SELECT gen_random_uuid()::text, b."id", 1, 'Termo de adesão ao Creator Club Botanika', $termo$Este termo explica como funciona a sua parceria com a Botanika (CNPJ 65.100.830/0001-36) no Creator Club. Leia com calma: ao aceitar, você concorda com as condições abaixo.

1. O PROGRAMA
O Creator Club é o programa de parceria da Botanika com criadoras de conteúdo, influenciadoras e prescritores ("você"). A parceria não cria vínculo de emprego, sociedade ou representação comercial entre você e a Botanika.

2. CUPOM E LINK
Você recebe um cupom pessoal e um link da loja oficial com o cupom já aplicado. O cupom é só seu e não pode ser transferido. O desconto que o cliente recebe com o cupom é definido pela Botanika e pode mudar.

3. COMISSÃO
3.1. Você recebe comissão sobre as vendas feitas com o seu cupom na loja oficial da Botanika.
3.2. A comissão é calculada sobre o valor dos produtos do pedido, sem frete, já com descontos e devoluções.
3.3. Só contam pedidos pagos e não cancelados.
3.4. Se um pedido tiver mais de um cupom de creator, a venda conta para o primeiro cupom informado no pedido. Cupons promocionais da loja nunca geram comissão.
3.5. A taxa é a combinada com a equipe e aparece no seu portal. Vale a taxa em vigor no dia do pagamento do pedido; uma mudança de taxa vale só para pedidos pagos depois dela.

4. LIBERAÇÃO, ESTORNOS E SALDO
4.1. A comissão fica "a liberar" por 7 dias depois do pagamento do pedido; depois disso fica disponível para saque.
4.2. A venda conta no mês em que o pedido foi pago.
4.3. Se um pedido for devolvido, cancelado ou estornado, a comissão dele é descontada do seu saldo, mesmo que já tenha sido sacada. Nesse caso o saldo pode ficar negativo e é compensado com as próximas comissões.
4.4. Você acompanha vendas, comissões, saldo e extrato pelo portal.

5. SAQUE
5.1. Os pedidos de saque são feitos pelo portal, do dia 10 ao dia 15 de cada mês, com valor mínimo de R$ 500,00 por pedido. Você pode sacar parte do saldo disponível.
5.2. Só pode haver um pedido em análise por vez.
5.3. Antes de pedir, você emite a nota fiscal de serviço no mesmo valor do saque, com os dados do tomador informados no portal, e envia o PDF no pedido.
5.4. O pagamento é feito por Pix, na chave que você informar.
5.5. A equipe pode recusar um pedido explicando o motivo (por exemplo, nota com valor ou dados diferentes). Você pode corrigir e pedir de novo dentro da janela.

6. PRODUTOS ENVIADOS
A Botanika pode enviar produtos para você conhecer e divulgar. Mantenha seu endereço de entrega atualizado no portal e confirme o recebimento quando o produto chegar.

7. DIVULGAÇÃO
7.1. Divulgue os produtos com honestidade e sinalize quando o conteúdo for publicidade.
7.2. Não faça promessas de resultado ou de saúde que não estejam nas informações oficiais dos produtos.

8. ENCERRAMENTO
Você ou a Botanika podem encerrar a parceria a qualquer momento. Com o encerramento, o cupom é desativado e você continua vendo seu saldo e seu extrato no portal.

9. SEUS DADOS (LGPD)
Para operar o programa, a Botanika trata seu nome, e-mail, telefone, CPF ou CNPJ, chave Pix, endereço de entrega e os dados das vendas feitas com o seu cupom (sem dados pessoais dos clientes). Esses dados servem para calcular comissões, pagar saques, conferir notas fiscais e enviar produtos, e só são acessados pela equipe autorizada. Para pedidos sobre seus dados, fale com a equipe do programa.

10. MUDANÇAS NESTE TERMO
Se este termo mudar, a nova versão aparece no portal e você precisa aceitá-la para continuar usando o portal.

11. ACEITE ELETRÔNICO
Ao confirmar o aceite, você declara que leu e concorda com este termo. Registramos seu nome completo, CPF, data, hora e endereço de IP como prova do aceite.$termo$, 'claude-rascunho'
FROM "Brand" b WHERE b."slug" = 'botanika';
