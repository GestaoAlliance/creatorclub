# Plano de melhorias (M) — painel da equipe e portal da creator

> Aprovado pelo responsável em 2026-10-22. Nasceu do mapeamento de um painel de referência (portal da creator em
> `docs/referencias/bigboom.md`; painel da equipe nas notas da conversa de 2026-10-22) e de uma revisão do que serve
> à Alliance: três marcas, liberação pelo mínimo do contrato (D-CONTRACT), Ana revisa e Juci paga, hunters, UGC e
> prescritores, AllianceOS planejando campanhas e as creators no WhatsApp.
>
> **Como usar:** uma etapa por vez, na ordem; cada uma é um PR com capturas e só vai ao ar com o OK do responsável
> (D-REVIEW). Item marcado com **decisão** espera a resposta da lista do fim antes de começar.

## O que não muda

- Regras de dinheiro do `CLAUDE.md`: comissão sobre o subtotal dos produtos, liberação no dia 1 pelo mínimo do
  contrato (não carência por venda), saque com NF do dia 1 ao 10, extrato só com inserções.
- Papéis por marca (super admin, Gestão, Pagamento, Envio, Hunter), contratos e Autentique, conferência da Ana,
  conferência rígida da NF (D-NFCHECK), várias marcas com o painel da Alliance.
- Nenhuma tela consulta a Shopify (custo e catálogo chegam pela sincronização).

## M0.0 — Menos telas (pedido do responsável em 2026-10-22, antes da Fase 0)

Painel da equipe de ~17 itens para 6 grupos (D-MENUGROUPS), sem perder função; portal da creator de 6 para 4.

| Parte | O que |
|---|---|
| M0.0.1 | **Menu em grupos com abas**: Início · Creators (Creators, Candidatas, Hunters) · Vendas (Vendas, Cupons, Desempenho) · Pagamentos (Saques, Abertura, Conferência) · Envios · Configurações (Marcas, Equipe, Contratos, Termo, Shopify, Importar) |
| M0.0.2 | **Creators** numa tela com abas Ativas · Pendentes (candidatas, aprovar/recusar na linha) · Encerradas · Hunters; revisar dados e conferência da Ana como alertas clicáveis |
| M0.0.3 | **Vendas + Cupons** e **Pagamentos** (saques, aprovação da abertura e conferência) como abas de verdade |
| M0.0.4 | **Início = dashboard** (período, vendas de creators × loja, gráfico, top creators e produtos) com a faixa "Precisa de você"; "Todas as marcas" no seletor substitui o painel Alliance; Desempenho entra aqui (sobe a M3.1) |
| M0.0.5 | **Portal com 4 telas**: Início (com cupom e link), Vendas, Saque, Envios; avisos só no sininho |

## Fase 0 — Ganhos rápidos (dados que já existem; sem decisão nova)

| # | Etapa | Lado | Ligação com o outro lado |
|---|---|---|---|
| M0.1 | **Vendas da equipe**: todas as vendas da loja, busca (pedido, cupom, creator), filtro de situação (paga, aguardando pagamento, cancelada, estornada), CSV e o motivo da atribuição (cupom de creator, PROMO não conta, teste, sem cupom) | Equipe | Mesma venda que a creator vê |
| M0.2 | **Ficha da creator**: link do cupom na loja, últimos 30 dias (vendas, pedidos, ticket), comissão em 4 partes (liberada, a liberar, aguardando pagamento, cancelada) e **linha do tempo** (cadastro, aprovação, contrato, cupom, kits, saques, observações da equipe) | Equipe | Os números do Início dela |
| M0.3 | **Lista de creators**: vendas, pedidos e última venda com ordenação; alertas clicáveis (nunca venderam, pararam há 30 dias, sem acesso ao portal, perto do mínimo); concentração de vendas | Equipe | "Sem acesso" = nunca entrou |
| M0.4 | **Portal**: "Aguardando pagamento", "Já usado", comissão e desconto dela no Início, aviso de encerramento com a data e **barra do mínimo do contrato** ("faltam R$ 200 para liberar a comissão deste mês") | Creator | Equipe vê quem está perto do mínimo (M0.3) |
| M0.5 | **Busca de creator no painel inteiro** (nome, cupom, @, CPF) | Equipe | — |

## Fase 1 — Saques que dão menos trabalho

| # | Etapa | Depende de |
|---|---|---|
| M1.1 | **Duas etapas**: em análise → Ana aprova → Juci marca como pago; aba Aprovados; selo da nota em cada linha; "conferir de novo"; resumo "comissão a pagar" (sacável, já pedido, a liberar, aguardando) | — |
| M1.2 | **Aprovação automática** quando a nota passa em todas as conferências; a Ana só vê as exceções | **decisão** 2 |
| M1.3 | **Dados para emitir a nota na tela de saque** (CNPJ, descrição, código), editáveis por marca | — |
| M1.4 | Saque mínimo | **decisão** 5 |
| M1.5 | Exportar para pagamento em lote | **decisão** 6 |

