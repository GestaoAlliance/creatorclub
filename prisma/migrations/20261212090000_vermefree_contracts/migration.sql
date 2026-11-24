-- D-VFRULES (2026-11-24): contratos novos da VermeFree (CPF e CNPJ, 1 produto), distratos da VermeFree e da Botanika
-- (versão única para CPF e CNPJ), regra de produto da VermeFree (1 produto por mês com R$ 2.000, vendas de dezembro em
-- diante), contrato da VermeFree sem prazo (0 meses = indeterminado) e o fim do envio de 2 produtos + 3 vídeos na
-- aprovação da Botanika e da VermeFree. Respostas do responsável em 2026-11-24.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "welcomeTwoOffered" BOOLEAN NOT NULL DEFAULT true;


-- 0 meses = prazo indeterminado (sem data de fim).
ALTER TABLE "ContractTemplate" DROP CONSTRAINT "ContractTemplate_values";
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_values" CHECK (
  ("releaseMinCents" IS NULL OR "releaseMinCents" > 0) AND "months" >= 0 AND jsonb_typeof("kitTiers") = 'array'
);

UPDATE "Brand" SET "welcomeTwoOffered" = false WHERE "slug" IN ('botanika', 'vermefree');
UPDATE "Brand" SET "monthlyKitFrom" = '2026-12' WHERE "slug" = 'vermefree' AND "monthlyKitFrom" IS NULL;
UPDATE "ContractTemplate" t SET "months" = 0 FROM "Brand" b WHERE b."id" = t."brandId" AND b."slug" = 'vermefree' AND t."documentKind" = 'INFLUENCER';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), b."id", 'SYSTEM', 'migration:vermefree_contracts', 'brand.rules', 'Brand', b."id",
  CASE WHEN b."slug" = 'vermefree'
    THEN jsonb_build_object('welcomeTwoOffered', false, 'monthlyKitFrom', '2026-12', 'kit', '1 produto com R$ 2.000 no mês', 'influencerMonths', 0)
    ELSE jsonb_build_object('welcomeTwoOffered', false) END, now()
FROM "Brand" b WHERE b."slug" IN ('botanika', 'vermefree');

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'INFLUENCER_PF_1', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'INFLUENCER_PF_1'), 0) + 1,
  $t$Contrato de parceria Influencer VermeFree — CPF — 1 produto$t$, $c$CONTRATO DE PARCERIA DIGITAL INFLUENCER
