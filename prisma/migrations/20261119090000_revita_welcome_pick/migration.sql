-- D-WELCOMEPICK (Revita, 2026-11-05): no envio de 1 produto, a creator escolhe entre o Sérum Pepti Code e o Gel Creme
-- Nano Retinal. "1 produto" da marca passa a aceitar até 2 opções; os contratos de 1 produto (CPF e CNPJ) ganham versão
-- nova com o texto enviado pela Revita; quem ainda não pediu o 1º produto passa a escolher entre os dois.

ALTER TABLE "Brand" DROP CONSTRAINT "Brand_welcome_sizes";
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_welcome_sizes" CHECK (cardinality("welcomeOneIds") <= 2 AND cardinality("welcomeTwoIds") <= 2);

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'INFLUENCER_PF_1', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'INFLUENCER_PF_1'), 0) + 1,
  $t$Contrato de parceria Influencer Revita — CPF — 1 produto (Sérum ou Gel Creme)$t$, $c$CONTRATO DE PARCERIA DIGITAL INFLUENCER
Pelo presente instrumento particular de contrato, entre as partes abaixo qualificadas:
CONTRATANTE: SINTONIA PHARMA FARMACIA COM MANIPULAÇAO LTDA inscrita no CNPJ sob nº 37.560.104/0001-60, com sede em Rua 2870, 453 – Sala 6 – Centro – Balneário Camboriú - Santa Catarina, na qualidade de sócia ostensiva da Sociedade em Conta de Participação constituída para o Projeto Revita Derma.
CONTRATADA: {{NOME}}, inscrita no CPF sob nº {{CPF}}, residente em {{ENDERECO}}.
CLÁUSULA 1ª – DO OBJETO
A CONTRATADA prestará serviços de Influencer Digital e cederá seus direitos de imagem para campanhas da CONTRATANTE.
1.1 Informações da Campanha
Direito de Uso de Imagem: SIM
Canais: Redes Sociais e Collabs.
Produto da parceria: 01 (um) produto da linha Revita, à escolha da CONTRATADA: Sérum Pepti Code ou Gel em Creme Nano Retinal.
1.2 Das Entregas
Durante a vigência deste contrato, a CONTRATADA se obriga a realizar as seguintes publicações:
02 (dois) stories por semana;
01 (um) reels por mês.
As publicações deverão utilizar o cupom/link fornecido pela CONTRATANTE e conter a marcação do perfil oficial da CONTRATANTE.
Os conteúdos de collabs devem ser previamente aprovados pela CONTRATANTE antes da publicação.
Parágrafo único – O não cumprimento das entregas previstas nesta cláusula autoriza a CONTRATANTE a suspender o envio de novos produtos e a rescindir o contrato, nos termos da Cláusula 7ª. A cobrança do valor do produto aplica-se exclusivamente à hipótese prevista no item 2.7 (primeiro envio, sem nenhuma publicação no primeiro mês).
1.3 Das Regras de Conteúdo
1.3.1 Todas as publicações deverão identificar claramente sua natureza publicitária (por exemplo, #publi, “parceria paga” ou recurso equivalente da plataforma), conforme as normas do CONAR.
1.3.2 A CONTRATADA não poderá fazer promessas de resultado nem recomendações terapêuticas ou médicas, nem atribuir aos produtos composição, benefício, eficácia ou modo de uso que não constem do material informativo fornecido ou aprovado pela CONTRATANTE. Comparações de “antes e depois” dependem de aprovação prévia da CONTRATANTE.
1.3.3 A CONTRATANTE poderá solicitar a correção ou a remoção de conteúdo publicado em desacordo com esta cláusula, devendo a solicitação ser atendida em até 24 (vinte e quatro) horas.
1.3.4 A CONTRATADA responde pelas alegações e manifestações feitas em desacordo com esta cláusula ou com o material aprovado.
CLÁUSULA 2ª – DA PARCERIA E PAGAMENTO
2.1 No primeiro envio, a CONTRATANTE enviará à CONTRATADA 01 (um) produto inicial (Sérum Pepti Code ou Gel em Creme Nano Retinal da Revita, conforme escolha da CONTRATADA), além de comissão de 10% (dez por cento) sobre as vendas geradas pelo link/cupom promocional. Após esse primeiro envio, a CONTRATADA receberá 01 (um) produto novo ao atingir R$ 1.000,00 (mil reais) em vendas no mês, ou 02 (dois) produtos novos ao atingir R$ 2.000,00 (dois mil reais) em vendas no mês.
2.2 Consideram-se vendas geradas apenas aquelas efetivamente faturadas e pagas pelo consumidor final.
2.3 A comissão será calculada exclusivamente sobre vendas líquidas, excluindo o valor de frete dos pedidos realizados com o cupom/link, cancelamentos, estornos, chargebacks, devoluções, pedidos fraudulentos e pedidos não faturados.
2.4 O valor mínimo para saque é de R$ 100,00 (cem reais). Comissões inferiores a esse valor no mês serão acumuladas para o mês seguinte.
2.4.1 A solicitação de saque deverá ser feita entre os dias 05 (cinco) e 15 (quinze) de cada mês.
2.4.2 O saque é obrigatório e corresponderá ao valor total da comissão do mês anterior, não sendo possível solicitar valores parciais. Não havendo solicitação no período do item 2.4.1, o valor permanecerá acumulado para o período de solicitação seguinte.
2.4.3 Os pagamentos serão realizados entre os dias 20 (vinte) e 25 (vinte e cinco) do mês da solicitação.
2.5 A CONTRATANTE disponibilizará relatório mensal contendo o valor das vendas realizadas por meio do cupom ou link exclusivo.
2.6 O recibo deverá ser emitido após a apuração das comissões. Os valores de comissão são brutos, sujeitos às retenções tributárias e previdenciárias exigidas pela legislação aplicável, que serão descontadas no pagamento.
2.7 O produto enviado nos termos do item 2.1 é fornecido como contrapartida das publicações previstas na Cláusula 1.2, para que a CONTRATADA o divulgue e gere vendas comissionadas. A CONTRATADA declara estar ciente de que, caso não realize nenhuma das publicações combinadas nos primeiros 30 (trinta) dias após o recebimento do primeiro envio, deverá pagar à CONTRATANTE o valor do(s) produto(s) desse primeiro envio, conforme o preço de venda vigente no site oficial da Revita na data do envio. Essa cobrança aplica-se somente ao primeiro envio, não se estendendo aos produtos enviados posteriormente.
2.8 O valor previsto no item 2.7 poderá ser descontado das comissões devidas à CONTRATADA ou, não havendo comissões suficientes, deverá ser pago em até 10 (dez) dias após a notificação da CONTRATANTE.
CLÁUSULA 3ª – DO PRAZO
3.1 O contrato terá duração por prazo indeterminado e será encerrado automaticamente, independentemente de aviso prévio, caso a CONTRATADA permaneça 2 (dois) meses consecutivos sem nenhuma venda por meio do cupom/link exclusivo. O encerramento por ausência de vendas não gera cobrança do produto, ressalvada a hipótese do item 2.7.
3.2 DIREITO DE IMAGEM
A CONTRATADA autoriza a utilização de sua imagem, nome, voz e conteúdo produzido para divulgação da marca em redes sociais, website, e-commerce, campanhas patrocinadas, anúncios digitais e materiais institucionais durante a vigência do contrato e por mais 12 (doze) meses após seu encerramento.
3.2.1 Encerrado o prazo acima, a CONTRATANTE não poderá promover novos impulsionamentos ou anúncios pagos com a imagem da CONTRATADA, mas poderá manter publicados, em seus canais próprios, os conteúdos já veiculados durante o período autorizado, sem remuneração adicional.
3.2.2 A CONTRATANTE poderá realizar adaptações técnicas nos conteúdos, como cortes, legendas, redimensionamento e ajuste de duração, desde que não alterem o sentido das manifestações da CONTRATADA.
3.2.3 A imagem e os conteúdos da CONTRATADA não poderão ser utilizados para divulgação de marcas ou produtos estranhos à marca Revita.
CLÁUSULA 4ª – OBRIGAÇÕES DA CONTRATANTE
Fornecer informações, materiais, imagens, produtos e orientações necessárias para execução da campanha.
CLÁUSULA 5ª – OBRIGAÇÕES DA CONTRATADA
5.1 Cumprir as entregas de conteúdo previstas na Cláusula 1.2, nos prazos e quantidades ali indicados.
5.2 Quando realizar postagens, utilizar o respectivo cupom/link.
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
2. Nome: ______________________________ CPF: ____________________$c$, 'migration:revita_welcome_pick', now()
FROM "Brand" b WHERE b."slug" = 'revita-derma';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'INFLUENCER_PJ_1', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'INFLUENCER_PJ_1'), 0) + 1,
  $t$Contrato de parceria Influencer Revita — CNPJ — 1 produto (Sérum ou Gel Creme)$t$, $c$CONTRATO DE PARCERIA DIGITAL INFLUENCER
