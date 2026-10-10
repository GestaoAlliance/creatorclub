
-- AlterTable
ALTER TABLE "ContractTemplate" ADD COLUMN     "documentKind" TEXT NOT NULL DEFAULT 'INFLUENCER';

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "contractRequiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "contractDocumentId" TEXT NOT NULL,
    "contractTemplateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "cnpj" TEXT,
    "companyName" TEXT,
    "address" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_brandId_kind_version_key" ON "ContractDocument"("brandId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_id_brandId_key" ON "ContractDocument"("id", "brandId");

-- CreateIndex
CREATE INDEX "ContractSignature_contractDocumentId_idx" ON "ContractSignature"("contractDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignature_creatorId_contractDocumentId_key" ON "ContractSignature"("creatorId", "contractDocumentId");

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractDocumentId_brandId_fkey" FOREIGN KEY ("contractDocumentId", "brandId") REFERENCES "ContractDocument"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractTemplateId_brandId_fkey" FOREIGN KEY ("contractTemplateId", "brandId") REFERENCES "ContractTemplate"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (D-RLS).
ALTER TABLE "ContractDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractSignature" ENABLE ROW LEVEL SECURITY;

-- Travas (D-SIGNCONTRACT): tipos conhecidos, versão positiva, texto não vazio, CPF/CNPJ só números, hash SHA-256.
ALTER TABLE "ContractTemplate"
  ADD CONSTRAINT "ContractTemplate_documentKind" CHECK ("documentKind" IN ('INFLUENCER', 'PRESCRITOR', 'UGC'));
ALTER TABLE "ContractDocument"
  ADD CONSTRAINT "ContractDocument_valid" CHECK ("kind" IN ('INFLUENCER', 'PRESCRITOR', 'UGC') AND "version" > 0 AND btrim("title") <> '' AND btrim("body") <> '');
ALTER TABLE "ContractSignature"
  ADD CONSTRAINT "ContractSignature_valid" CHECK (
    "cpf" ~ '^[0-9]{11}$' AND ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$') AND btrim("fullName") <> ''
    AND btrim("address") <> '' AND btrim("body") <> '' AND "bodySha256" ~ '^[0-9a-f]{64}$'
  );

-- Texto e assinatura são prova: só recebem inserções.
CREATE TRIGGER "ContractDocument_append_only"
  BEFORE UPDATE OR DELETE ON "ContractDocument"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE TRIGGER "ContractSignature_append_only"
  BEFORE UPDATE OR DELETE ON "ContractSignature"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Tipo de texto de cada versão de contrato já cadastrada: permuta (sem mínimo) é UGC; prescritor pela chave.
UPDATE "ContractTemplate" SET "documentKind" = 'UGC' WHERE "releaseMinCents" IS NULL;
UPDATE "ContractTemplate" SET "documentKind" = 'PRESCRITOR' WHERE "releaseMinCents" IS NOT NULL AND "key" LIKE 'prescritor%';

-- Versão 1 dos textos da Botanika: modelos do Drive ajustados às regras do sistema, aprovados pelo responsável no PR.
INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById")
SELECT gen_random_uuid()::text, b."id", 'INFLUENCER', 1, 'Contrato de parceria — influenciador(a) digital', $contrato$CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PUBLICIDADE, PRODUÇÃO DE CONTEÚDO E LICENCIAMENTO DE DIREITOS
PARCERIA COM INFLUENCIADOR(A) DIGITAL

PELO PRESENTE INSTRUMENTO PARTICULAR, de um lado, BOTANIKA SAUDE NATURAL LTDA, inscrita no CNPJ sob nº 65.100.830/0001-36, com sede à Rua Ministro Orozimbo Nonato, 215 - Loja 37 - Pavimento 5, CEP: 34.006-053, Vila da Serra, Belo Horizonte/MG, neste ato representada na forma de seu contrato social, doravante denominada CONTRATANTE; e, de outro lado, {{CONTRATADA}}, doravante denominada CONTRATADA;

As partes têm entre si, justo e acertado, o presente contrato, mediante as cláusulas e condições seguintes.

CLÁUSULA 1ª – DO OBJETO
A CONTRATADA prestará serviços de publicidade e produção de conteúdo digital, na qualidade de influenciadora digital, para divulgação da CONTRATANTE, de seus produtos e/ou campanhas, incluindo a autorização/licenciamento dos direitos de imagem, voz, nome e conteúdo nos limites estabelecidos neste instrumento e em seus anexos.
1.1. O escopo operacional, cronograma, produtos, canais, formatos, mensagens obrigatórias, links, cupons, hashtags e demais requisitos de cada campanha serão definidos no respectivo BRIEFING, que integrará este contrato para todos os fins.
1.2. Durante a vigência do contrato, e pelo prazo adicional de 12 (doze) meses, os direitos aqui pactuados, de forma não exclusiva, deverão ser respeitados.

CLÁUSULA 2ª – DAS ENTREGAS E DO PADRÃO DE EXECUÇÃO
a) Stories para a divulgação do cupom e/ou link promocional fornecido pela CONTRATANTE;
b) marcação do perfil oficial da CONTRATANTE nas divulgações, quando tecnicamente disponível e aplicável;
c) manutenção do conteúdo publicado pelo prazo definido no briefing ou, na ausência de previsão específica, durante a vigência da campanha.
2.1. A CONTRATADA deverá executar as entregas de forma pessoal, não podendo transferir ou subcontratar a execução principal a terceiros, sem autorização prévia e escrita da CONTRATANTE.
2.2. Conteúdos produzidos em conjunto com terceiros, especialmente Collabs, deverão ser submetidos à aprovação prévia e expressa da CONTRATANTE, antes da publicação.

