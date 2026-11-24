-- D-BOTCONTRACT (2026-11-24): os contratos novos da Influencer da Botanika (pessoa física ou empresa, 1 produto),
-- texto do jurídico de 2026-11-17 enviado pela Fátima, publicados como textos da marca (antes ela usava o texto de
-- influencer de outubro). Os "XXXX" do arquivo viraram os campos do sistema ({{NOME}}, {{CPF}}, {{ENDERECO}},
-- {{RAZAO_SOCIAL}}, {{CNPJ}}, {{INSTAGRAM}}, {{CUPOM}}, {{DATA}}); no de CPF a linha de assinatura dizia "CNPJ".

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'INFLUENCER_PF_1', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'INFLUENCER_PF_1'), 0) + 1,
  $t$Contrato de parceria Influencer Botanika — CPF — 1 produto$t$, $c$CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PUBLICIDADE, PRODUÇÃO DE CONTEÚDO E LICENCIAMENTO DE DIREITOS
PARCERIA COM INFLUENCIADOR(A) DIGITAL · PESSOA FÍSICA
ENVIO INICIAL DE 1 PRODUTO
PELO PRESENTE INSTRUMENTO PARTICULAR, de um lado, BOTANIKA SAUDE NATURAL LTDA, inscrita no CNPJ sob nº 65.100.830/0001-36, com sede à Rua Ministro Orozimbo Nonato, 215 - Loja 37 - Pavimento 5, CEP 34.006-053, Vila da Serra, Belo Horizonte/MG, neste ato representada na forma de seu contrato social, doravante denominada CONTRATANTE, e de outro lado, {{NOME}}, residente na {{ENDERECO}}, inscrito(a) no CPF sob o nº {{CPF}}, titular do perfil {{INSTAGRAM}}, doravante denominado(a) CONTRATADO(A);
As partes têm entre si, justo e acertado, o presente contrato, mediante as cláusulas e condições seguintes.
CLÁUSULA 1ª – DO OBJETO
O(A) CONTRATADO(A) prestará serviços de publicidade e produção de conteúdo digital, na qualidade de influenciador(a) digital, para divulgação da CONTRATANTE, e de seus produtos e/ou campanhas, mediante cupom de desconto exclusivo e remuneração por premiação sobre vendas, incluindo a autorização/licenciamento dos direitos de imagem, voz, nome e conteúdo nos limites estabelecidos neste instrumento e em seus anexos.
1.1. O escopo operacional, cronograma, produtos, canais, formatos, mensagens obrigatórias, links, cupons, hashtags e demais requisitos de cada ação de divulgação serão definidos no respectivo BRIEFING, que integrará este contrato para todos os fins.
1.2. A parceria é operada pelo portal Creator Club (creatorclub.app.br), no qual o(a) CONTRATADO(A) acompanha vendas, premiações, escolha e envio de produtos, saques e demais informações.
1.3. Durante a vigência do contrato, e pelo prazo adicional de 12 (doze) meses, os direitos aqui pactuados, de forma não exclusiva, deverão ser respeitados.
CLÁUSULA 2ª – DAS ENTREGAS E DO PADRÃO DE EXECUÇÃO
2.1. Durante toda a vigência, o(a) CONTRATADO(A) publicará, no mínimo:
a) 02 (dois) stories por semana, divulgando os produtos e o cupom e/ou link promocional fornecido pela CONTRATANTE;
b) 01 (um) reel por mês, divulgando os produtos e o cupom e/ou link promocional;
c) marcação do perfil oficial da CONTRATANTE nas divulgações, quando tecnicamente disponível e aplicável;
d) manutenção do conteúdo publicado pelo prazo definido no briefing ou, na ausência de previsão específica, durante a vigência do contrato.
2.2. O(A) CONTRATADO(A) deverá executar as entregas de forma pessoal, não podendo transferir ou subcontratar a execução principal a terceiros, sem autorização prévia e escrita da CONTRATANTE.
2.3. Conteúdos produzidos em conjunto com terceiros, especialmente Collabs, deverão ser submetidos à aprovação prévia e expressa da CONTRATANTE, antes da publicação.
CLÁUSULA 3ª – DO BRIEFING, APROVAÇÃO E AJUSTES
3.1. A CONTRATANTE poderá fornecer briefing, roteiros, identidade visual, informações técnicas, alegações comerciais permitidas, materiais e orientações de comunicação.
3.2. Nenhum conteúdo publicitário poderá ser publicado sem aprovação prévia e expressa da CONTRATANTE, e sem que esteja de acordo com os valores da empresa e o manual da marca, quando assim previsto no briefing ou quando envolver afirmações sobre produtos, resultados, características técnicas ou ofertas.
3.3. O(A) CONTRATADO(A) realizará os ajustes razoáveis solicitados pela CONTRATANTE, desde que compatíveis com o objeto contratado. A aprovação da CONTRATANTE não afasta a responsabilidade do(a) CONTRATADO(A), por elementos inseridos por iniciativa própria e não submetidos à aprovação. A divulgação de conteúdo sem a observância do manual da marca, sujeita a CONTRADATA a responsabilização civil e penal.
CLÁUSULA 4ª – DA PUBLICIDADE, TRANSPARÊNCIA E CONFORMIDADE
4.1. O(A) CONTRATADO(A) deverá identificar de forma clara, ostensiva e imediatamente perceptível ao público a natureza publicitária do conteúdo, utilizando as ferramentas e expressões adequadas à plataforma e à campanha, em conformidade com a legislação aplicável e as regras de autorregulamentação publicitária.
4.2. É vedado apresentar como espontâneo, independente ou orgânico conteúdo que tenha sido objeto desta contratação, bem como realizar afirmações falsas, enganosas, não comprovadas ou incompatíveis com as informações fornecidas pela CONTRATANTE, inclusive alegações de cura, tratamento ou prevenção de doenças.
4.3. Depoimentos, testemunhos e demonstrações deverão refletir experiência verdadeira do(a) CONTRATADO(A), não sendo permitida a criação de experiência fictícia ou promessa de resultado garantido.
4.4. É vedada a divulgação do cupom em sites agregadores de cupons, grupos de promoções ou anúncios pagos em nome do(a) CONTRATADO(A), salvo autorização prévia e escrita da CONTRATANTE.
CLÁUSULA 5ª – DAS OBRIGAÇÕES DA CONTRATANTE
a) Fornecer, em tempo razoável, informações, características, exemplares, imagens, fotos e materiais necessários à execução da parceria;
b) Informar alterações relevantes nas características dos produtos, preços, ofertas ou condições comerciais;
c) Efetuar os pagamentos e entregar os produtos previstos neste contrato, observadas as condições pactuadas;
d) Disponibilizar os links, cupons e demais elementos necessários à mensuração das vendas;
e) Realizar a apuração das vendas atribuídas ao link e/ou cupom segundo seus registros internos, que o(a) CONTRATADO(A) acompanha no portal Creator Club.
CLÁUSULA 6ª – DAS OBRIGAÇÕES DO(A) CONTRATADO(A)
a) Cumprir integralmente o objeto, briefing, cronograma e requisitos técnicos da parceria, inclusive as entregas mínimas da Cláusula 2ª;
b) Publicar os conteúdos nos canais e períodos contratados, e preservar as publicações pelo prazo acordado;
c) Utilizar apenas materiais, músicas, imagens, vídeos, fontes, marcas e demais elementos de terceiros para os quais possua autorização ou licença suficiente;
d) Não alterar, distorcer ou ampliar informações técnicas ou comerciais fornecidas pela CONTRATANTE;
e) Não utilizar bots, compra fraudulenta de seguidores, automações ilícitas ou mecanismos destinados a manipular métricas de audiência ou engajamento;
f) Apresentar, quando solicitado, evidências e relatórios disponíveis nas próprias plataformas sobre alcance, visualizações, cliques, engajamento e demais métricas relevantes;
g) Não poderá se fazer substituir por outro usuário, uma vez que foi escolhido(a) pela CONTRATANTE em razão das suas características pessoais;
h) Comunicar imediatamente qualquer reclamação relevante, remoção de conteúdo, restrição de conta ou ocorrência que possa afetar a parceria;
i) Manter seus dados cadastrais atualizados no portal Creator Club;
j) Preservar a reputação e a integridade da marca da CONTRATANTE durante a vigência da parceria.
CLÁUSULA 7ª – DA PARCERIA, REMUNERAÇÃO E PAGAMENTO
7.1. Como contraprestação inicial, a CONTRATANTE enviará ao(à) CONTRATADO(A) 01 (um) produto Botanika, escolhido por ele(a) na área “Escolher produto” do portal Creator Club.
7.2. O(A) CONTRATADO(A) receberá premiação de 15% (quinze por cento) sobre as vendas atribuídas ao seu cupom {{CUPOM}} e/ou link promocional, observadas as condições desta cláusula. O cupom concede 5% (cinco por cento) de desconto a quem compra com ele.
7.3. A venda elegível para premiação, conta no mês em que o pedido é pago. A premiação é calculada sobre o valor dos produtos do pedido, já com os descontos e sem frete, considerando apenas pedidos pagos e efetivamente atribuídos ao cupom ou link do(a) CONTRATADO(A).
7.4. O valor mínimo para saque é de R$ 100,00 (cem reais) em premiação. Quando a premiação do mês for inferior a esse valor, ela será acumulada para o mês seguinte.
7.5. O saque é solicitado pelo portal Creator Club, do dia 05 ao dia 15 de cada mês, e corresponde obrigatoriamente ao valor total da premiação disponível referente ao(s) mês(es) anterior(es), sem possibilidade de saques parciais. No caso de não cumprimento da meta de faturamento, o valor será acumulado para o período seguinte, ou enquanto se manter a promoção, até atingir o mínimo exigido, para cálculo da premiação.
7.6. Para o recebimento, o(a) CONTRATADO(A) emitirá nota fiscal de serviço/recibo, no valor total do saque, adequada à sua natureza jurídica e tributária, e a anexará na área “Envio de notas”, do portal Creator Club, dentro da janela do item 7.5. O pagamento será realizado entre os dias 20 e 25 do mesmo mês, através de crédito em cartão de benefícios, previamente disponibilizado. Documentos enviados fora do prazo, serão pagos no ciclo seguinte.
7.7. A premiação será calculada sobre vendas efetivamente atribuídas ao link promocional, consideradas as regras de cancelamento, devolução, estorno e fraude adotadas pela CONTRATANTE. Pedidos cancelados, devolvidos, estornados ou fraudulentos não geram premiação. Se a premiação já tiver sido lançada, o valor correspondente é descontado das premiações seguintes.
7.8. A renovação mensal do envio de suplementos, estará condicionada ao desempenho das vendas apurado no período anterior, conforme as vendas do mês atribuídas ao cupom, o(a) CONTRATADO(A) recebe produtos Botanika, que escolhe no portal Creator Club:
a) do 1º ao 3º mês de contrato: 01 (um) produto ao atingir R$ 500,00 em vendas dentro do mês;
b) a partir do 4º mês de contrato: 01 (um) produto ao atingir R$ 1.000,00; 02 (dois) produtos ao atingir R$ 4.000,00; 03 (três) produtos ao atingir R$ 6.000,00; e 04 (quatro) produtos ao atingir R$ 10.000,00 ou mais em vendas no mês.
7.9. As faixas não são cumulativas, aplicando-se em cada mês apenas a mais alta atingida. O envio ocorre depois da escolha no portal, no mês seguinte ao da apuração.
CLÁUSULA 8ª – DA VIGÊNCIA, RENOVAÇÃO E INATIVIDADE
8.1. O contrato terá duração de 06 (seis) meses, contados da data de sua assinatura, podendo ser renovado mediante manifestação expressa das partes, através de aditivo.
8.2. Após 45 (quarenta e cinco) dias consecutivos sem vendas atribuídas ao cupom, o(a) CONTRATADO(A) receberá aviso automático pelo portal Creator Club e/ou pelos canais de comunicação da parceria.
8.3. Após 60 (sessenta) dias consecutivos sem vendas, a CONTRATANTE poderá encerrar o contrato de forma automática, mediante comunicação ao(à) CONTRATADO(A), formalizando-se o encerramento através do Termo de Distrato.
CLÁUSULA 9ª – DOS DIREITOS DE IMAGEM, VOZ, NOME E CONTEÚDO
9.1. O(A) CONTRATADO(A) autoriza, por 1 (um) anos, de forma não exclusiva e gratuita, a CONTRATANTE a utilizar sua imagem, voz, nome, nome artístico, @ de rede social e os conteúdos produzidos no âmbito desta contratação, exclusivamente para divulgação institucional e comercial relacionada as campanhas da marca e aos produtos da CONTRATANTE.
9.2. A autorização abrange reprodução e republicação nos canais digitais próprios da CONTRATANTE e, quando expressamente previsto no briefing ou proposta comercial, utilização em mídia paga e anúncios.
9.3. O prazo, território, canais adicionais e eventual uso em mídia paga deverão ser especificados no briefing ou instrumento comercial aplicável. Na ausência de previsão de mídia paga, esta dependerá de autorização específica entre as partes. Após o prazo, a CONTRATANTE não fará novas veiculações, ficando dispensada de remover publicações orgânicas antigas em seus perfis.
9.4. A CONTRATANTE poderá realizar cortes, adaptações técnicas de formato e inserção de elementos de identidade visual, desde que não desvirtue a manifestação original do(a) CONTRATADO(A).
CLÁUSULA 10ª – DA PROPRIEDADE INTELECTUAL E MATERIAIS DE TERCEIROS
10.1. Cada parte permanece titular dos direitos de propriedade intelectual que já possuía antes da contratação. Os direitos patrimoniais sobre materiais produzidos especificamente para a parceria serão licenciados à CONTRATANTE nos limites desta contratação.
10.2. O(A) CONTRATADO(A) declara que possui ou obterá as autorizações necessárias para todos os elementos de terceiros inseridos nos conteúdos, responsabilizando-se por reclamações decorrentes de utilização não autorizada.
10.3. O(A) CONTRATADO(A) não poderá utilizar marcas, imagens, músicas, vídeos, fotografias ou outros materiais de terceiros, de modo a criar aparência de autorização, associação ou patrocínio inexistente.
CLÁUSULA 11ª – DA NÃO EXCLUSIVIDADE E CONCORRÊNCIA
11.1. O contrato é não exclusivo. Entretanto, durante sua vigência, o(a) CONTRATADO(A) não poderá divulgar, promover ou realizar publicidade remunerada para empresas que concorram diretamente com a CONTRATANTE, ou produtos/serviços expressamente definidos como concorrentes no briefing, salvo autorização prévia e escrita.
11.2. A restrição de concorrência deverá ser interpretada de forma objetiva, limitada à categoria de produtos/serviços diretamente concorrentes e ao período de vigência, salvo prazo adicional expressamente acordado.
CLÁUSULA 12ª – DA CONDUTA, INTEGRIDADE E PROTEÇÃO REPUTACIONAL
12.1. O(A) CONTRATADO(A) deverá observar padrões de boa-fé, respeito, integridade e conduta compatíveis com a imagem comercial da CONTRATANTE.
12.2. Constituem hipóteses de rescisão por justa causa, sem prejuízo de outras previstas em lei ou neste contrato, condutas ilícitas, fraudulentas, discriminatórias, ofensivas, violação deliberada de direitos de terceiros, publicidade enganosa, manipulação fraudulenta de métricas, exposição indevida de informações confidenciais ou fatos públicos de gravidade suficiente para gerar risco relevante à reputação da CONTRATANTE.
CLÁUSULA 13ª – DA PROTEÇÃO DE DADOS PESSOAIS
13.1. As partes comprometem-se a cumprir a Lei nº 13.709/2018 (LGPD) e demais normas aplicáveis ao tratamento de dados pessoais.
13.2. Caso a parceria envolva coleta, acesso, armazenamento ou compartilhamento de dados pessoais de consumidores, as partes definirão, no briefing ou termo específico, as respectivas responsabilidades, finalidades, medidas de segurança e regras de retenção e descarte.
13.3. O(A) CONTRATADO(A) não poderá utilizar dados de consumidores obtidos em razão da parceria para finalidade própria ou diversa da autorizada, nem os compartilhar com terceiros sem base legal e autorização aplicável.
CLÁUSULA 14ª – DA CONFIDENCIALIDADE
14.1. O(A) CONTRATADO(A) manterá sigilo sobre informações comerciais, estratégicas, financeiras, ações e lançamentos ainda não publicados, preços, lançamentos, dados de clientes, métricas e demais informações não públicas às quais tenha acesso.
14.2. A obrigação de confidencialidade permanecerá após o término do contrato, enquanto a informação mantiver caráter confidencial.
CLÁUSULA 15ª – DA RESPONSABILIDADE E INDENIZAÇÃO
15.1. Cada parte responderá pelos danos que causar à outra por ação ou omissão, culposa ou dolosa, observados os limites legais.
15.2. O(A) CONTRATADO(A) responderá, especialmente, por prejuízos decorrentes de conteúdo produzido ou publicado em desacordo com este contrato, uso não autorizado de material de terceiros, violação de direitos de imagem ou propriedade intelectual de terceiros, fraude de métricas, violação de confidencialidade e tratamento irregular de dados pessoais sob sua responsabilidade.
15.3. Quando houver reclamação de terceiro relacionada a ato imputável ao(à) CONTRATADO(A), este(a) deverá cooperar com a CONTRATANTE na apuração e mitigação do problema, sem prejuízo das responsabilidades legalmente aplicáveis.
CLÁUSULA 16ª – DA SUSPENSÃO E RETIRADA DE CONTEÚDO
16.1. A CONTRATANTE poderá solicitar a suspensão ou retirada de conteúdo relacionado à parceria quando houver indício de irregularidade, erro relevante, risco jurídico, determinação de autoridade competente, alteração substancial do produto ou necessidade de proteção da marca.
16.2. Recebida a solicitação, o(a) CONTRATADO(A) deverá agir com prioridade e, sempre que tecnicamente possível, realizar a suspensão ou retirada no prazo máximo de 24 (vinte e quatro) horas, ou em prazo menor quando a urgência do caso justificar.
CLÁUSULA 17ª – DA RESCISÃO E DAS PENALIDADES
17.1. O contrato poderá ser encerrado por comum acordo, mediante registro escrito entre as partes.
17.2. Qualquer parte poderá rescindir unilateralmente o contrato mediante notificação escrita, com antecedência mínima de 05 (cinco) dias, respeitadas as entregas já aprovadas e os valores eventualmente devidos.
17.3. O contrato poderá ser rescindido imediatamente por justa causa em caso de descumprimento material, inclusive das entregas mínimas da Cláusula 2ª, fraude, violação de direitos de terceiros, publicidade irregular, violação de confidencialidade, descumprimento de exclusividade, manipulação de métricas ou dano reputacional relevante, sem prejuízo das medidas cabíveis.
17.4. No encerramento, por qualquer motivo, o cupom será desativado e serão pagas as premiações das vendas realizadas até a data do encerramento, nas condições da Cláusula 7ª.
17.5. Em caso de publicação sem autorização, quando esta for obrigatória, descumprimento injustificado de entrega ou violação de obrigação essencial, a parte prejudicada poderá exigir multa contratual de R$ 5.000,00 (cinco mil reais), sem prejuízo de perdas e danos, quando juridicamente cabíveis e sem prejuízo da análise de proporcionalidade da penalidade.
CLÁUSULA 18ª – DA AUTONOMIA DAS PARTES
18.1. A presente contratação possui natureza civil/comercial de prestação de serviços. As partes reconhecem sua autonomia empresarial e operacional, inexistindo subordinação jurídica entre elas, sem prejuízo da observância das obrigações efetivamente assumidas neste instrumento.
18.2. O(A) CONTRATADO(A) será responsável por suas próprias obrigações fiscais, previdenciárias e empresariais, observadas as retenções legalmente exigíveis pela CONTRATANTE.
CLÁUSULA 19ª – DO TÍTULO EXECUTIVO E ASSINATURA
19.1. O presente instrumento poderá constituir título executivo extrajudicial quando preenchidos os requisitos legais aplicáveis, especialmente aqueles previstos no art. 784, III, do Código de Processo Civil.
19.2. Este instrumento poderá ser assinado eletronicamente pelas partes, por meio da plataforma, que registra data, hora, IP e demais evidências de autoria e integridade, produzindo os mesmos efeitos da assinatura física, nos termos da MP nº 2.200-2/2001 e da Lei nº 14.063/2020. O portal Creator Club é a plataforma de operação da parceria (vendas, premiações, produtos e saques).
CLÁUSULA 20ª – DA INTEGRAÇÃO DOS ANEXOS
20.1. O briefing, o cronograma, o termo de adesão ao Creator Club e os demais anexos expressamente identificados integram este contrato para todos os fins. Em caso de conflito, prevalecerá este contrato quanto às regras jurídicas gerais e o briefing quanto aos aspectos operacionais específicos da parceria, salvo disposição expressa em contrário.
CLÁUSULA 21ª – DAS DISPOSIÇÕES GERAIS
a) Alterações deste contrato deverão ser realizadas por escrito, inclusive por meio eletrônico que permita comprovação.
b) A eventual tolerância de uma parte quanto ao descumprimento de obrigação não constituirá renúncia, novação ou alteração contratual.
c) A nulidade ou inexigibilidade de uma disposição não prejudicará as demais, que permanecerão válidas na extensão permitida pela legislação.
d) As comunicações relevantes entre as partes deverão ocorrer por canais que permitam comprovação do envio e recebimento.
CLÁUSULA 22ª – DO FORO
22.1. Fica eleito o foro da Comarca de Belo Horizonte/MG para dirimir controvérsias decorrentes deste instrumento, com renúncia a qualquer outro, ressalvadas as hipóteses em que a legislação determine foro diverso.
Belo Horizonte/MG, {{DATA}}.
CONTRATANTE
BOTANIKA SAUDE NATURAL LTDA
CNPJ: 65.100.830/0001-36
Representante legal:
_______________________________________
CONTRATADO(A)
{{NOME}}
CPF: {{CPF}}
_______________________________________
TESTEMUNHA 1
Nome: ______________________________ CPF: ____________________
TESTEMUNHA 2
Nome: ______________________________ CPF: ____________________
ANEXO – TERMO DE AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ
Eu, {{NOME}}, inscrito(a) no CPF sob o nº {{CPF}}, autorizo, de livre e espontânea vontade, o uso de minha imagem e voz, capturadas por meio de fotografia, vídeo ou gravação de áudio, para fins de divulgação institucional, publicidade, mídia paga, materiais educacionais e redes sociais.
Declaro estar ciente de que minha imagem e voz poderão ser reproduzidas, divulgadas, transmitidas ou publicadas em meios de comunicação como internet, redes sociais e materiais impressos, por tempo indeterminado, sem que isso implique qualquer ônus ou pagamento, agora ou no futuro.
Esta autorização é concedida em caráter gratuito, abrangendo o uso da imagem e voz em todo território nacional e no exterior, para fins relacionados ao uso da minha imagem e voz.
Estou ciente de que este termo não gera qualquer vínculo empregatício, societário, associativo ou de qualquer outra natureza, e que não terei direito a qualquer tipo de remuneração ou indenização.
Belo Horizonte, {{DATA}}.
__________________________
{{NOME}}
CPF: {{CPF}}$c$, 'migration:botanika_contracts', now()
FROM "Brand" b WHERE b."slug" = 'botanika';

INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById", "createdAt")
SELECT gen_random_uuid(), b."id", 'INFLUENCER_PJ_1', COALESCE((SELECT max(d."version") FROM "ContractDocument" d WHERE d."brandId" = b."id" AND d."kind" = 'INFLUENCER_PJ_1'), 0) + 1,
  $t$Contrato de parceria Influencer Botanika — CNPJ — 1 produto$t$, $c$CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PUBLICIDADE, PRODUÇÃO DE CONTEÚDO E LICENCIAMENTO DE DIREITOS
PARCERIA COM INFLUENCIADOR(A) DIGITAL · PESSOA JURÍDICA
ENVIO INICIAL DE 1 PRODUTO
PELO PRESENTE INSTRUMENTO PARTICULAR, de um lado, BOTANIKA SAUDE NATURAL LTDA, inscrita no CNPJ sob nº 65.100.830/0001-36, com sede à Rua Ministro Orozimbo Nonato, 215 - Loja 37 - Pavimento 5, CEP 34.006-053, Vila da Serra, Belo Horizonte/MG, neste ato representada na forma de seu contrato social, doravante denominada CONTRATANTE, e de outro lado, {{RAZAO_SOCIAL}}, inscrita no CNPJ sob o nº {{CNPJ}}, com sede na {{ENDERECO}}, neste ato representada por {{NOME}}, inscrito(a) no CPF sob o nº {{CPF}}, titular do perfil {{INSTAGRAM}}, doravante denominado(a) CONTRATADO(A);
As partes têm entre si, justo e acertado, o presente contrato, mediante as cláusulas e condições seguintes.
CLÁUSULA 1ª – DO OBJETO
O(A) CONTRATADO(A) prestará serviços de publicidade e produção de conteúdo digital, na qualidade de influenciador(a) digital, para divulgação da CONTRATANTE, e de seus produtos e/ou campanhas, mediante cupom de desconto exclusivo e remuneração por comissão sobre vendas, incluindo a autorização/licenciamento dos direitos de imagem, voz, nome e conteúdo nos limites estabelecidos neste instrumento e em seus anexos.
1.1. O escopo operacional, cronograma, produtos, canais, formatos, mensagens obrigatórias, links, cupons, hashtags e demais requisitos de cada ação de divulgação serão definidos no respectivo BRIEFING, que integrará este contrato para todos os fins.
1.2. A parceria é operada pelo portal Creator Club (creatorclub.app.br), no qual o(a) CONTRATADO(A) acompanha vendas, comissões, escolha e envio de produtos, saques e demais informações.
1.3. Durante a vigência do contrato, e pelo prazo adicional de 12 (doze) meses, os direitos aqui pactuados, de forma não exclusiva, deverão ser respeitados.
CLÁUSULA 2ª – DAS ENTREGAS E DO PADRÃO DE EXECUÇÃO
2.1. Durante toda a vigência, o(a) CONTRATADO(A) publicará, no mínimo:
a) 02 (dois) stories por semana, divulgando os produtos e o cupom e/ou link promocional fornecido pela CONTRATANTE;
b) 01 (um) reel por mês, divulgando os produtos e o cupom e/ou link promocional;
c) marcação do perfil oficial da CONTRATANTE nas divulgações, quando tecnicamente disponível e aplicável;
d) manutenção do conteúdo publicado pelo prazo definido no briefing ou, na ausência de previsão específica, durante a vigência do contrato.
2.2. O(A) CONTRATADO(A) deverá executar as entregas de forma pessoal, não podendo transferir ou subcontratar a execução principal a terceiros, sem autorização prévia e escrita da CONTRATANTE.
2.3. Conteúdos produzidos em conjunto com terceiros, especialmente Collabs, deverão ser submetidos à aprovação prévia e expressa da CONTRATANTE, antes da publicação.
CLÁUSULA 3ª – DO BRIEFING, APROVAÇÃO E AJUSTES
3.1. A CONTRATANTE poderá fornecer briefing, roteiros, identidade visual, informações técnicas, alegações comerciais permitidas, materiais e orientações de comunicação.
3.2. Nenhum conteúdo publicitário poderá ser publicado sem aprovação prévia e expressa da CONTRATANTE, e sem que esteja de acordo com os valores da empresa e o manual da marca, quando assim previsto no briefing ou quando envolver afirmações sobre produtos, resultados, características técnicas ou ofertas.
3.3. O(A) CONTRATADO(A) realizará os ajustes razoáveis solicitados pela CONTRATANTE, desde que compatíveis com o objeto contratado. A aprovação da CONTRATANTE não afasta a responsabilidade do(a) CONTRATADO(A), por elementos inseridos por iniciativa própria e não submetidos à aprovação. A divulgação de conteúdo sem a observância do manual da marca, sujeita a CONTRADATA a responsabilização civil e penal.
CLÁUSULA 4ª – DA PUBLICIDADE, TRANSPARÊNCIA E CONFORMIDADE
4.1. O(A) CONTRATADO(A) deverá identificar de forma clara, ostensiva e imediatamente perceptível ao público a natureza publicitária do conteúdo, utilizando as ferramentas e expressões adequadas à plataforma e à campanha, em conformidade com a legislação aplicável e as regras de autorregulamentação publicitária.
4.2. É vedado apresentar como espontâneo, independente ou orgânico conteúdo que tenha sido objeto desta contratação, bem como realizar afirmações falsas, enganosas, não comprovadas ou incompatíveis com as informações fornecidas pela CONTRATANTE, inclusive alegações de cura, tratamento ou prevenção de doenças.
4.3. Depoimentos, testemunhos e demonstrações deverão refletir experiência verdadeira do(a) CONTRATADO(A), não sendo permitida a criação de experiência fictícia ou promessa de resultado garantido.
4.4. É vedada a divulgação do cupom em sites agregadores de cupons, grupos de promoções ou anúncios pagos em nome do(a) CONTRATADO(A), salvo autorização prévia e escrita da CONTRATANTE.
CLÁUSULA 5ª – DAS OBRIGAÇÕES DA CONTRATANTE
a) Fornecer, em tempo razoável, informações, características, exemplares, imagens, fotos e materiais necessários à execução da parceria;
b) Informar alterações relevantes nas características dos produtos, preços, ofertas ou condições comerciais;
c) Efetuar os pagamentos e entregar os produtos previstos neste contrato, observadas as condições pactuadas;
d) Disponibilizar os links, cupons e demais elementos necessários à mensuração das vendas;
e) Realizar a apuração das vendas atribuídas ao link e/ou cupom segundo seus registros internos, que o(a) CONTRATADO(A) acompanha no portal Creator Club.
CLÁUSULA 6ª – DAS OBRIGAÇÕES DO(A) CONTRATADO(A)
a) Cumprir integralmente o objeto, briefing, cronograma e requisitos técnicos da parceria, inclusive as entregas mínimas da Cláusula 2ª;
b) Publicar os conteúdos nos canais e períodos contratados, e preservar as publicações pelo prazo acordado;
c) Utilizar apenas materiais, músicas, imagens, vídeos, fontes, marcas e demais elementos de terceiros para os quais possua autorização ou licença suficiente;
d) Não alterar, distorcer ou ampliar informações técnicas ou comerciais fornecidas pela CONTRATANTE;
e) Não utilizar bots, compra fraudulenta de seguidores, automações ilícitas ou mecanismos destinados a manipular métricas de audiência ou engajamento;
f) Apresentar, quando solicitado, evidências e relatórios disponíveis nas próprias plataformas sobre alcance, visualizações, cliques, engajamento e demais métricas relevantes;
g) Não poderá se fazer substituir por outro usuário, uma vez que foi escolhido(a) pela CONTRATANTE em razão das suas características pessoais;
h) Comunicar imediatamente qualquer reclamação relevante, remoção de conteúdo, restrição de conta ou ocorrência que possa afetar a parceria;
i) Manter seus dados cadastrais atualizados no portal Creator Club;
j) Preservar a reputação e a integridade da marca da CONTRATANTE durante a vigência da parceria.
CLÁUSULA 7ª – DA PARCERIA, REMUNERAÇÃO E PAGAMENTO
7.1. Como contraprestação inicial, a CONTRATANTE enviará ao(à) CONTRATADO(A) 01 (um) produto Botanika, escolhido por ele(a) na área “Escolher produto” do portal Creator Club.
7.2. O(A) CONTRATADO(A) receberá comissão de 15% (quinze por cento) sobre as vendas atribuídas ao seu cupom {{CUPOM}} e/ou link promocional, observadas as condições desta cláusula. O cupom concede 5% (cinco por cento) de desconto a quem compra com ele.
7.3. A venda elegível para comissão, conta no mês em que o pedido é pago. A comissão é calculada sobre o valor dos produtos do pedido, já com os descontos e sem frete, considerando apenas pedidos pagos e efetivamente atribuídos ao cupom ou link do(a) CONTRATADO(A).
7.4. O valor mínimo para saque é de R$ 100,00 (cem reais) em comissão. Quando a comissão do mês for inferior a esse valor, ela será acumulada para o mês seguinte.
7.5. O saque é solicitado pelo portal Creator Club, do dia 05 ao dia 15 de cada mês, e corresponde obrigatoriamente ao valor total da comissão disponível referente ao(s) mês(es) anterior(es), sem possibilidade de saques parciais. No caso de não cumprimento da meta de faturamento, o valor será acumulado para o período seguinte, ou enquanto se manter a promoção, até atingir o mínimo exigido, para cálculo da comissão.
7.6. Para o recebimento, o(a) CONTRATADO(A) emitirá nota fiscal de serviço no valor total do saque, adequada à sua natureza jurídica e tributária, e a anexará na área “Envio de notas”, do portal Creator Club, dentro da janela do item 7.5. O pagamento será realizado entre os dias 20 e 25 do mesmo mês, por Pix ou transferência para conta de titularidade do(a) CONTRATADO(A). Notas enviadas fora do prazo serão pagas no ciclo seguinte.
7.7. A comissão será calculada sobre vendas efetivamente atribuídas ao link promocional, consideradas as regras de cancelamento, devolução, estorno e fraude adotadas pela CONTRATANTE. Pedidos cancelados, devolvidos, estornados ou fraudulentos não geram comissão. Se a comissão já tiver sido lançada, o valor correspondente é descontado das comissões seguintes.
7.8. A renovação mensal do envio de suplementos, estará condicionada ao desempenho das vendas apurado no período anterior, conforme as vendas do mês atribuídas ao cupom, o(a) CONTRATADO(A) recebe produtos Botanika, que escolhe no portal Creator Club:
a) do 1º ao 3º mês de contrato: 01 (um) produto ao atingir R$ 500,00 em vendas dentro do mês;
b) a partir do 4º mês de contrato: 01 (um) produto ao atingir R$ 1.000,00; 02 (dois) produtos ao atingir R$ 4.000,00; 03 (três) produtos ao atingir R$ 6.000,00; e 04 (quatro) produtos ao atingir R$ 10.000,00 ou mais em vendas no mês.
7.9. As faixas não são cumulativas, aplicando-se em cada mês apenas a mais alta atingida. O envio ocorre depois da escolha no portal, no mês seguinte ao da apuração.
CLÁUSULA 8ª – DA VIGÊNCIA, RENOVAÇÃO E INATIVIDADE
8.1. O contrato terá duração de 06 (seis) meses, contados da data de sua assinatura, podendo ser renovado mediante manifestação expressa das partes, através de aditivo.
8.2. Após 45 (quarenta e cinco) dias consecutivos sem vendas atribuídas ao cupom, o(a) CONTRATADO(A) receberá aviso automático pelo portal Creator Club e/ou pelos canais de comunicação da parceria.
8.3. Após 60 (sessenta) dias consecutivos sem vendas, a CONTRATANTE poderá encerrar o contrato de forma automática, mediante comunicação ao(à) CONTRATADO(A), formalizando-se o encerramento através do Termo de Distrato.
CLÁUSULA 9ª – DOS DIREITOS DE IMAGEM, VOZ, NOME E CONTEÚDO
9.1. O(A) CONTRATADO(A) autoriza, por 1 (um) anos, de forma não exclusiva e gratuita, a CONTRATANTE a utilizar sua imagem, voz, nome, nome artístico, @ de rede social e os conteúdos produzidos no âmbito desta contratação, exclusivamente para divulgação institucional e comercial relacionada as campanhas da marca e aos produtos da CONTRATANTE.
9.2. A autorização abrange reprodução e republicação nos canais digitais próprios da CONTRATANTE e, quando expressamente previsto no briefing ou proposta comercial, utilização em mídia paga e anúncios.
9.3. O prazo, território, canais adicionais e eventual uso em mídia paga deverão ser especificados no briefing ou instrumento comercial aplicável. Na ausência de previsão de mídia paga, esta dependerá de autorização específica entre as partes. Após o prazo, a CONTRATANTE não fará novas veiculações, ficando dispensada de remover publicações orgânicas antigas em seus perfis.
9.4. A CONTRATANTE poderá realizar cortes, adaptações técnicas de formato e inserção de elementos de identidade visual, desde que não desvirtue a manifestação original do(a) CONTRATADO(A).
CLÁUSULA 10ª – DA PROPRIEDADE INTELECTUAL E MATERIAIS DE TERCEIROS
10.1. Cada parte permanece titular dos direitos de propriedade intelectual que já possuía antes da contratação. Os direitos patrimoniais sobre materiais produzidos especificamente para a parceria serão licenciados à CONTRATANTE nos limites desta contratação.
10.2. O(A) CONTRATADO(A) declara que possui ou obterá as autorizações necessárias para todos os elementos de terceiros inseridos nos conteúdos, responsabilizando-se por reclamações decorrentes de utilização não autorizada.
10.3. O(A) CONTRATADO(A) não poderá utilizar marcas, imagens, músicas, vídeos, fotografias ou outros materiais de terceiros, de modo a criar aparência de autorização, associação ou patrocínio inexistente.
CLÁUSULA 11ª – DA NÃO EXCLUSIVIDADE E CONCORRÊNCIA
11.1. O contrato é não exclusivo. Entretanto, durante sua vigência, o(a) CONTRATADO(A) não poderá divulgar, promover ou realizar publicidade remunerada para empresas que concorram diretamente com a CONTRATANTE, ou produtos/serviços expressamente definidos como concorrentes no briefing, salvo autorização prévia e escrita.
11.2. A restrição de concorrência deverá ser interpretada de forma objetiva, limitada à categoria de produtos/serviços diretamente concorrentes e ao período de vigência, salvo prazo adicional expressamente acordado.
CLÁUSULA 12ª – DA CONDUTA, INTEGRIDADE E PROTEÇÃO REPUTACIONAL
12.1. O(A) CONTRATADO(A) deverá observar padrões de boa-fé, respeito, integridade e conduta compatíveis com a imagem comercial da CONTRATANTE.
12.2. Constituem hipóteses de rescisão por justa causa, sem prejuízo de outras previstas em lei ou neste contrato, condutas ilícitas, fraudulentas, discriminatórias, ofensivas, violação deliberada de direitos de terceiros, publicidade enganosa, manipulação fraudulenta de métricas, exposição indevida de informações confidenciais ou fatos públicos de gravidade suficiente para gerar risco relevante à reputação da CONTRATANTE.
CLÁUSULA 13ª – DA PROTEÇÃO DE DADOS PESSOAIS
13.1. As partes comprometem-se a cumprir a Lei nº 13.709/2018 (LGPD) e demais normas aplicáveis ao tratamento de dados pessoais.
13.2. Caso a parceria envolva coleta, acesso, armazenamento ou compartilhamento de dados pessoais de consumidores, as partes definirão, no briefing ou termo específico, as respectivas responsabilidades, finalidades, medidas de segurança e regras de retenção e descarte.
13.3. O(A) CONTRATADO(A) não poderá utilizar dados de consumidores obtidos em razão da parceria para finalidade própria ou diversa da autorizada, nem os compartilhar com terceiros sem base legal e autorização aplicável.
CLÁUSULA 14ª – DA CONFIDENCIALIDADE
14.1. O(A) CONTRATADO(A) manterá sigilo sobre informações comerciais, estratégicas, financeiras, ações e lançamentos ainda não publicados, preços, lançamentos, dados de clientes, métricas e demais informações não públicas às quais tenha acesso.
14.2. A obrigação de confidencialidade permanecerá após o término do contrato, enquanto a informação mantiver caráter confidencial.
CLÁUSULA 15ª – DA RESPONSABILIDADE E INDENIZAÇÃO
15.1. Cada parte responderá pelos danos que causar à outra por ação ou omissão, culposa ou dolosa, observados os limites legais.
15.2. O(A) CONTRATADO(A) responderá, especialmente, por prejuízos decorrentes de conteúdo produzido ou publicado em desacordo com este contrato, uso não autorizado de material de terceiros, violação de direitos de imagem ou propriedade intelectual de terceiros, fraude de métricas, violação de confidencialidade e tratamento irregular de dados pessoais sob sua responsabilidade.
15.3. Quando houver reclamação de terceiro relacionada a ato imputável ao(à) CONTRATADO(A), este(a) deverá cooperar com a CONTRATANTE na apuração e mitigação do problema, sem prejuízo das responsabilidades legalmente aplicáveis.
CLÁUSULA 16ª – DA SUSPENSÃO E RETIRADA DE CONTEÚDO
16.1. A CONTRATANTE poderá solicitar a suspensão ou retirada de conteúdo relacionado à parceria quando houver indício de irregularidade, erro relevante, risco jurídico, determinação de autoridade competente, alteração substancial do produto ou necessidade de proteção da marca.
16.2. Recebida a solicitação, o(a) CONTRATADO(A) deverá agir com prioridade e, sempre que tecnicamente possível, realizar a suspensão ou retirada no prazo máximo de 24 (vinte e quatro) horas, ou em prazo menor quando a urgência do caso justificar.
CLÁUSULA 17ª – DA RESCISÃO E DAS PENALIDADES
17.1. O contrato poderá ser encerrado por comum acordo, mediante registro escrito entre as partes.
17.2. Qualquer parte poderá rescindir unilateralmente o contrato mediante notificação escrita, com antecedência mínima de 05 (cinco) dias, respeitadas as entregas já aprovadas e os valores eventualmente devidos.
17.3. O contrato poderá ser rescindido imediatamente por justa causa em caso de descumprimento material, inclusive das entregas mínimas da Cláusula 2ª, fraude, violação de direitos de terceiros, publicidade irregular, violação de confidencialidade, descumprimento de exclusividade, manipulação de métricas ou dano reputacional relevante, sem prejuízo das medidas cabíveis.
17.4. No encerramento, por qualquer motivo, o cupom será desativado e serão pagas as comissões das vendas realizadas até a data do encerramento, nas condições da Cláusula 7ª.
17.5. Em caso de publicação sem autorização, quando esta for obrigatória, descumprimento injustificado de entrega ou violação de obrigação essencial, a parte prejudicada poderá exigir multa contratual de R$ 5.000,00 (cinco mil reais), sem prejuízo de perdas e danos, quando juridicamente cabíveis e sem prejuízo da análise de proporcionalidade da penalidade.
CLÁUSULA 18ª – DA AUTONOMIA DAS PARTES
18.1. A presente contratação possui natureza civil/comercial de prestação de serviços. As partes reconhecem sua autonomia empresarial e operacional, inexistindo subordinação jurídica entre elas, sem prejuízo da observância das obrigações efetivamente assumidas neste instrumento.
18.2. O(A) CONTRATADO(A) será responsável por suas próprias obrigações fiscais, previdenciárias e empresariais, observadas as retenções legalmente exigíveis pela CONTRATANTE.
CLÁUSULA 19ª – DO TÍTULO EXECUTIVO E ASSINATURA
19.1. O presente instrumento poderá constituir título executivo extrajudicial quando preenchidos os requisitos legais aplicáveis, especialmente aqueles previstos no art. 784, III, do Código de Processo Civil.
19.2. Este instrumento poderá ser assinado eletronicamente pelas partes, por meio da plataforma, que registra data, hora, IP e demais evidências de autoria e integridade, produzindo os mesmos efeitos da assinatura física, nos termos da MP nº 2.200-2/2001 e da Lei nº 14.063/2020. O portal Creator Club é a plataforma de operação da parceria (vendas, comissões, produtos e saques).
CLÁUSULA 20ª – DA INTEGRAÇÃO DOS ANEXOS
20.1. O briefing, o cronograma, o termo de adesão ao Creator Club e os demais anexos expressamente identificados integram este contrato para todos os fins. Em caso de conflito, prevalecerá este contrato quanto às regras jurídicas gerais e o briefing quanto aos aspectos operacionais específicos da parceria, salvo disposição expressa em contrário.
CLÁUSULA 21ª – DAS DISPOSIÇÕES GERAIS
a) Alterações deste contrato deverão ser realizadas por escrito, inclusive por meio eletrônico que permita comprovação.
b) A eventual tolerância de uma parte quanto ao descumprimento de obrigação não constituirá renúncia, novação ou alteração contratual.
c) A nulidade ou inexigibilidade de uma disposição não prejudicará as demais, que permanecerão válidas na extensão permitida pela legislação.
d) As comunicações relevantes entre as partes deverão ocorrer por canais que permitam comprovação do envio e recebimento.
CLÁUSULA 22ª – DO FORO
22.1. Fica eleito o foro da Comarca de Belo Horizonte/MG para dirimir controvérsias decorrentes deste instrumento, com renúncia a qualquer outro, ressalvadas as hipóteses em que a legislação determine foro diverso.
Belo Horizonte/MG, {{DATA}}.
CONTRATANTE
BOTANIKA SAUDE NATURAL LTDA
CNPJ: 65.100.830/0001-36
Representante legal:
_______________________________________
CONTRATADO(A)
{{RAZAO_SOCIAL}}
CNPJ: {{CNPJ}}
Representante legal: {{NOME}}
_______________________________________
TESTEMUNHA 1
Nome: ______________________________ CPF: ____________________
TESTEMUNHA 2
Nome: ______________________________ CPF: ____________________
ANEXO – TERMO DE AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ
Eu, {{NOME}}, inscrito(a) no CPF sob o nº {{CPF}}, representante de {{RAZAO_SOCIAL}}, CNPJ {{CNPJ}}, autorizo, de livre e espontânea vontade, o uso de minha imagem e voz, capturadas por meio de fotografia, vídeo ou gravação de áudio, para fins de divulgação institucional, publicidade, mídia paga, materiais educacionais e redes sociais.
Declaro estar ciente de que minha imagem e voz poderão ser reproduzidas, divulgadas, transmitidas ou publicadas em meios de comunicação como internet, redes sociais e materiais impressos, por tempo indeterminado, sem que isso implique qualquer ônus ou pagamento, agora ou no futuro.
Esta autorização é concedida em caráter gratuito, abrangendo o uso da imagem e voz em todo território nacional e no exterior, para fins relacionados ao uso da minha imagem e voz.
Estou ciente de que este termo não gera qualquer vínculo empregatício, societário, associativo ou de qualquer outra natureza, e que não terei direito a qualquer tipo de remuneração ou indenização.
Belo Horizonte, {{DATA}}.
__________________________
{{NOME}}
CPF: {{CPF}}$c$, 'migration:botanika_contracts', now()
FROM "Brand" b WHERE b."slug" = 'botanika';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), d."brandId", 'SYSTEM', 'migration:botanika_contracts', 'contract.published', 'ContractDocument', d."id", jsonb_build_object('kind', d."kind", 'version', d."version"), now()
FROM "ContractDocument" d WHERE d."createdById" = 'migration:botanika_contracts';