Pelo presente instrumento particular de contrato, entre as partes abaixo qualificadas:
CONTRATANTE: SINTONIA PHARMA FARMACIA COM MANIPULAÇAO LTDA inscrita no CNPJ sob nº 37.560.104/0001-60, com sede em Rua 2870, 453 – Sala 6 – Centro – Balneário Camboriú - Santa Catarina, na qualidade de sócia ostensiva da Sociedade em Conta de Participação constituída para o Projeto Revita Derma.
CONTRATADA: {{RAZAO_SOCIAL}}, inscrita no CNPJ sob nº {{CNPJ}}, com sede em {{ENDERECO}}, neste ato representada por {{NOME}}, inscrito(a) no CPF sob nº {{CPF}}, que também firma o presente em nome próprio, na qualidade de INFLUENCIADORA e interveniente anuente, especialmente quanto à execução pessoal das entregas e à autorização de uso de sua imagem, nome e voz.
CLÁUSULA 1ª – DO OBJETO
A CONTRATADA prestará serviços de Influencer Digital e cederá seus direitos de imagem para campanhas da CONTRATANTE.
1.1 Informações da Campanha
Direito de Uso de Imagem: SIM
Canais: Redes Sociais e Collabs.
Produto da parceria: 01 (um) produto da linha Revita, à escolha da CONTRATADA: Sérum Pepti Code ou Gel em Creme Nano Retinal.
1.2 Das Entregas
Durante a vigência deste contrato, a CONTRATADA se obriga a realizar as seguintes publicações:
02 (dois) stories por semana;
01 (um) reels por mês.
As publicações deverão utilizar o cupom/link fornecido pela CONTRATANTE e conter a marcação do perfil oficial da CONTRATANTE.
Os conteúdos de collabs devem ser previamente aprovados pela CONTRATANTE antes da publicação.
Parágrafo único – O não cumprimento das entregas previstas nesta cláusula autoriza a CONTRATANTE a suspender o envio de novos produtos e a rescindir o contrato, nos termos da Cláusula 7ª. A cobrança do valor do produto aplica-se exclusivamente à hipótese prevista no item 2.7 (primeiro envio, sem nenhuma publicação no primeiro mês).
1.3 Das Regras de Conteúdo
1.3.1 Todas as publicações deverão identificar claramente sua natureza publicitária (por exemplo, #publi, “parceria paga” ou recurso equivalente da plataforma), conforme as normas do CONAR.
1.3.2 A INFLUENCIADORA não poderá fazer promessas de resultado nem recomendações terapêuticas ou médicas, nem atribuir aos produtos composição, benefício, eficácia ou modo de uso que não constem do material informativo fornecido ou aprovado pela CONTRATANTE. Comparações de “antes e depois” dependem de aprovação prévia da CONTRATANTE.
1.3.3 A CONTRATANTE poderá solicitar a correção ou a remoção de conteúdo publicado em desacordo com esta cláusula, devendo a solicitação ser atendida em até 24 (vinte e quatro) horas.
1.3.4 A CONTRATADA responde pelas alegações e manifestações feitas em desacordo com esta cláusula ou com o material aprovado.
CLÁUSULA 2ª – DA PARCERIA E PAGAMENTO
2.1 No primeiro envio, a CONTRATANTE enviará à CONTRATADA 01 (um) produto inicial (Sérum Pepti Code ou Gel em Creme Nano Retinal da Revita, conforme escolha da CONTRATADA), além de comissão de 10% (dez por cento) sobre as vendas geradas pelo link/cupom promocional. Após esse primeiro envio, a CONTRATADA receberá 01 (um) produto novo ao atingir R$ 1.000,00 (mil reais) em vendas no mês, ou 02 (dois) produtos novos ao atingir R$ 2.000,00 (dois mil reais) em vendas no mês.
2.2 Consideram-se vendas geradas apenas aquelas efetivamente faturadas e pagas pelo consumidor final.
2.3 A comissão será calculada exclusivamente sobre vendas líquidas, excluindo o valor de frete dos pedidos realizados com o cupom/link, cancelamentos, estornos, chargebacks, devoluções, pedidos fraudulentos e pedidos não faturados.
2.4 O valor mínimo para saque é de R$ 100,00 (cem reais). Comissões inferiores a esse valor no mês serão acumuladas para o mês seguinte.
2.4.1 A solicitação de saque deverá ser feita entre os dias 05 (cinco) e 15 (quinze) de cada mês.
2.4.2 O saque é obrigatório e corresponderá ao valor total da comissão do mês anterior, não sendo possível solicitar valores parciais. Não havendo solicitação no período do item 2.4.1, o valor permanecerá acumulado para o período de solicitação seguinte.
2.4.3 Os pagamentos serão realizados entre os dias 20 (vinte) e 25 (vinte e cinco) do mês da solicitação.
2.5 A CONTRATANTE disponibilizará relatório mensal contendo o valor das vendas realizadas por meio do cupom ou link exclusivo.
2.6 Após a apuração das comissões, a CONTRATADA deverá emitir nota fiscal de prestação de serviços no valor correspondente, condição para o pagamento. Os valores são brutos, sujeitos às retenções tributárias eventualmente exigidas pela legislação aplicável.
2.7 O produto enviado nos termos do item 2.1 é fornecido como contrapartida das publicações previstas na Cláusula 1.2, para que a CONTRATADA o divulgue e gere vendas comissionadas. A CONTRATADA declara estar ciente de que, caso não realize nenhuma das publicações combinadas nos primeiros 30 (trinta) dias após o recebimento do primeiro envio, deverá pagar à CONTRATANTE o valor do(s) produto(s) desse primeiro envio, conforme o preço de venda vigente no site oficial da Revita na data do envio. Essa cobrança aplica-se somente ao primeiro envio, não se estendendo aos produtos enviados posteriormente.
2.8 O valor previsto no item 2.7 poderá ser descontado das comissões devidas à CONTRATADA ou, não havendo comissões suficientes, deverá ser pago em até 10 (dez) dias após a notificação da CONTRATANTE.
CLÁUSULA 3ª – DO PRAZO
3.1 O contrato terá duração por prazo indeterminado e será encerrado automaticamente, independentemente de aviso prévio, caso a CONTRATADA permaneça 2 (dois) meses consecutivos sem nenhuma venda por meio do cupom/link exclusivo. O encerramento por ausência de vendas não gera cobrança do produto, ressalvada a hipótese do item 2.7.
3.2 DIREITO DE IMAGEM
A CONTRATADA autoriza a utilização de sua imagem, nome, voz e conteúdo produzido para divulgação da marca em redes sociais, website, e-commerce, campanhas patrocinadas, anúncios digitais e materiais institucionais durante a vigência do contrato e por mais 12 (doze) meses após seu encerramento.
3.2.1 Encerrado o prazo acima, a CONTRATANTE não poderá promover novos impulsionamentos ou anúncios pagos com a imagem da INFLUENCIADORA, mas poderá manter publicados, em seus canais próprios, os conteúdos já veiculados durante o período autorizado, sem remuneração adicional.
3.2.2 A CONTRATANTE poderá realizar adaptações técnicas nos conteúdos, como cortes, legendas, redimensionamento e ajuste de duração, desde que não alterem o sentido das manifestações da INFLUENCIADORA.
3.2.3 A imagem e os conteúdos da INFLUENCIADORA não poderão ser utilizados para divulgação de marcas ou produtos estranhos à marca Revita.
3.2.4 Por se tratar de direito personalíssimo, a autorização de uso de imagem, nome e voz prevista nesta cláusula é concedida também pela INFLUENCIADORA, em nome próprio, que assina o presente na qualidade de interveniente anuente.
CLÁUSULA 4ª – OBRIGAÇÕES DA CONTRATANTE
Fornecer informações, materiais, imagens, produtos e orientações necessárias para execução da campanha.
CLÁUSULA 5ª – OBRIGAÇÕES DA CONTRATADA
5.1 Cumprir as entregas de conteúdo previstas na Cláusula 1.2, nos prazos e quantidades ali indicados.
5.2 Quando realizar postagens, utilizar o respectivo cupom/link.
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
Representada por {{NOME}}
_______________________________________
{{NOME}}
CPF sob o nº {{CPF}}
INFLUENCIADORA – Interveniente anuente
TESTEMUNHAS
(dispensadas em caso de assinatura eletrônica, nos termos do art. 784, § 4º, do CPC)
1. Nome: ______________________________ CPF: ____________________
2. Nome: ______________________________ CPF: ____________________$c$, 'migration:revita_welcome_pick', now()
FROM "Brand" b WHERE b."slug" = 'revita-derma';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), d."brandId", 'SYSTEM', 'migration:revita_welcome_pick', 'contract.published', 'ContractDocument', d."id", jsonb_build_object('kind', d."kind", 'version', d."version"), now()
FROM "ContractDocument" d WHERE d."createdById" = 'migration:revita_welcome_pick';