CLÁUSULA 3ª – DO BRIEFING, APROVAÇÃO E AJUSTES
3.1. A CONTRATANTE poderá fornecer briefing, roteiros, identidade visual, informações técnicas, alegações comerciais permitidas, materiais e orientações de comunicação.
3.2. Nenhum conteúdo publicitário poderá ser publicado sem aprovação prévia e expressa da CONTRATANTE, quando assim previsto no briefing ou quando envolver afirmações sobre produtos, resultados, características técnicas ou ofertas.
3.3. A CONTRATADA realizará os ajustes razoáveis solicitados pela CONTRATANTE, desde que compatíveis com o objeto contratado. A aprovação da CONTRATANTE não afasta a responsabilidade da CONTRATADA por elementos inseridos por iniciativa própria e não submetidos à aprovação.

CLÁUSULA 4ª – DA PUBLICIDADE, TRANSPARÊNCIA E CONFORMIDADE
4.1. A CONTRATADA deverá identificar de forma clara, ostensiva e imediatamente perceptível ao público a natureza publicitária do conteúdo, utilizando as ferramentas e expressões adequadas à plataforma e à campanha, em conformidade com a legislação aplicável e as regras de autorregulamentação publicitária.
4.2. É vedado apresentar como espontâneo, independente ou orgânico, conteúdo que tenha sido objeto desta contratação, bem como realizar afirmações falsas, enganosas, não comprovadas ou incompatíveis com as informações fornecidas pela CONTRATANTE.
4.3. Depoimentos, testemunhos e demonstrações deverão refletir experiência verdadeira da CONTRATADA, não sendo permitida a criação de experiência fictícia ou promessa de resultado garantido.

CLÁUSULA 5ª – DAS OBRIGAÇÕES DA CONTRATANTE
a) Fornecer, em tempo razoável, informações, características, exemplares, imagens, fotos e materiais necessários à execução das campanhas;
b) Informar alterações relevantes nas características dos produtos, preços, ofertas ou condições de campanha;
c) Efetuar os pagamentos e/ou entregar os produtos previstos neste contrato, observadas as condições pactuadas;
d) Disponibilizar os links, cupons e demais elementos necessários à mensuração das vendas;
e) Realizar a apuração das vendas atribuídas ao link e/ou cupom segundo seus registros internos, que a CONTRATADA acompanha no portal Creator Club.

CLÁUSULA 6ª – DAS OBRIGAÇÕES DA CONTRATADA
a) Cumprir integralmente o objeto, briefing, cronograma e requisitos técnicos da campanha;
b) Publicar os conteúdos nos canais e períodos contratados, e preservar as publicações pelo prazo acordado;
c) Utilizar apenas materiais, músicas, imagens, vídeos, fontes, marcas e demais elementos de terceiros para os quais possua autorização ou licença suficiente;
d) Não alterar, distorcer ou ampliar informações técnicas ou comerciais fornecidas pela CONTRATANTE;
e) Não utilizar bots, compra fraudulenta de seguidores, automações ilícitas ou mecanismos destinados a manipular métricas de audiência ou engajamento;
f) Apresentar, quando solicitado, evidências e relatórios disponíveis nas próprias plataformas sobre alcance, visualizações, cliques, engajamento e demais métricas relevantes;
g) Não se fazer substituir por outro usuário, uma vez que foi escolhida pela CONTRATANTE em razão das suas características pessoais;
h) Comunicar imediatamente qualquer reclamação relevante, remoção de conteúdo, restrição de conta ou ocorrência que possa afetar a campanha;
i) Preservar a reputação e a integridade da marca da CONTRATANTE durante a vigência da parceria.