Pelo presente instrumento particular de contrato, entre as partes abaixo qualificadas:
CONTRATANTE: SINTONIA PHARMA FARMÁCIA COM MANIPULAÇÃO LTDA, inscrita no CNPJ sob nº 37.560.104/0001-60, com sede em Rua 2870, 453 – Sala 6 – Centro – Balneário Camboriú - Santa Catarina, detentora da marca VermeFree.
CONTRATADA: {{NOME}}, inscrita no CPF sob nº {{CPF}}, residente em {{ENDERECO}}.
CLÁUSULA 1ª – DO OBJETO
A CONTRATADA prestará serviços de Influencer Digital e cederá seus direitos de imagem para campanhas da CONTRATANTE para a marca VermeFree.
1.1 Informações da Campanha
Direito de Uso de Imagem: SIM
Canais: Redes Sociais e Collabs.
Produto da parceria: 01 (um) produto da linha VermeFree, à escolha da CONTRATADA entre as opções disponíveis na plataforma de parceiros da CONTRATANTE.
1.2 Das Entregas
Durante a vigência deste contrato, a CONTRATADA se obriga a realizar as seguintes publicações:
02 (dois) stories por semana.
As publicações deverão utilizar o cupom/link fornecido pela CONTRATANTE e conter a marcação do perfil oficial da CONTRATANTE.
Os conteúdos de collabs devem ser previamente aprovados pela CONTRATANTE antes da publicação.
Parágrafo único – O não cumprimento das entregas previstas nesta cláusula autoriza a CONTRATANTE a suspender o envio de novos produtos e a rescindir o contrato, nos termos da Cláusula 7ª. A cobrança do valor do produto aplica-se exclusivamente à hipótese prevista no item 2.7 (primeiro envio, sem nenhuma publicação no primeiro mês).
1.3 Das Regras de Conteúdo
1.3.1 Todas as publicações deverão identificar claramente sua natureza publicitária (por exemplo, #publi, “parceria paga” ou recurso equivalente da plataforma), conforme as normas do CONAR.
1.3.2 A CONTRATADA não poderá fazer promessas de resultado nem recomendações terapêuticas ou médicas, nem atribuir aos produtos propriedades de cura, tratamento ou eliminação de doenças ou parasitas, composição, benefício, eficácia ou modo de uso que não constem do material informativo fornecido ou aprovado pela CONTRATANTE. Comparações de “antes e depois” dependem de aprovação prévia da CONTRATANTE.
1.3.3 A CONTRATANTE poderá solicitar a correção ou a remoção de conteúdo publicado em desacordo com esta cláusula, devendo a solicitação ser atendida em até 24 (vinte e quatro) horas.
1.3.4 A CONTRATADA responde pelas alegações e manifestações feitas em desacordo com esta cláusula ou com o material aprovado.
CLÁUSULA 2ª – DA PARCERIA E PAGAMENTO
2.1 No primeiro envio, a CONTRATANTE enviará à CONTRATADA 01 (um) produto inicial da linha VermeFree, conforme escolha da CONTRATADA, além de comissão de 10% (dez por cento) sobre as vendas geradas pelo link/cupom promocional. Após esse primeiro envio, a CONTRATADA receberá 01 (um) produto novo a cada mês em que atingir R$ 2.000,00 (dois mil reais) em vendas, com envio no mês seguinte ao da apuração. O cupom exclusivo da CONTRATADA dará 5% (cinco por cento) de desconto aos seus seguidores, podendo ser reduzido para 2% (dois por cento), acumulável com as ofertas, durante campanhas promocionais do site, sem alteração do percentual de comissão.
2.2 Consideram-se vendas geradas apenas aquelas efetivamente faturadas e pagas pelo consumidor final.
2.3 A comissão será calculada exclusivamente sobre vendas líquidas, excluindo o valor de frete dos pedidos realizados com o cupom/link, cancelamentos, estornos, chargebacks, devoluções, pedidos fraudulentos e pedidos não faturados.
2.4 O valor mínimo para saque é de R$ 100,00 (cem reais). Comissões inferiores a esse valor no mês serão acumuladas para o mês seguinte.
2.4.1 A solicitação de saque deverá ser feita entre os dias 05 (cinco) e 15 (quinze) de cada mês.
2.4.2 O saque é obrigatório e corresponderá ao valor total da comissão do mês anterior, não sendo possível solicitar valores parciais. Não havendo solicitação no período do item 2.4.1, o valor permanecerá acumulado para o período de solicitação seguinte.
2.4.3 Os pagamentos serão realizados entre os dias 20 (vinte) e 25 (vinte e cinco) do mês da solicitação.
2.5 A CONTRATANTE disponibilizará relatório mensal contendo o valor das vendas realizadas por meio do cupom ou link exclusivo.
2.6 Os pagamentos serão feitos por depósito em conta de titularidade da CONTRATADA, vinculada ao seu CPF, sem emissão de RPA (Recibo de Pagamento a Autônomo).
2.7 O produto enviado nos termos do item 2.1 é fornecido como contrapartida das publicações previstas na Cláusula 1.2, para que a CONTRATADA o divulgue e gere vendas comissionadas. A CONTRATADA declara estar ciente de que, caso não realize nenhuma das publicações combinadas nos primeiros 30 (trinta) dias após o recebimento do primeiro envio, deverá pagar à CONTRATANTE o valor do(s) produto(s) desse primeiro envio, conforme o preço de venda vigente no site oficial da VermeFree na data do envio. Essa cobrança aplica-se somente ao primeiro envio, não se estendendo aos produtos enviados posteriormente.
2.8 O valor previsto no item 2.7 poderá ser descontado das comissões devidas à CONTRATADA ou, não havendo comissões suficientes, deverá ser pago em até 10 (dez) dias após a notificação da CONTRATANTE.
CLÁUSULA 3ª – DO PRAZO
3.1 O contrato terá duração por prazo indeterminado e será encerrado automaticamente, independentemente de aviso prévio, caso a CONTRATADA permaneça 2 (dois) meses consecutivos sem nenhuma venda por meio do cupom/link exclusivo, permanecendo devidas as comissões sobre vendas já realizadas. O encerramento por ausência de vendas não gera cobrança do produto, ressalvada a hipótese do item 2.7.
3.2 DIREITO DE IMAGEM
A CONTRATADA autoriza a utilização de sua imagem, nome, voz e conteúdo produzido para divulgação da marca em redes sociais, website, e-commerce, campanhas patrocinadas, anúncios digitais e materiais institucionais durante a vigência do contrato e por mais 12 (doze) meses após seu encerramento.
3.2.1 Encerrado o prazo acima, a CONTRATANTE não poderá promover novos impulsionamentos ou anúncios pagos com a imagem da CONTRATADA, mas poderá manter publicados, em seus canais próprios, os conteúdos já veiculados durante o período autorizado, sem remuneração adicional.
3.2.2 A CONTRATANTE poderá realizar adaptações técnicas nos conteúdos, como cortes, legendas, redimensionamento e ajuste de duração, desde que não alterem o sentido das manifestações da CONTRATADA.
3.2.3 A imagem e os conteúdos da CONTRATADA não poderão ser utilizados para divulgação de marcas ou produtos estranhos à marca VermeFree.
CLÁUSULA 4ª – OBRIGAÇÕES DA CONTRATANTE
Fornecer informações, materiais, imagens, produtos e orientações necessárias para execução da campanha.
CLÁUSULA 5ª – OBRIGAÇÕES DA CONTRATADA
5.1 Cumprir as entregas de conteúdo previstas na Cláusula 1.2, nos prazos e quantidades ali indicados.
5.2 Quando realizar postagens, utilizar o respectivo cupom/link, sem divulgá-lo em sites, aplicativos ou grupos de cupons de desconto.
5.3 Não se fazer substituir por terceiros.
5.4 Respeitar direitos de propriedade intelectual.
5.5 Responder por conteúdos publicados em desacordo com a legislação.
5.6 Declarar que as opiniões emitidas serão verdadeiras e compatíveis com sua experiência, observando normas do CONAR e legislação aplicável.
CLÁUSULA 6ª – NÃO EXCLUSIVIDADE
6.1 O presente contrato não estabelece exclusividade ampla entre as partes.
6.2 Durante sua vigência, a CONTRATADA não poderá divulgar concorrentes diretos da CONTRATANTE sem autorização prévia e expressa.
6.3 Caso a CONTRATADA se envolva em situações que possam causar danos à reputação da CONTRATANTE, esta poderá rescindir imediatamente o contrato, sem aplicação de multa.
CLÁUSULA 7ª – RESCISÃO
7.1 Poderá ocorrer por comum acordo entre as partes.
7.2 Poderá ocorrer unilateralmente, por qualquer das partes, mediante aviso prévio mínimo de 30 dias, sem necessidade de justificativa e sem aplicação de multa ou qualquer ônus.
7.3 Em caso de descumprimento contratual, a rescisão poderá ocorrer de forma imediata, sem aplicação de multa contratual pré-fixada, resguardado o direito da parte prejudicada de pleitear, por vias próprias, a reparação de danos efetivamente comprovados.
7.4 O não cumprimento das entregas de conteúdo previstas na Cláusula 1.2 caracteriza descumprimento contratual e autoriza a CONTRATANTE a rescindir o contrato de forma imediata, sem aplicação de multa, permanecendo devidas as comissões sobre vendas já realizadas. Caso não tenha havido nenhuma publicação no primeiro mês após o primeiro envio, aplica-se ainda a cobrança prevista nos itens 2.7 e 2.8.
CLÁUSULA 8ª – TÍTULO EXECUTIVO
O presente contrato constitui título executivo extrajudicial, nos termos do art. 784, III, do CPC. Quando celebrado por meio eletrônico, fica dispensada a assinatura de testemunhas, nos termos do art. 784, § 4º, do CPC, desde que a integridade das assinaturas seja conferida por provedor de assinatura eletrônica.
CLÁUSULA 9ª – DISPOSIÇÕES GERAIS
9.1 Os briefings e materiais informativos sobre os produtos fornecidos pela CONTRATANTE integram o presente instrumento para todos os fins.
9.2 LGPD
As partes comprometem-se a cumprir integralmente a Lei nº 13.709/2018 (LGPD).
CLÁUSULA 10ª – FORO
Fica eleito o foro da Comarca de Balneário Camboriú/SC para dirimir quaisquer controvérsias oriundas deste contrato.
E por estarem justas e contratadas, firmam o presente instrumento.
{{DATA}}
_______________________________________
SINTONIA PHARMA FARMÁCIA COM MANIPULAÇÃO LTDA
CNPJ sob o nº 37.560.104/0001-60
_______________________________________
{{NOME}}
CPF sob o nº {{CPF}}
TESTEMUNHAS
(dispensadas em caso de assinatura eletrônica, nos termos do art. 784, § 4º, do CPC)
1. Nome: ______________________________ CPF: ____________________
2. Nome: ______________________________ CPF: ____________________$c$, 'migration:vermefree_contracts', now()
FROM "Brand" b WHERE b."slug" = 'vermefree';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'INFLUENCER_PJ_1', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'INFLUENCER_PJ_1'), 0) + 1,
  $t$Contrato de parceria Influencer VermeFree — CNPJ — 1 produto$t$, $c$CONTRATO DE PARCERIA DIGITAL INFLUENCER
