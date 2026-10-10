-- D-TERMS + D-CONTRACT: termo v2 da Botanika com as regras do contrato (liberação mensal com mínimo de vendas,
-- saque do valor total do dia 1 ao 10, pagamento até o dia 15). Texto aprovado pelo responsável em 2026-10-10.
-- Texto novo pede novo aceite de todas as creators.
WITH v AS (
  INSERT INTO "TermsVersion" ("id", "brandId", "version", "title", "body", "createdById")
  SELECT gen_random_uuid()::text, b."id", (SELECT COALESCE(MAX(t."version"), 0) + 1 FROM "TermsVersion" t WHERE t."brandId" = b."id"),
    'Termo de adesão ao Creator Club Botanika', $termo$Este termo explica como funciona a sua parceria com a Botanika (CNPJ 65.100.830/0001-36) no Creator Club. Leia com calma: ao aceitar, você concorda com as condições abaixo.

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
4.1. A venda conta no mês em que o pedido foi pago.
4.2. A comissão de cada mês fica "a liberar" e é liberada no dia 1 do mês seguinte, desde que as suas vendas somadas desde a última liberação atinjam o mínimo do programa: R$ 500,00 para influenciadoras e criadoras de conteúdo e R$ 1.000,00 para prescritores.
4.3. Se o mínimo não for atingido, as vendas do mês se somam às do mês seguinte, e assim por diante, até atingir o mínimo. Nesse dia 1, toda a comissão acumulada até ali é liberada.
4.4. Se um pedido for devolvido, cancelado ou estornado, a comissão dele é descontada do seu saldo, mesmo que já tenha sido sacada. Nesse caso o saldo pode ficar negativo e é compensado com as próximas comissões.
4.5. Você acompanha vendas, comissões, quanto falta para a próxima liberação, saldo e extrato pelo portal.

5. SAQUE
5.1. Os pedidos de saque são feitos pelo portal, do dia 1 ao dia 10 de cada mês, sempre do valor total disponível para saque (não há saque parcial).
5.2. Só pode haver um pedido em análise por vez.
5.3. Antes de pedir, você emite a nota fiscal de serviço no valor total disponível, com os dados do tomador informados no portal, e envia o PDF no pedido.
5.4. O pagamento é feito por Pix, na chave que você informar, até o dia 15 do mesmo mês.
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
Ao confirmar o aceite, você declara que leu e concorda com este termo. Registramos seu nome completo, CPF, data, hora e endereço de IP como prova do aceite.$termo$, 'claude-v2-aprovado-pedro'
  FROM "Brand" b WHERE b."slug" = 'botanika'
  RETURNING "id", "brandId", "version"
)
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "action", "entity", "entityId", "after")
SELECT gen_random_uuid()::text, v."brandId", 'SYSTEM', 'terms.published', 'TermsVersion', v."id", jsonb_build_object('version', v."version")
FROM v;