CLÁUSULA 7ª – DA PARCERIA, REMUNERAÇÃO E PAGAMENTO
7.1. Como contraprestação inicial, a CONTRATANTE enviará à CONTRATADA 01 (um) produto Botanika no primeiro mês da parceria. A CONTRATADA receberá comissão de {{COMISSAO}} sobre as vendas atribuídas ao seu cupom {{CUPOM}} e/ou link promocional. O cupom dá {{DESCONTO}} de desconto a quem compra com ele.
7.2. A venda conta no mês em que o pedido é pago. A comissão é calculada sobre o valor dos produtos do pedido, já com os descontos e sem frete, considerando apenas pedidos pagos e efetivamente atribuídos ao cupom ou link da CONTRATADA.
7.3. A comissão de cada mês fica "a liberar" e é liberada no fechamento do mês (dia 1 do mês seguinte), quando as vendas acumuladas desde a última liberação atingem o mínimo de {{MINIMO}}. Enquanto o mínimo não for atingido, a comissão continua acumulada para os meses seguintes.
7.4. O valor liberado pode ser sacado pelo portal Creator Club do dia 1 ao dia 10 de cada mês, com a nota fiscal do valor total do saque, adequada à natureza jurídica e tributária da CONTRATADA (ou recibo, quando a CONTRATANTE autorizar o recebimento como pessoa física), e é pago por Pix na chave cadastrada. Eventuais retenções legais serão observadas pela CONTRATANTE.
7.5. Pedidos cancelados, devolvidos, estornados ou fraudulentos não geram comissão; se a comissão já tiver sido lançada, o valor correspondente é descontado das comissões seguintes.
7.6. Kit mensal: no fechamento de cada mês, conforme as vendas do mês, a CONTRATADA recebe suplementos, que escolhe no portal Creator Club:
{{KIT}}
7.7. O envio dos suplementos ocorre depois da escolha no portal, no mês seguinte ao da apuração.

CLÁUSULA 8ª – DA VIGÊNCIA E RENOVAÇÃO
8.1. O contrato terá duração de {{MESES}}, contados da data de sua assinatura, podendo ser renovado mediante manifestação expressa das partes, através de aditivo.

CLÁUSULA 9ª – DOS DIREITOS DE IMAGEM, VOZ, NOME E CONTEÚDO
9.1. A CONTRATADA autoriza, de forma não exclusiva, a CONTRATANTE a utilizar sua imagem, voz, nome, nome artístico, @ de rede social e os conteúdos produzidos no âmbito desta contratação, exclusivamente para divulgação institucional e comercial relacionada às campanhas e aos produtos da CONTRATANTE.
9.2. A autorização abrange reprodução e republicação nos canais digitais próprios da CONTRATANTE e, quando expressamente previsto no briefing ou proposta comercial, utilização em mídia paga e anúncios.
9.3. O prazo, território, canais adicionais e eventual uso em mídia paga deverão ser especificados no briefing ou instrumento comercial aplicável. Na ausência de previsão de mídia paga, esta dependerá de autorização específica entre as partes.
9.4. A CONTRATANTE poderá realizar cortes, adaptações técnicas de formato e inserção de elementos de identidade visual, desde que não desvirtue a manifestação original da CONTRATADA.

CLÁUSULA 10ª – DA PROPRIEDADE INTELECTUAL E MATERIAIS DE TERCEIROS
10.1. Cada parte permanece titular dos direitos de propriedade intelectual que já possuía antes da contratação. Os direitos patrimoniais sobre materiais produzidos especificamente para a campanha serão licenciados à CONTRATANTE nos limites desta contratação.
10.2. A CONTRATADA declara que possui ou obterá as autorizações necessárias para todos os elementos de terceiros inseridos nos conteúdos, responsabilizando-se por reclamações decorrentes de utilização não autorizada.
10.3. A CONTRATADA não poderá utilizar marcas, imagens, músicas, vídeos, fotografias ou outros materiais de terceiros de modo a criar aparência de autorização, associação ou patrocínio inexistente.