Pelo presente instrumento particular de contrato, entre as partes abaixo qualificadas:
CONTRATANTE: SINTONIA PHARMA FARMÁCIA COM MANIPULAÇÃO LTDA, inscrita no CNPJ sob nº 37.560.104/0001-60, com sede em Rua 2870, 453 – Sala 6 – Centro – Balneário Camboriú - Santa Catarina, detentora da marca VermeFree.
CONTRATADA: {{RAZAO_SOCIAL}}, inscrita no CNPJ sob nº {{CNPJ}}, com sede em {{ENDERECO}}, neste ato representada por {{NOME}}, inscrito(a) no CPF sob nº {{CPF}}.
CLÁUSULA 1ª – DO OBJETO
A CONTRATADA prestará serviços de Influencer Digital e cederá seus direitos de imagem para campanhas da CONTRATANTE para a marca VermeFree.
1.1 Informações da Campanha
Direito de Uso de Imagem: SIM
Canais: Redes Sociais e Collabs.
Produto da parceria: 01 (um) produto da linha VermeFree, à escolha da CONTRATADA entre as opções disponíveis na plataforma de parceiros da CONTRATANTE.
1.2 Das Entregas
Durante a vigência deste contrato, a CONTRATADA se obriga a realizar as seguintes publicações:
02 (dois) stories por semana.
As publicações deverão utilizar o cupom/link fornecido pela CONTRATANTE e conter a marcação do perfil oficial da CONTRATANTE.
Os conteúdos de collabs devem ser previamente aprovados pela CONTRATANTE antes da publicação.
Parágrafo único – O não cumprimento das entregas previstas nesta cláusula autoriza a CONTRATANTE a suspender o envio de novos produtos e a rescindir o contrato, nos termos da Cláusula 7ª. A cobrança do valor do produto aplica-se exclusivamente à hipótese prevista no item 2.7 (primeiro envio, sem nenhuma publicação no primeiro mês).
1.3 Das Regras de Conteúdo
1.3.1 Todas as publicações deverão identificar claramente sua natureza publicitária (por exemplo, #publi, “parceria paga” ou recurso equivalente da plataforma), conforme as normas do CONAR.
1.3.2 A CONTRATADA não poderá fazer promessas de resultado nem recomendações terapêuticas ou médicas, nem atribuir aos produtos propriedades de cura, tratamento ou eliminação de doenças ou parasitas, composição, benefício, eficácia ou modo de uso que não constem do material informativo fornecido ou aprovado pela CONTRATANTE. Comparações de “antes e depois” dependem de aprovação prévia da CONTRATANTE.
1.3.3 A CONTRATANTE poderá solicitar a correção ou a remoção de conteúdo publicado em desacordo com esta cláusula, devendo a solicitação ser atendida em até 24 (vinte e quatro) horas.
1.3.4 A CONTRATADA responde pelas alegações e manifestações feitas em desacordo com esta cláusula ou com o material aprovado.
CLÁUSULA 2ª – DA PARCERIA E PAGAMENTO
2.1 No primeiro envio, a CONTRATANTE enviará à CONTRATADA 01 (um) produto inicial da linha VermeFree, conforme escolha da CONTRATADA, além de comissão de 10% (dez por cento) sobre as vendas geradas pelo link/cupom promocional. Após esse primeiro envio, a CONTRATADA receberá 01 (um) produto novo a cada mês em que atingir R$ 2.000,00 (dois mil reais) em vendas, com envio no mês seguinte ao da apuração. O cupom exclusivo da CONTRATADA dará 5% (cinco por cento) de desconto aos seus seguidores, podendo ser reduzido para 2% (dois por cento), acumulável com as ofertas, durante campanhas promocionais do site, sem alteração do percentual de comissão.
2.2 Consideram-se vendas geradas apenas aquelas efetivamente faturadas e pagas pelo consumidor final.
2.3 A comissão será calculada exclusivamente sobre vendas líquidas, excluindo o valor de frete dos pedidos realizados com o cupom/link, cancelamentos, estornos, chargebacks, devoluções, pedidos fraudulentos e pedidos não faturados.
2.4 O valor mínimo para saque é de R$ 100,00 (cem reais). Comissões inferiores a esse valor no mês serão acumuladas para o mês seguinte.
2.4.1 A solicitação de saque deverá ser feita entre os dias 05 (cinco) e 15 (quinze) de cada mês.
2.4.2 O saque é obrigatório e corresponderá ao valor total da comissão do mês anterior, não sendo possível solicitar valores parciais. Não havendo solicitação no período do item 2.4.1, o valor permanecerá acumulado para o período de solicitação seguinte.
2.4.3 Os pagamentos serão realizados entre os dias 20 (vinte) e 25 (vinte e cinco) do mês da solicitação.
2.5 A CONTRATANTE disponibilizará relatório mensal contendo o valor das vendas realizadas por meio do cupom ou link exclusivo.
2.6 Os pagamentos serão feitos por depósito em conta de titularidade da CONTRATADA, vinculada ao seu CNPJ, mediante a emissão e o envio à CONTRATANTE de nota fiscal no valor da comissão, junto com a solicitação de saque. Sem a nota fiscal, o pagamento ficará suspenso até o seu envio.
2.7 O produto enviado nos termos do item 2.1 é fornecido como contrapartida das publicações previstas na Cláusula 1.2, para que a CONTRATADA o divulgue e gere vendas comissionadas. A CONTRATADA declara estar ciente de que, caso não realize nenhuma das publicações combinadas nos primeiros 30 (trinta) dias após o recebimento do primeiro envio, deverá pagar à CONTRATANTE o valor do(s) produto(s) desse primeiro envio, conforme o preço de venda vigente no site oficial da VermeFree na data do envio. Essa cobrança aplica-se somente ao primeiro envio, não se estendendo aos produtos enviados posteriormente.
2.8 O valor previsto no item 2.7 poderá ser descontado das comissões devidas à CONTRATADA ou, não havendo comissões suficientes, deverá ser pago em até 10 (dez) dias após a notificação da CONTRATANTE.
CLÁUSULA 3ª – DO PRAZO
3.1 O contrato terá duração por prazo indeterminado e será encerrado automaticamente, independentemente de aviso prévio, caso a CONTRATADA permaneça 2 (dois) meses consecutivos sem nenhuma venda por meio do cupom/link exclusivo, permanecendo devidas as comissões sobre vendas já realizadas. O encerramento por ausência de vendas não gera cobrança do produto, ressalvada a hipótese do item 2.7.
3.2 DIREITO DE IMAGEM
A CONTRATADA autoriza a utilização de sua imagem, nome, voz e conteúdo produzido para divulgação da marca em redes sociais, website, e-commerce, campanhas patrocinadas, anúncios digitais e materiais institucionais durante a vigência do contrato e por mais 12 (doze) meses após seu encerramento.
3.2.1 Encerrado o prazo acima, a CONTRATANTE não poderá promover novos impulsionamentos ou anúncios pagos com a imagem da CONTRATADA, mas poderá manter publicados, em seus canais próprios, os conteúdos já veiculados durante o período autorizado, sem remuneração adicional.
3.2.2 A CONTRATANTE poderá realizar adaptações técnicas nos conteúdos, como cortes, legendas, redimensionamento e ajuste de duração, desde que não alterem o sentido das manifestações da CONTRATADA.
3.2.3 A imagem e os conteúdos da CONTRATADA não poderão ser utilizados para divulgação de marcas ou produtos estranhos à marca VermeFree.
CLÁUSULA 4ª – OBRIGAÇÕES DA CONTRATANTE
Fornecer informações, materiais, imagens, produtos e orientações necessárias para execução da campanha.
CLÁUSULA 5ª – OBRIGAÇÕES DA CONTRATADA
5.1 Cumprir as entregas de conteúdo previstas na Cláusula 1.2, nos prazos e quantidades ali indicados.
5.2 Quando realizar postagens, utilizar o respectivo cupom/link, sem divulgá-lo em sites, aplicativos ou grupos de cupons de desconto.
5.3 Não se fazer substituir por terceiros.
5.4 Respeitar direitos de propriedade intelectual.
5.5 Responder por conteúdos publicados em desacordo com a legislação.
5.6 Declarar que as opiniões emitidas serão verdadeiras e compatíveis com sua experiência, observando normas do CONAR e legislação aplicável.
CLÁUSULA 6ª – NÃO EXCLUSIVIDADE
6.1 O presente contrato não estabelece exclusividade ampla entre as partes.
6.2 Durante sua vigência, a CONTRATADA não poderá divulgar concorrentes diretos da CONTRATANTE sem autorização prévia e expressa.
6.3 Caso a CONTRATADA se envolva em situações que possam causar danos à reputação da CONTRATANTE, esta poderá rescindir imediatamente o contrato, sem aplicação de multa.
CLÁUSULA 7ª – RESCISÃO
7.1 Poderá ocorrer por comum acordo entre as partes.
7.2 Poderá ocorrer unilateralmente, por qualquer das partes, mediante aviso prévio mínimo de 30 dias, sem necessidade de justificativa e sem aplicação de multa ou qualquer ônus.
7.3 Em caso de descumprimento contratual, a rescisão poderá ocorrer de forma imediata, sem aplicação de multa contratual pré-fixada, resguardado o direito da parte prejudicada de pleitear, por vias próprias, a reparação de danos efetivamente comprovados.
7.4 O não cumprimento das entregas de conteúdo previstas na Cláusula 1.2 caracteriza descumprimento contratual e autoriza a CONTRATANTE a rescindir o contrato de forma imediata, sem aplicação de multa, permanecendo devidas as comissões sobre vendas já realizadas. Caso não tenha havido nenhuma publicação no primeiro mês após o primeiro envio, aplica-se ainda a cobrança prevista nos itens 2.7 e 2.8.
CLÁUSULA 8ª – TÍTULO EXECUTIVO
O presente contrato constitui título executivo extrajudicial, nos termos do art. 784, III, do CPC. Quando celebrado por meio eletrônico, fica dispensada a assinatura de testemunhas, nos termos do art. 784, § 4º, do CPC, desde que a integridade das assinaturas seja conferida por provedor de assinatura eletrônica.
CLÁUSULA 9ª – DISPOSIÇÕES GERAIS
9.1 Os briefings e materiais informativos sobre os produtos fornecidos pela CONTRATANTE integram o presente instrumento para todos os fins.
9.2 LGPD
As partes comprometem-se a cumprir integralmente a Lei nº 13.709/2018 (LGPD).
CLÁUSULA 10ª – FORO
Fica eleito o foro da Comarca de Balneário Camboriú/SC para dirimir quaisquer controvérsias oriundas deste contrato.
E por estarem justas e contratadas, firmam o presente instrumento.
{{DATA}}
_______________________________________
SINTONIA PHARMA FARMÁCIA COM MANIPULAÇÃO LTDA
CNPJ sob o nº 37.560.104/0001-60
_______________________________________
{{RAZAO_SOCIAL}}
CNPJ sob o nº {{CNPJ}}
Representante: {{NOME}} · CPF {{CPF}}
TESTEMUNHAS
(dispensadas em caso de assinatura eletrônica, nos termos do art. 784, § 4º, do CPC)
1. Nome: ______________________________ CPF: ____________________
2. Nome: ______________________________ CPF: ____________________$c$, 'migration:vermefree_contracts', now()
FROM "Brand" b WHERE b."slug" = 'vermefree';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'DISTRATO', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'DISTRATO'), 0) + 1,
  $t$Termo de distrato — VermeFree$t$, $c$TERMO DE DISTRATO DE CONTRATO DE PARCERIA DE DIVULGAÇÃO