DO $$
DECLARE
  bid TEXT;
  serum TEXT[];
  gel TEXT[];
  opts TEXT[];
  n INT;
BEGIN
  SELECT "id" INTO bid FROM "Brand" WHERE "slug" = 'revita-derma';
  IF bid IS NULL THEN RETURN; END IF;
  SELECT array_agg("id") INTO serum FROM "Product" WHERE "brandId" = bid AND "active" AND "title" ILIKE 'sérum pepti code%' AND "title" NOT ILIKE 'kit%';
  SELECT array_agg("id") INTO gel FROM "Product" WHERE "brandId" = bid AND "active" AND "title" ILIKE 'gel creme%retinal%' AND "title" NOT ILIKE 'kit%';
  IF cardinality(serum) IS DISTINCT FROM 1 OR cardinality(gel) IS DISTINCT FROM 1 THEN RETURN; END IF;
  opts := serum || gel;
  UPDATE "Brand" SET "welcomeOneIds" = opts WHERE "id" = bid;
  UPDATE "KitGrant" SET "presetProductIds" = opts WHERE "brandId" = bid AND "kind" = 'WELCOME' AND "status" = 'PENDING' AND "products" = 1;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
  VALUES (gen_random_uuid(), bid, 'SYSTEM', 'migration:revita_welcome_pick', 'brand.welcome_products', 'Brand', bid, jsonb_build_object('one', opts, 'pendingKitsUpdated', n), now());
END $$;