CLÁUSULA 11ª – DA NÃO EXCLUSIVIDADE E CONCORRÊNCIA
11.1. O contrato é não exclusivo. Entretanto, durante sua vigência, a CONTRATADA não poderá divulgar, promover ou realizar publicidade remunerada para empresas que concorram diretamente com a CONTRATANTE, ou produtos/serviços expressamente definidos como concorrentes no briefing, salvo autorização prévia e escrita.
11.2. A restrição de concorrência deverá ser interpretada de forma objetiva, limitada à categoria de produtos/serviços diretamente concorrentes e ao período de vigência, salvo prazo adicional expressamente acordado.

CLÁUSULA 12ª – DA CONDUTA, INTEGRIDADE E PROTEÇÃO REPUTACIONAL
12.1. A CONTRATADA deverá observar padrões de boa-fé, respeito, integridade e conduta compatíveis com a imagem comercial da CONTRATANTE.
12.2. Constituem hipóteses de rescisão por justa causa, sem prejuízo de outras previstas em lei ou neste contrato, condutas ilícitas, fraudulentas, discriminatórias, ofensivas, violação deliberada de direitos de terceiros, publicidade enganosa, manipulação fraudulenta de métricas, exposição indevida de informações confidenciais ou fatos públicos de gravidade suficiente para gerar risco relevante à reputação da CONTRATANTE.

CLÁUSULA 13ª – DA PROTEÇÃO DE DADOS PESSOAIS
13.1. As partes comprometem-se a cumprir a Lei nº 13.709/2018 (LGPD) e demais normas aplicáveis ao tratamento de dados pessoais.
13.2. Caso a campanha envolva coleta, acesso, armazenamento ou compartilhamento de dados pessoais de consumidores, as partes definirão, no briefing ou termo específico, as respectivas responsabilidades, finalidades, medidas de segurança e regras de retenção e descarte.
13.3. A CONTRATADA não poderá utilizar dados de consumidores obtidos em razão da campanha para finalidade própria ou diversa da autorizada, nem os compartilhar com terceiros sem base legal e autorização aplicável.

CLÁUSULA 14ª – DA CONFIDENCIALIDADE
14.1. A CONTRATADA manterá sigilo sobre informações comerciais, estratégicas, financeiras, campanhas ainda não publicadas, preços, lançamentos, dados de clientes, métricas e demais informações não públicas às quais tenha acesso.
14.2. A obrigação de confidencialidade permanecerá após o término do contrato, enquanto a informação mantiver caráter confidencial.

CLÁUSULA 15ª – DA RESPONSABILIDADE E INDENIZAÇÃO
15.1. Cada parte responderá pelos danos que causar à outra por ação ou omissão, culposa ou dolosa, observados os limites legais.
15.2. A CONTRATADA responderá, especialmente, por prejuízos decorrentes de conteúdo produzido ou publicado em desacordo com este contrato, uso não autorizado de material de terceiros, violação de direitos de imagem ou propriedade intelectual de terceiros, fraude de métricas, violação de confidencialidade e tratamento irregular de dados pessoais sob sua responsabilidade.
15.3. Quando houver reclamação de terceiro relacionada a ato imputável à CONTRATADA, esta deverá cooperar com a CONTRATANTE na apuração e mitigação do problema, sem prejuízo das responsabilidades legalmente aplicáveis.

CLÁUSULA 16ª – DA SUSPENSÃO E RETIRADA DE CONTEÚDO
16.1. A CONTRATANTE poderá solicitar a suspensão ou retirada de conteúdo relacionado à campanha quando houver indício de irregularidade, erro relevante, risco jurídico, determinação de autoridade competente, alteração substancial do produto ou necessidade de proteção da marca.
16.2. Recebida a solicitação, a CONTRATADA deverá agir com prioridade e, sempre que tecnicamente possível, realizar a suspensão ou retirada no prazo máximo de 24 (vinte e quatro) horas, ou em prazo menor quando a urgência do caso justificar.