PROGRAMA DE CREATORS VERMEFREE
Pelo presente instrumento particular, de um lado:
SINTONIA PHARMA FARMÁCIA COM MANIPULAÇÃO LTDA., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 37.560.104/0001-60, com sede na Rua 2870, nº 453, Sala 6, Centro, Balneário Camboriú/SC, detentora da marca VermeFree, neste ato representada na forma de seu contrato social, doravante denominada simplesmente “VERMEFREE”; e, de outro lado,
{{CONTRATADA}}, endereço eletrônico {{EMAIL}}, doravante denominado(a) simplesmente “CREATOR”;
sendo VERMEFREE e CREATOR denominadas, em conjunto, “Partes” e, isoladamente, “Parte”;
CONSIDERANDO QUE:
(i) as Partes celebraram, em {{INICIO}}, Contrato de Parceria de Divulgação no âmbito do Programa de Creators VermeFree, por meio do qual a CREATOR se obrigou a divulgar produtos da VERMEFREE em suas redes sociais, mediante comissão sobre as vendas realizadas com cupom exclusivo e demais contrapartidas nele previstas, instrumento que, juntamente com seus eventuais aditivos, é doravante denominado “Contrato”;
(ii) as Partes não têm interesse na continuidade da parceria e desejam encerrá-la de forma consensual, ordenada e definitiva, regulando de modo exaustivo os efeitos do encerramento;
(iii) nos termos do art. 472 do Código Civil, o distrato faz-se pela mesma forma exigida para o contrato;
RESOLVEM as Partes, de comum acordo e na melhor forma de direito, celebrar o presente Termo de Distrato (“Termo”), que se regerá pelas cláusulas e condições a seguir.
CLÁUSULA PRIMEIRA. DO OBJETO E DOS EFEITOS DO DISTRATO
1.1. Constitui objeto deste Termo o distrato do Contrato, que se considera extinto, por mútuo consenso, a partir de {{ENCERRAMENTO}} (“Data de Encerramento”).
1.2. O encerramento decorre da livre e recíproca manifestação de vontade das Partes, que dispensam mutuamente o cumprimento de aviso prévio e renunciam a qualquer multa, indenização ou compensação em razão da extinção do Contrato, ressalvadas exclusivamente as obrigações expressamente previstas neste Termo.
1.3. A partir da Data de Encerramento, cessam as obrigações de execução continuada previstas no Contrato, tais como a publicação periódica de conteúdos, o cumprimento de metas de vendas e a entrega de novos conteúdos, ressalvadas as obrigações que, por sua natureza ou por disposição expressa deste Termo, devam subsistir.
CLÁUSULA SEGUNDA. DO CUPOM E DO ACESSO AO CREATOR CLUB
2.1. Na Data de Encerramento, o acesso da CREATOR ao Creator Club será mantido pelo período necessário à conferência da apuração final, ao envio da nota fiscal, quando exigível, e ao recebimento do saldo previsto na Cláusula Terceira. Concluído o pagamento, o acesso poderá ser desativado independentemente de aviso.
2.2. A partir da Data de Encerramento, a CREATOR deverá abster-se de divulgar o cupom desativado, links promocionais ou quaisquer materiais que induzam o público a acreditar na continuidade da parceria.
CLÁUSULA TERCEIRA. DAS COMISSÕES E DO ACERTO FINAL
3.1. São devidas à CREATOR as comissões de 10% (dez por cento), conforme o Contrato, sobre as vendas efetivamente pagas com o seu cupom até a Data de Encerramento, apuradas no Creator Club.
3.2. Da base de cálculo serão deduzidos os valores de pedidos cancelados, devolvidos, trocados, estornados ou objeto de contestação de pagamento, inclusive quando o cancelamento ou a devolução ocorrer após a Data de Encerramento, no exercício do direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor. 
3.3. A apuração final ficará disponível no Creator Club até o dia 5 (cinco) do mês subsequente à Data de Encerramento. A CREATOR poderá impugná-la, de forma fundamentada e por escrito, no prazo de 5 (cinco) dias úteis contados da disponibilização. Decorrido o prazo sem impugnação, a apuração será considerada aceita.
3.4. O saldo final será pago em parcela única, da seguinte forma:
a) sendo a CREATOR pessoa jurídica, mediante emissão e envio da respectiva nota fiscal pelo Creator Club na janela compreendida entre os dias 5 (cinco) e 15 (quinze) do mês subsequente à Data de Encerramento, com pagamento entre os dias 20 (vinte) e 25 (vinte e cinco) do mesmo mês. O envio da nota fiscal após a janela transfere o pagamento para o ciclo seguinte, sem incidência de qualquer encargo moratório;
b) sendo a CREATOR pessoa física, por depósito ou Pix em conta de sua titularidade, vinculada ao seu CPF, entre os dias 20 (vinte) e 25 (vinte e cinco) do mês subsequente à Data de Encerramento.
3.5. O saldo final será pago integralmente, qualquer que seja o seu valor, não se aplicando a este acerto o valor mínimo para saque eventualmente previsto nas regras do Programa.
3.6. Cada Parte é responsável pelos tributos que, por lei, lhe incumbam. A VERMEFREE efetuará as retenções e os recolhimentos legalmente exigíveis sobre os valores pagos, cabendo à CREATOR a responsabilidade pelos tributos incidentes sobre os seus rendimentos.
CLÁUSULA QUARTA. DOS PRODUTOS E DAS BONIFICAÇÕES
4.1. Os produtos já enviados à CREATOR, inclusive os recebidos como bonificação pelo atingimento de metas de vendas, permanecem de sua propriedade, não sendo devida qualquer devolução ou indenização, ressalvado o disposto no item 4.3.
4.2. Ficam cancelados os pedidos de produtos ainda não enviados e as bonificações não resgatadas até a Data de Encerramento, as quais não serão convertidas em dinheiro nem em qualquer outra vantagem.
4.3. Caso a CREATOR, na modalidade de parceria que previa a entrega de conteúdos audiovisuais em contrapartida aos produtos recebidos, não tenha entregue a totalidade desses conteúdos até a Data de Encerramento, permanecem ressalvados os direitos da VERMEFREE previstos no Contrato quanto aos produtos recebidos para essa finalidade, os quais não são alcançados pela quitação da Cláusula Sétima.
CLÁUSULA QUINTA. DO USO DE IMAGEM, VOZ, NOME E CONTEÚDOS
5.1. A CREATOR ratifica e, para todos os efeitos, renova a autorização concedida no Contrato para que a VERMEFREE utilize, a título gratuito, a sua imagem, voz, nome, perfil e os conteúdos por ela produzidos durante a parceria, inclusive os vídeos entregues, pelo prazo de 12 (doze) meses contados da Data de Encerramento, em todo o território nacional, nos canais próprios da VERMEFREE, tais como sítio eletrônico, loja virtual, redes sociais e comunicações por correio eletrônico, bem como em anúncios pagos e impulsionamentos, nos termos do art. 20 do Código Civil e da Lei nº 9.610/1998.
5.2. Encerrado o prazo do item 5.1, a VERMEFREE não realizará novas veiculações nem novos impulsionamentos, ficando, contudo, dispensada de remover as publicações orgânicas anteriores, que permanecerão em seus canais como acervo histórico.
5.3. A CREATOR não está obrigada a remover as publicações já realizadas em seus perfis, mas, a partir da Data de Encerramento, não poderá:
a) divulgar o cupom desativado ou links promocionais vinculados à parceria;
b) apresentar-se como parceira, embaixadora, creator ou representante da VERMEFREE;
c) utilizar as marcas, logotipos, embalagens ou demais sinais distintivos da VERMEFREE em novos conteúdos de forma a sugerir a existência de vínculo comercial.
5.4. A CREATOR deverá manter, nas publicações que permanecerem em seus perfis, a identificação de natureza publicitária exigida pelas normas de autorregulamentação publicitária e pela legislação de defesa do consumidor.
5.5. A CREATOR permanece integralmente responsável pelo teor dos conteúdos que produziu e publicou, inclusive quanto à veracidade das informações e à observância das normas sanitárias e publicitárias aplicáveis à divulgação de produtos naturais, respondendo perante terceiros, consumidores e autoridades, e assegurando à VERMEFREE o direito de regresso.
CLÁUSULA SEXTA. DA CONFIDENCIALIDADE E DA CONDUTA
6.1. As Partes manterão sigilo, pelo prazo de 5 (cinco) anos contados da Data de Encerramento, sobre as condições comerciais da parceria, os percentuais de comissão, os dados de vendas, as estratégias de marketing, as informações não públicas a que tiveram acesso e o próprio teor deste Termo.
6.2. Não constitui violação do dever de sigilo a revelação de informações exigida por lei, por ordem judicial ou por determinação de autoridade competente, limitada ao estritamente necessário, nem a revelação a assessores jurídicos e contábeis sujeitos a dever de confidencialidade.
6.3. As Partes comprometem-se a não fazer, por qualquer meio, declarações públicas depreciativas uma sobre a outra, seus produtos, sócios, administradores ou colaboradores, em razão da parceria ou de seu encerramento.
CLÁUSULA SÉTIMA. DA QUITAÇÃO
7.1. Com o pagamento do saldo final previsto na Cláusula Terceira, a CREATOR outorga à VERMEFREE a mais plena, geral, irrevogável e irretratável quitação de todos os valores e obrigações decorrentes do Contrato e da parceria, inclusive comissões, bonificações, produtos, remuneração por conteúdos e uso de imagem no prazo do item 5.1, para nada mais reclamar, a qualquer título, em juízo ou fora dele. O comprovante de pagamento ou de crédito valerá como recibo.
7.2. A VERMEFREE, por sua vez, outorga à CREATOR quitação quanto às obrigações de execução continuada previstas no Contrato, ficando expressamente excluídas dessa quitação:
a) a responsabilidade da CREATOR perante terceiros, consumidores e autoridades pelos conteúdos que produziu e publicou;
b) eventuais violações de direitos de propriedade intelectual, de imagem ou da personalidade de terceiros;
c) as obrigações de confidencialidade e de conduta previstas neste Termo e no Contrato;
d) as obrigações tributárias próprias da CREATOR;
e) os direitos ressalvados no item 4.3; e
f) as demais obrigações que, por sua natureza, tenham caráter perene ou cujo prazo prescricional ainda não tenha decorrido.
CLÁUSULA OITAVA. DA NATUREZA DA RELAÇÃO
8.1. As Partes reconhecem que a relação mantida durante a vigência do Contrato teve natureza exclusivamente civil e comercial, desenvolvida pela CREATOR com plena autonomia, sem subordinação, sem controle de jornada e sem exclusividade, inexistindo entre elas vínculo empregatício, societário, de representação comercial ou de consumo.
8.2. A CREATOR declara que não possui qualquer crédito de natureza trabalhista, previdenciária ou indenizatória em face da VERMEFREE em razão da parceria.
CLÁUSULA NONA. DA PROTEÇÃO DE DADOS PESSOAIS
9.1. A VERMEFREE conservará os dados pessoais da CREATOR somente pelo tempo necessário ao cumprimento de obrigações legais, regulatórias e fiscais, à execução deste Termo e ao exercício regular de direitos em processo judicial, administrativo ou arbitral, nos termos dos arts. 7º, II e VI, e 16 da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais).
9.2. A CREATOR deverá eliminar, no prazo de 15 (quinze) dias contados da Data de Encerramento, os dados pessoais de clientes, consumidores ou colaboradores da VERMEFREE a que eventualmente tenha tido acesso em razão da parceria, sendo-lhe vedada qualquer utilização posterior desses dados.
CLÁUSULA DÉCIMA. DAS DISPOSIÇÕES GERAIS
10.1. Sobrevivem ao encerramento do Contrato, pelos prazos neles previstos, as cláusulas relativas ao uso de imagem e de conteúdos, à propriedade intelectual, à confidencialidade, à conduta, à responsabilidade pelos conteúdos publicados e à proteção de dados pessoais.
10.2. Em caso de divergência entre o disposto neste Termo e o Contrato, prevalecerá o presente Termo.
10.3. Este Termo é celebrado em caráter irrevogável e irretratável e obriga as Partes e seus sucessores a qualquer título.
10.4. A tolerância de qualquer das Partes quanto ao descumprimento de obrigação prevista neste Termo não importará novação, renúncia ou alteração do que foi pactuado.
10.5. A eventual declaração de nulidade ou de ineficácia de qualquer disposição deste Termo não prejudicará a validade e a eficácia das demais.
10.6. As comunicações entre as Partes relativas a este Termo serão realizadas por escrito, preferencialmente pelos endereços eletrônicos indicados na qualificação.
10.7. As Partes reconhecem como válida e eficaz a assinatura deste Termo por meio eletrônico, inclusive pela plataforma Autentique, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, considerando-se celebrado na data da última assinatura.
CLÁUSULA DÉCIMA PRIMEIRA. DO FORO
11.1. Fica eleito o foro da Comarca de Balneário Camboriú/SC para dirimir quaisquer controvérsias oriundas deste Termo, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
E, por estarem assim justas e acordadas, as Partes firmam o presente Termo, juntamente com as 2 (duas) testemunhas abaixo identificadas.
Balneário Camboriú/SC, {{DATA}}.
_______________________________________________
SINTONIA PHARMA FARMÁCIA COM MANIPULAÇÃO LTDA.
CNPJ nº 37.560.104/0001-60
Representante legal:
_______________________________________________
{{NOME}}
CPF nº {{CPF}}
TESTEMUNHAS:
___________________________________
Nome:
CPF:
___________________________________
Nome:
CPF:$c$, 'migration:vermefree_contracts', now()
FROM "Brand" b WHERE b."slug" = 'vermefree';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'DISTRATO', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'DISTRATO'), 0) + 1,
  $t$Termo de distrato — Botanika$t$, $c$TERMO DE DISTRATO DE CONTRATO DE PARCERIA DE DIVULGAÇÃO