## Fase 2 — Fila de ações e WhatsApp

| # | Etapa | Depende de |
|---|---|---|
| M2.1 | **Fila de ações por creator**: alertas viram tarefas com responsável e mensagem pronta (parou de vender, contrato vencendo, perto do mínimo, kit parado), por marca e por responsável; somem quando resolvidas | **decisão** 3 |
| M2.2 | **Avisos à creator pelo WhatsApp** (comissão liberada, kit enviado, saque pago, faltam R$ X para o mínimo) no lugar de push | **decisão** 1 |
| M2.3 | **Prioridade nas candidatas**: sinais (hunter, @, CPF/cadastro repetido, cupom) para a Ana começar pelas melhores | — |

## Fase 3 — Números e retorno

| # | Etapa | Depende de |
|---|---|---|
| M3.1 | **Dashboard**: período com comparação, vendas de creators × loja inteira, gráfico diário, top creators, top produtos, esconder valores; comparação entre as três marcas | — |
| M3.2 | **Produtos e custo**: receita, pedidos e unidades por produto; custo lido da Shopify; margem e lucro do programa (custo, comissão, kits, frete) | Permissão de inventário no app da Shopify de cada marca |
| M3.3 | **Retorno por creator**: lucro que ela deixa e clientes novos × recorrentes | M3.2 |
| M3.4 | **Perguntar ao Claude** (conector somente leitura, com a visão de quem pergunta) e **resumo semanal** para a gestão | — |

## Fase 4 — Base, configurações e engajamento

| # | Etapa | Depende de |
|---|---|---|
| M4.1 | Candidatas como aba "Pendentes" dentro de Creators, aprovar/recusar na linha; ação em massa; novo creator manual | — |
| M4.2 | Tags; gerente (responsável depois da aprovação, com link próprio, unindo com os links de hunter) e ranking por gerente; aniversário | **decisões** 3, 7, 8 |
| M4.3 | Tipos de creator configuráveis e campos extras do cadastro (ex.: CRN) | **decisão** 9 |
| M4.4 | **Configurações**: padrão da Alliance e só as exceções por marca (comissão/desconto, modelo do link, NF, kit, logo, fundo e frase do login); equipe com último acesso e resetar senha | — |
| M4.5 | **Campanhas e desafios** nascidas no AllianceOS (data, cupom, ficha da oferta) e mostradas às creators com briefing, inscrição e placar | **decisão** 10 |
| M4.6 | **Link do post no portal** (conteúdo de cada creator e vendas depois do post), antes do Instagram automático | — |
| M4.7 | Desligar as planilhas, marca a marca, quando as telas cobrirem o que elas fazem | Combinado com a equipe |

## Fase 5 — Projetos grandes

| # | Etapa | Depende de |
|---|---|---|
| M5.1 | **Loja com o saldo** (vitrine, preço de creator, frete, compra que abate o saldo e vira envio) | **decisão** 11 (com a Ana) |
| M5.2 | Estoque dos kits: controle no sistema ou Bling | **decisão** 12 |
| M5.3 | Instagram automático (seguidores, engajamento, ranking) | **decisão** 13 |

## Fora do plano (de propósito)

Comissão sobre o total do pedido; carência por venda; quatro papéis genéricos no lugar dos papéis por marca; conexão
obrigatória do Instagram travando o portal; outras plataformas de venda além da Shopify (respondido: só Shopify).

## Decisões em aberto

1. WhatsApp automático: pelo SendFlow ou outro número?
2. Saque aprovado sozinho quando a nota passa em tudo, ou a Ana olha sempre?
3. Gerente: existe? Quem acompanha as creators depois de aprovadas, por marca?
4. (respondido) Vendas só pela Shopify; custo dos produtos na Shopify, por marca.
5. Saque mínimo: existe? Valor?
6. Pagamento em lote: qual banco, ou basta planilha?
7. Tags: quais e quem marca?
8. Aniversário: pedir a data de nascimento no cadastro?
9. Tipos: Influencer, UGC e Prescritor bastam?
10. Campanhas: prêmio em dinheiro entra no saldo? Venda conta pela data do pagamento?
11. Loja com saldo: preço, NF, frete, liberação e uso entre marcas.
12. Kits: estoque separado? Usam Bling nas três marcas? Quem gera o rastreio?
13. Instagram: empresa verificada na Meta?