CLÁUSULA 17ª – DA RESCISÃO E DAS PENALIDADES
17.1. O contrato poderá ser encerrado por comum acordo, mediante registro escrito entre as partes.
17.2. Qualquer parte poderá rescindir unilateralmente o contrato mediante notificação escrita, com antecedência mínima de 05 (cinco) dias, respeitadas as entregas já aprovadas e os valores eventualmente devidos.
17.3. O contrato poderá ser rescindido imediatamente por justa causa em caso de descumprimento material, fraude, violação de direitos de terceiros, publicidade irregular, violação de confidencialidade, descumprimento de exclusividade, manipulação de métricas ou dano reputacional relevante, sem prejuízo das medidas cabíveis.
17.4. Em caso de publicação sem autorização, quando esta for obrigatória, descumprimento injustificado de entrega ou violação de obrigação essencial, a parte prejudicada poderá exigir multa contratual de R$ 5.000,00 (cinco mil reais), sem prejuízo de perdas e danos, quando juridicamente cabíveis e sem prejuízo da análise de proporcionalidade da penalidade.

CLÁUSULA 18ª – DA AUTONOMIA DAS PARTES
18.1. A presente contratação possui natureza civil/comercial de prestação de serviços. As partes reconhecem sua autonomia empresarial e operacional, inexistindo subordinação jurídica entre elas, sem prejuízo da observância das obrigações efetivamente assumidas neste instrumento.
18.2. A CONTRATADA será responsável por suas próprias obrigações fiscais, previdenciárias e empresariais, observadas as retenções legalmente exigíveis pela CONTRATANTE.

CLÁUSULA 19ª – DO TÍTULO EXECUTIVO E ASSINATURA
19.1. O presente instrumento poderá constituir título executivo extrajudicial quando preenchidos os requisitos legais aplicáveis, especialmente aqueles previstos no art. 784, III, do Código de Processo Civil.
19.2. A CONTRATADA assina este instrumento eletronicamente no portal Creator Club, informando nome completo e CPF; a data, a hora, o IP e o navegador da assinatura e o texto assinado ficam registrados, produzindo os mesmos efeitos da assinatura física, na forma da legislação aplicável.

CLÁUSULA 20ª – DA INTEGRAÇÃO DOS ANEXOS
20.1. O briefing, o cronograma, o termo de adesão ao Creator Club e os demais anexos expressamente identificados integram este contrato para todos os fins. Em caso de conflito, prevalecerá este contrato quanto às regras jurídicas gerais e o briefing quanto aos aspectos operacionais específicos da campanha, salvo disposição expressa em contrário.

CLÁUSULA 21ª – DAS DISPOSIÇÕES GERAIS
a) Alterações deste contrato deverão ser realizadas por escrito, inclusive por meio eletrônico que permita comprovação.
b) A eventual tolerância de uma parte quanto ao descumprimento de obrigação não constituirá renúncia, novação ou alteração contratual.
c) A nulidade ou inexigibilidade de uma disposição não prejudicará as demais, que permanecerão válidas na extensão permitida pela legislação.
d) As comunicações relevantes entre as partes deverão ocorrer por canais que permitam comprovação do envio e recebimento.

CLÁUSULA 22ª – DO FORO
22.1. Fica eleito o foro da Comarca de Belo Horizonte/MG para dirimir controvérsias decorrentes deste instrumento, com renúncia a qualquer outro, ressalvadas as hipóteses em que a legislação determine foro diverso.

Belo Horizonte/MG, {{DATA}}.

ANEXO – TERMO DE AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ
Eu, {{NOME}}, inscrita no CPF sob o nº {{CPF}}, residente em {{ENDERECO}}, autorizo, de livre e espontânea vontade, o uso de minha imagem e voz, capturadas por meio de fotografia, vídeo ou gravação de áudio, para fins de divulgação institucional, campanhas publicitárias, materiais educacionais, redes sociais, etc.
Declaro que estou ciente de que minha imagem e voz poderão ser reproduzidas, divulgadas, transmitidas ou publicadas em meios de comunicação como internet, redes sociais, materiais impressos, etc., por tempo indeterminado, sem que isso implique em qualquer ônus ou pagamento, agora ou no futuro.
Esta autorização é concedida em caráter gratuito, abrangendo o uso da imagem e voz em todo território nacional e no exterior, para fins relacionados ao uso da minha imagem e voz.
Estou ciente de que este termo não gera qualquer vínculo empregatício, societário, associativo ou de qualquer outra natureza, e que não terei direito a qualquer tipo de remuneração ou indenização.$contrato$, 'claude-rascunho'
FROM "Brand" b WHERE b."slug" = 'botanika';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById")
SELECT gen_random_uuid()::text, b."id", 'PRESCRITOR', 1, 'Contrato de parceria — prescritor', $contrato$CONTRATO DE PARCERIA PRESCRITOR