PROGRAMA DE CREATORS BOTANIKA
Pelo presente instrumento particular, de um lado:
BOTANIKA SAUDE NATURAL LTDA., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 65.100.830/0001-36, com sede na Rua Ministro Orozimbo Nonato, nº 215, Loja 37, Pavimento 5, Vila da Serra, Belo Horizonte/MG, CEP 34.006-053, neste ato representada na forma de seu contrato social, doravante denominada simplesmente “BOTANIKA”; e, de outro lado,
{{CONTRATADA}}, endereço eletrônico {{EMAIL}}, doravante denominado(a) simplesmente “CREATOR”;
sendo BOTANIKA e CREATOR denominadas, em conjunto, “Partes” e, isoladamente, “Parte”;
CONSIDERANDO QUE:
(i) as Partes celebraram, em {{INICIO}}, Contrato de Parceria de Divulgação no âmbito do Programa de Creators Botanika, por meio do qual a CREATOR se obrigou a divulgar produtos da BOTANIKA em suas redes sociais, mediante comissão sobre as vendas realizadas com cupom exclusivo e demais contrapartidas nele previstas, instrumento que, juntamente com seus eventuais aditivos, é doravante denominado “Contrato”;
(ii) as Partes não têm interesse na continuidade da parceria e desejam encerrá-la de forma consensual, ordenada e definitiva, regulando de modo exaustivo os efeitos do encerramento;
(iii) nos termos do art. 472 do Código Civil, o distrato faz-se pela mesma forma exigida para o contrato;
RESOLVEM as Partes, de comum acordo e na melhor forma de direito, celebrar o presente Termo de Distrato (“Termo”), que se regerá pelas cláusulas e condições a seguir.
CLÁUSULA PRIMEIRA. DO OBJETO E DOS EFEITOS DO DISTRATO
1.1. Constitui objeto deste Termo o distrato do Contrato, que se considera extinto, por mútuo consenso, a partir de {{ENCERRAMENTO}} (“Data de Encerramento”).
1.2. O encerramento decorre da livre e recíproca manifestação de vontade das Partes, que dispensam mutuamente o cumprimento de aviso prévio e renunciam a qualquer multa, indenização ou compensação em razão da extinção do Contrato, ressalvadas exclusivamente as obrigações expressamente previstas neste Termo.
1.3. A partir da Data de Encerramento, cessam as obrigações de execução continuada previstas no Contrato, tais como a publicação periódica de conteúdos, o cumprimento de metas de vendas e a entrega de novos conteúdos, ressalvadas as obrigações que, por sua natureza ou por disposição expressa deste Termo, devam subsistir.
CLÁUSULA SEGUNDA. DO CUPOM E DO ACESSO AO CREATOR CLUB
2.1. Na Data de Encerramento, o acesso da CREATOR ao Creator Club será mantido pelo período necessário à conferência da apuração final, ao envio da nota fiscal, quando exigível, e ao recebimento do saldo previsto na Cláusula Terceira. Concluído o pagamento, o acesso poderá ser desativado independentemente de aviso.
2.2. A partir da Data de Encerramento, a CREATOR deverá abster-se de divulgar o cupom desativado, links promocionais ou quaisquer materiais que induzam o público a acreditar na continuidade da parceria.
CLÁUSULA TERCEIRA. DAS COMISSÕES E DO ACERTO FINAL
3.1. São devidas à CREATOR as comissões de 15% (quinze por cento), conforme o Contrato, sobre as vendas efetivamente pagas com o seu cupom até a Data de Encerramento, apuradas no Creator Club.
3.2. Da base de cálculo serão deduzidos os valores de pedidos cancelados, devolvidos, trocados, estornados ou objeto de contestação de pagamento, inclusive quando o cancelamento ou a devolução ocorrer após a Data de Encerramento, no exercício do direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor. 
3.3. A apuração final ficará disponível no Creator Club até o dia 5 (cinco) do mês subsequente à Data de Encerramento. A CREATOR poderá impugná-la, de forma fundamentada e por escrito, no prazo de 5 (cinco) dias úteis contados da disponibilização. Decorrido o prazo sem impugnação, a apuração será considerada aceita.
3.4. O saldo final será pago em parcela única, da seguinte forma:
a) sendo a CREATOR pessoa jurídica, mediante emissão e envio da respectiva nota fiscal pelo Creator Club na janela compreendida entre os dias 5 (cinco) e 15 (quinze) do mês subsequente à Data de Encerramento, com pagamento entre os dias 20 (vinte) e 25 (vinte e cinco) do mesmo mês. O envio da nota fiscal após a janela transfere o pagamento para o ciclo seguinte, sem incidência de qualquer encargo moratório;
b) sendo a CREATOR pessoa física, por crédito no cartão Alelo vinculado à parceria, entre os dias 20 (vinte) e 25 (vinte e cinco) do mês subsequente à Data de Encerramento.
3.5. O saldo final será pago integralmente, qualquer que seja o seu valor, não se aplicando a este acerto o valor mínimo para saque eventualmente previsto nas regras do Programa.
3.6. Após o crédito final, não serão realizados novos créditos no cartão Alelo. O saldo nele existente poderá ser utilizado pela CREATOR nos termos e prazos do regulamento da empresa emissora, pelos quais a BOTANIKA não responde.
3.7. Cada Parte é responsável pelos tributos que, por lei, lhe incumbam. A BOTANIKA efetuará as retenções e os recolhimentos legalmente exigíveis sobre os valores pagos, cabendo à CREATOR a responsabilidade pelos tributos incidentes sobre os seus rendimentos.
CLÁUSULA QUARTA. DOS PRODUTOS E DAS BONIFICAÇÕES
4.1. Os produtos já enviados à CREATOR, inclusive os recebidos como bonificação pelo atingimento de metas de vendas, permanecem de sua propriedade, não sendo devida qualquer devolução ou indenização, ressalvado o disposto no item 4.3.
4.2. Ficam cancelados os pedidos de produtos ainda não enviados e as bonificações não resgatadas até a Data de Encerramento, as quais não serão convertidas em dinheiro nem em qualquer outra vantagem.
4.3. Caso a CREATOR, na modalidade de parceria que previa a entrega de conteúdos audiovisuais em contrapartida aos produtos recebidos, não tenha entregue a totalidade desses conteúdos até a Data de Encerramento, permanecem ressalvados os direitos da BOTANIKA previstos no Contrato quanto aos produtos recebidos para essa finalidade, os quais não são alcançados pela quitação da Cláusula Sétima.
CLÁUSULA QUINTA. DO USO DE IMAGEM, VOZ, NOME E CONTEÚDOS
5.1. A CREATOR ratifica e, para todos os efeitos, renova a autorização concedida no Contrato para que a BOTANIKA utilize, a título gratuito, a sua imagem, voz, nome, perfil e os conteúdos por ela produzidos durante a parceria, inclusive os vídeos entregues, pelo prazo de 12 (doze) meses contados da Data de Encerramento, em todo o território nacional, nos canais próprios da BOTANIKA, tais como sítio eletrônico, loja virtual, redes sociais e comunicações por correio eletrônico, bem como em anúncios pagos e impulsionamentos, nos termos do art. 20 do Código Civil e da Lei nº 9.610/1998.
5.2. Encerrado o prazo do item 5.1, a BOTANIKA não realizará novas veiculações nem novos impulsionamentos, ficando, contudo, dispensada de remover as publicações orgânicas anteriores, que permanecerão em seus canais como acervo histórico.
5.3. A CREATOR não está obrigada a remover as publicações já realizadas em seus perfis, mas, a partir da Data de Encerramento, não poderá:
a) divulgar o cupom desativado ou links promocionais vinculados à parceria;
b) apresentar-se como parceira, embaixadora, creator ou representante da BOTANIKA;
c) utilizar as marcas, logotipos, embalagens ou demais sinais distintivos da BOTANIKA em novos conteúdos de forma a sugerir a existência de vínculo comercial.
5.5. A CREATOR deverá manter, nas publicações que permanecerem em seus perfis, a identificação de natureza publicitária exigida pelas normas de autorregulamentação publicitária e pela legislação de defesa do consumidor.
5.6. A CREATOR permanece integralmente responsável pelo teor dos conteúdos que produziu e publicou, inclusive quanto à veracidade das informações e à observância das normas sanitárias e publicitárias aplicáveis à divulgação de produtos naturais, respondendo perante terceiros, consumidores e autoridades, e assegurando à BOTANIKA o direito de regresso.
CLÁUSULA SEXTA. DA CONFIDENCIALIDADE E DA CONDUTA
6.1. As Partes manterão sigilo, pelo prazo de 5 (cinco) anos contados da Data de Encerramento, sobre as condições comerciais da parceria, os percentuais de comissão, os dados de vendas, as estratégias de marketing, as informações não públicas a que tiveram acesso e o próprio teor deste Termo.
6.2. Não constitui violação do dever de sigilo a revelação de informações exigida por lei, por ordem judicial ou por determinação de autoridade competente, limitada ao estritamente necessário, nem a revelação a assessores jurídicos e contábeis sujeitos a dever de confidencialidade.
6.3. As Partes comprometem-se a não fazer, por qualquer meio, declarações públicas depreciativas uma sobre a outra, seus produtos, sócios, administradores ou colaboradores, em razão da parceria ou de seu encerramento.
CLÁUSULA SÉTIMA. DA QUITAÇÃO
7.1. Com o pagamento do saldo final previsto na Cláusula Terceira, a CREATOR outorga à BOTANIKA a mais plena, geral, irrevogável e irretratável quitação de todos os valores e obrigações decorrentes do Contrato e da parceria, inclusive comissões, bonificações, produtos, remuneração por conteúdos e uso de imagem no prazo do item 5.1, para nada mais reclamar, a qualquer título, em juízo ou fora dele. O comprovante de pagamento ou de crédito valerá como recibo.
7.2. A BOTANIKA, por sua vez, outorga à CREATOR quitação quanto às obrigações de execução continuada previstas no Contrato, ficando expressamente excluídas dessa quitação:
a) a responsabilidade da CREATOR perante terceiros, consumidores e autoridades pelos conteúdos que produziu e publicou;
b) eventuais violações de direitos de propriedade intelectual, de imagem ou da personalidade de terceiros;
c) as obrigações de confidencialidade e de conduta previstas neste Termo e no Contrato;
d) as obrigações tributárias próprias da CREATOR;
e) os direitos ressalvados no item 4.3; e
f) as demais obrigações que, por sua natureza, tenham caráter perene ou cujo prazo prescricional ainda não tenha decorrido.
CLÁUSULA OITAVA. DA NATUREZA DA RELAÇÃO
8.1. As Partes reconhecem que a relação mantida durante a vigência do Contrato teve natureza exclusivamente civil e comercial, desenvolvida pela CREATOR com plena autonomia, sem subordinação, sem controle de jornada e sem exclusividade, inexistindo entre elas vínculo empregatício, societário, de representação comercial ou de consumo.
8.2. A CREATOR declara que não possui qualquer crédito de natureza trabalhista, previdenciária ou indenizatória em face da BOTANIKA em razão da parceria.
CLÁUSULA NONA. DA PROTEÇÃO DE DADOS PESSOAIS
9.1. A BOTANIKA conservará os dados pessoais da CREATOR somente pelo tempo necessário ao cumprimento de obrigações legais, regulatórias e fiscais, à execução deste Termo e ao exercício regular de direitos em processo judicial, administrativo ou arbitral, nos termos dos arts. 7º, II e VI, e 16 da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais).
9.2. A CREATOR deverá eliminar, no prazo de 15 (quinze) dias contados da Data de Encerramento, os dados pessoais de clientes, consumidores ou colaboradores da BOTANIKA a que eventualmente tenha tido acesso em razão da parceria, sendo-lhe vedada qualquer utilização posterior desses dados.
CLÁUSULA DÉCIMA. DAS DISPOSIÇÕES GERAIS
10.1. Sobrevivem ao encerramento do Contrato, pelos prazos neles previstos, as cláusulas relativas ao uso de imagem e de conteúdos, à propriedade intelectual, à confidencialidade, à conduta, à responsabilidade pelos conteúdos publicados e à proteção de dados pessoais.
10.2. Em caso de divergência entre o disposto neste Termo e o Contrato, prevalecerá o presente Termo.
10.3. Este Termo é celebrado em caráter irrevogável e irretratável e obriga as Partes e seus sucessores a qualquer título.
10.4. A tolerância de qualquer das Partes quanto ao descumprimento de obrigação prevista neste Termo não importará novação, renúncia ou alteração do que foi pactuado.
10.5. A eventual declaração de nulidade ou de ineficácia de qualquer disposição deste Termo não prejudicará a validade e a eficácia das demais.
10.6. As comunicações entre as Partes relativas a este Termo serão realizadas por escrito, preferencialmente pelos endereços eletrônicos indicados na qualificação.
10.7. As Partes reconhecem como válida e eficaz a assinatura deste Termo por meio eletrônico, inclusive pela plataforma Autentique, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, considerando-se celebrado na data da última assinatura.
CLÁUSULA DÉCIMA PRIMEIRA. DO FORO
11.1. Fica eleito o foro da Comarca de Belo Horizonte/MG para dirimir quaisquer controvérsias oriundas deste Termo, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
E, por estarem assim justas e acordadas, as Partes firmam o presente Termo, juntamente com as 2 (duas) testemunhas abaixo identificadas.
Belo Horizonte/MG, {{DATA}}.
_______________________________________________
BOTANIKA SAUDE NATURAL LTDA.
CNPJ nº 65.100.830/0001-36
Representante legal:
_______________________________________________
{{NOME}}
CPF nº {{CPF}}
TESTEMUNHAS:
___________________________________
Nome:
CPF:
___________________________________
Nome:
CPF:$c$, 'migration:vermefree_contracts', now()
FROM "Brand" b WHERE b."slug" = 'botanika';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), d."brandId", 'SYSTEM', 'migration:vermefree_contracts', 'contract.published', 'ContractDocument', d."id", jsonb_build_object('kind', d."kind", 'version', d."version"), now()
FROM "ContractDocument" d WHERE d."createdById" = 'migration:vermefree_contracts';