Pelo presente instrumento particular de contrato, entre as partes abaixo qualificadas:

na qualidade de CONTRATANTE: BOTANIKA SAUDE NATURAL LTDA, empresa inscrita no CNPJ sob o nº 65.100.830/0001-36, com sede à Rua Ministro Orozimbo Nonato, 215, LOJA 37 PAVMTO 5, 34.006-053, Vila da Serra, Belo Horizonte/MG, na forma de seu contrato social;

na qualidade de CONTRATADA: {{CONTRATADA}}, doravante denominada simplesmente "CONTRATADA",

Cláusula 1ª – Do Objeto:
1. A CONTRATANTE tem interesse que a CONTRATADA preste serviços de prescritor e ceda seus direitos de imagem e conexos para realização de campanha publicitária para o cliente Botanika Brasil, de acordo com as condições estipuladas neste instrumento.
Diante disso, as partes têm entre si justo e contratado a prestação de serviços objeto do presente instrumento, mediante as seguintes condições:

Cláusula 2ª – Da Parceria e do Pagamento:
2.1. A CONTRATANTE enviará à CONTRATADA 2 (dois) produtos Botanika no início da parceria. A CONTRATADA receberá comissão de {{COMISSAO}} sobre as vendas geradas pelo seu cupom {{CUPOM}} e/ou link promocional. O cupom dá {{DESCONTO}} de desconto a quem compra com ele.
2.2. A venda conta no mês em que o pedido é pago. A comissão é calculada sobre o valor dos produtos do pedido, já com os descontos e sem frete, considerando apenas pedidos pagos e efetivamente atribuídos ao cupom ou link da CONTRATADA. Pedidos cancelados, devolvidos, estornados ou fraudulentos não geram comissão; se a comissão já tiver sido lançada, o valor correspondente é descontado das comissões seguintes.
2.3. A comissão de cada mês fica "a liberar" e é liberada no fechamento do mês (dia 1 do mês seguinte), quando as vendas acumuladas desde a última liberação atingem o mínimo de {{MINIMO}}. Enquanto o mínimo não for atingido, a comissão continua acumulada para os meses seguintes.
2.4. O valor liberado pode ser sacado pelo portal Creator Club do dia 1 ao dia 10 de cada mês, com a nota fiscal do valor total do saque (ou recibo, quando a CONTRATANTE autorizar o recebimento como pessoa física), e é pago por Pix na chave cadastrada, de titularidade da CONTRATADA.
2.5. Kit mensal: no fechamento de cada mês, conforme as vendas do mês, a CONTRATADA recebe suplementos, que escolhe no portal Creator Club:
{{KIT}}
Parágrafo único. O envio dos suplementos ocorre depois da escolha no portal, no mês seguinte ao da apuração.

Cláusula 3ª – Do Prazo:
3.1. O presente contrato terá a duração de {{MESES}}, contados da data de sua assinatura, podendo ser renovado apenas mediante a assinatura de aditivo pelas partes contratantes.

Cláusula 4ª – Das Obrigações da Contratante:
4.1. A CONTRATANTE fornecerá à CONTRATADA todas as informações, características, exemplares, imagens e fotos pertinentes aos produtos e serviços que serão divulgados.
4.2. A CONTRATANTE se compromete a efetuar o pagamento e a entrega dos produtos e valores descritos na cláusula 2ª deste instrumento.

Cláusula 5ª – Das Obrigações da Contratada:
5.1. Observar fielmente as condições descritas no OBJETO do presente contrato;
5.2. A CONTRATADA é responsável por todo e qualquer tipo de postagem ou menção às PARTES, e deve zelar pela integridade e idoneidade dos terceiros envolvidos, sendo passível de penalização e indenização à PARTE INOCENTE caso viole as condutas aceitáveis e as boas práticas, em especial aos artigos 139 e 140 do Código Penal, previstos como Crime Contra a Honra (Calúnia, Injúria ou Difamação).

Cláusula 6ª – De Não Exclusividade:
6.1. O presente contrato não contempla cláusula de exclusividade. No entanto, durante sua vigência, a CONTRATADA compromete-se a não divulgar, promover ou realizar qualquer tipo de publicidade para empresas concorrentes, do mesmo segmento ou que comercializem produtos e/ou serviços similares aos da CONTRATANTE, salvo autorização expressa e por escrito desta última.

Cláusula 7ª – Da Rescisão Contratual:
7.1. O presente instrumento poderá ser rescindido a qualquer momento por comum acordo entre as partes, dando-se por quitadas as obrigações.
7.2. O presente instrumento poderá ser rescindido unilateralmente através de notificação expressa à outra parte com antecedência mínima de 05 (cinco) dias.
7.3. Estará rescindido automaticamente o presente contrato se ocorrer a violação de qualquer cláusula constante neste instrumento, por dolo ou culpa.

Cláusula 8ª – Do Título Executivo e da Assinatura:
8.1. O presente contrato constitui título executivo extrajudicial, nos termos do artigo 784, inciso III, do Código de Processo Civil, podendo ser executado judicialmente em caso de inadimplemento de quaisquer das obrigações aqui estipuladas.
8.2. A CONTRATADA assina este instrumento eletronicamente no portal Creator Club, informando nome completo e CPF; a data, a hora, o IP e o navegador da assinatura e o texto assinado ficam registrados, produzindo os mesmos efeitos da assinatura física, na forma da legislação aplicável.

Cláusula 9ª – Da Integração do Anexo:
9.1. O anexo deste contrato e o termo de adesão ao Creator Club constituem parte integrante do presente instrumento, devendo ser considerados em sua totalidade para todos os fins de direito.

Cláusula 10ª – Do Foro:
10.1. Para dirimir quaisquer controvérsias oriundas do presente instrumento, as partes elegem o foro da comarca de Belo Horizonte/MG, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E por estarem assim, as partes justas e acertadas, firmam o presente contrato.

Belo Horizonte/MG, {{DATA}}.$contrato$, 'claude-rascunho'
FROM "Brand" b WHERE b."slug" = 'botanika';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById")
SELECT gen_random_uuid()::text, b."id", 'UGC', 1, 'Contrato de permuta — criadora de conteúdo (UGC)', $contrato$CONTRATO DE PERMUTA CRIADOR DE CONTEÚDO

Pelo presente instrumento particular de contrato, entre as partes abaixo qualificadas:

na qualidade de CONTRATANTE: BOTANIKA SAUDE NATURAL LTDA, empresa inscrita no CNPJ sob o nº 65.100.830/0001-36, com sede à Rua Ministro Orozimbo Nonato, 215, LOJA 37 PAVMTO 5, 34.006-053, Vila da Serra, Belo Horizonte/MG, na forma de seu contrato social;

na qualidade de CONTRATADA: {{CONTRATADA}}.

Cláusula 1ª – Do Objeto:
1. A CONTRATANTE tem interesse que a CONTRATADA preste serviços de criadora de conteúdo no formato permuta e ceda seus direitos de imagem e conexos para realização de campanha publicitária para a CONTRATANTE, de acordo com as condições estipuladas neste instrumento.
Diante disso, as partes têm entre si justo e contratado a prestação de serviços no formato permuta objeto do presente instrumento, mediante as seguintes condições:
1.1. Das entregas: durante a vigência deste contrato, a CONTRATADA compromete-se a produzir, no mínimo, {{VIDEOS}} vídeos no formato UGC (User Generated Content – Conteúdo Gerado pelo Usuário) no total do período do contrato (não por produto), entre ganchos, corpos de vídeo e CTAs, conforme o briefing, com duração entre 40 (quarenta) e 60 (sessenta) segundos cada vídeo completo (gancho + corpo + CTA).

Cláusula 2ª – Da Parceria por Permuta:
2.1. A presente parceria tem natureza de permuta, por meio da qual a CONTRATANTE disponibilizará à CONTRATADA os suplementos Botanika, sem qualquer ônus, exclusivamente como contraprestação pela produção dos conteúdos previstos neste contrato. Não há comissão sobre vendas.
2.2. No início da parceria, a CONTRATANTE enviará à CONTRATADA 03 (três) suplementos, conforme disponibilidade e estratégia da marca.
2.3. Em contrapartida ao recebimento dos suplementos, a CONTRATADA compromete-se a produzir e entregar os conteúdos previstos neste contrato, observando os padrões de qualidade, o prazo de 7 (sete) dias úteis e as especificações estabelecidas entre as partes.
2.4. A renovação mensal do envio de suplementos estará condicionada à entrega integral dos conteúdos referentes ao mês anterior e ao cumprimento das obrigações assumidas pela CONTRATADA.
Parágrafo único. O envio dos novos suplementos será realizado após a validação dos conteúdos entregues pela CONTRATADA, ficando a critério da CONTRATANTE a definição dos produtos a serem enviados, conforme disponibilidade de estoque e estratégia de marketing da marca.

Cláusula 3ª – Do Prazo:
3.1. O presente contrato terá a duração de {{MESES}}, contados da data de sua assinatura, podendo ser renovado apenas mediante a assinatura de aditivo pelas partes contratantes.

Cláusula 4ª – Das Obrigações da Contratante:
4.1. A CONTRATANTE fornecerá à CONTRATADA todas as informações, características, exemplares, imagens e fotos pertinentes aos produtos e serviços que serão divulgados.
Parágrafo único. Eventuais alterações nas características dos produtos e/ou serviços deverão ser comunicadas imediatamente à CONTRATADA, que poderá atualizar ou remover o conteúdo publicado, a seu livre e exclusivo critério.
4.2. A CONTRATANTE se compromete com a entrega dos produtos descritos na cláusula 2ª deste instrumento.

Cláusula 5ª – Das Obrigações da Contratada:
5.1. Observar fielmente as condições descritas no OBJETO do presente contrato e no BRIEFING;
5.2. Realizar a gravação dos vídeos solicitados, conforme a cláusula primeira;
5.3. A CONTRATADA não poderá se fazer substituir por outro usuário, uma vez que foi escolhida pela CONTRATANTE em razão das suas características pessoais.
5.4. É completamente vedado à CONTRATADA utilizar-se de qualquer marca, logotipo ou conteúdo que não seja de sua própria propriedade intelectual, devendo responder sob sua inteira responsabilidade em caso de descumprimento desta cláusula, a qualquer PARTE que seja, a qualquer tempo em que haja denúncia de infração comprovadamente plausível, bem como indenizar a PARTE INOCENTE por quaisquer prejuízos que aconteçam, sejam eles intelectuais, financeiros, operacionais, etc.
5.5. A CONTRATADA é responsável por todo e qualquer tipo de postagem ou menção às PARTES, e deve zelar pela integridade e idoneidade dos terceiros envolvidos, sendo passível de penalização e indenização à PARTE INOCENTE caso viole as condutas aceitáveis e as boas práticas, em especial aos artigos 139 e 140 do Código Penal, previstos como Crime Contra a Honra (Calúnia, Injúria ou Difamação).

Cláusula 6ª – De Não Exclusividade:
6.1. O presente contrato não estabelece qualquer obrigação de exclusividade, permanecendo a CONTRATADA livre para firmar parcerias e realizar ações publicitárias com outras marcas, desde que tais atividades não prejudiquem o cumprimento das obrigações assumidas neste instrumento.

Cláusula 7ª – Da Rescisão Contratual:
7.1. O presente instrumento poderá ser rescindido a qualquer momento por comum acordo entre as partes, dando-se por quitadas as obrigações.
7.2. O presente instrumento poderá ser rescindido unilateralmente através de notificação expressa à outra parte com antecedência mínima de 05 (cinco) dias.
7.3. Estará rescindido automaticamente o presente contrato se ocorrer a violação de qualquer cláusula constante neste instrumento, por dolo ou culpa, obrigando-se a parte violadora a pagar uma multa contratual no valor de R$ 5.000,00 (cinco mil reais), imediatamente exigível pela outra parte.

Cláusula 8ª – Do Título Executivo e da Assinatura:
8.1. O presente contrato constitui título executivo extrajudicial, nos termos do artigo 784, inciso III, do Código de Processo Civil, podendo ser executado judicialmente em caso de inadimplemento de quaisquer das obrigações aqui estipuladas.
8.2. A CONTRATADA assina este instrumento eletronicamente no portal Creator Club, informando nome completo e CPF; a data, a hora, o IP e o navegador da assinatura e o texto assinado ficam registrados, produzindo os mesmos efeitos da assinatura física, na forma da legislação aplicável.

Cláusula 9ª – Da Integração do Anexo:
9.1. O anexo deste contrato constitui parte integrante do presente instrumento, devendo ser considerado em sua totalidade para todos os fins de direito.

Cláusula 10ª – Do Foro:
10.1. Para dirimir quaisquer controvérsias oriundas do presente instrumento, as partes elegem o foro da comarca de Belo Horizonte/MG, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E por estarem assim, as partes justas e acertadas, firmam o presente contrato.

Belo Horizonte/MG, {{DATA}}.$contrato$, 'claude-rascunho'
FROM "Brand" b WHERE b."slug" = 'botanika';
