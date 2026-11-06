# Contexto de negócio da Botanika (levantado em 2026-11-06)

> Fotografia do negócio tirada direto das fontes, **só leitura**: Shopify, Meta Ads, UTMify, Supabase (produção do
> Creator Club), Google Drive e AllianceOS. Sem dados pessoais. Números mudam: conferir a data antes de usar.
> Contexto do sistema (regras, app antigo, contas) fica em `docs/CONTEXTO.md`; decisões em `docs/DECISIONS.md`.

## A marca

- **Botanika Brasil** (`botanikabrasil.com.br`): marca própria da Alliance de **suplementos** (não cosméticos).
  Posicionamento: "suplementos honestos: critério, não hype"; fórmula limpa, sem açúcar e sem glúten; a palavra
  "barato" é proibida; não cita concorrentes. Público principal: mulheres de 25 a 45 anos (cresce 35 a 55).
- Loja Shopify plano Grow, criada em 18/02/2026, **vende desde 22/06/2026** (sem Black Friday anterior).
  `taxesIncluded = false` (confirma D-TAX). Canal único: loja online.
- Catálogo: 21 produtos ativos (17 suplementos, 4 kits), de R$ 38 a R$ 253; kits de R$ 186 a R$ 362. Linha de
  manutenção lançada em set/26 (NAC, xarope, MSM, CoQ10, Cranberry, Flexia).
- Um médico parceiro aparece nos anúncios campeões; **creators e UGC não podem citá-lo** (briefing de 29/09).
- Outras marcas da Alliance: VermeFree, Revita Derma (e Shoty, sem cliente cadastrado no AllianceOS).

## Vendas da loja (Shopify, mês da venda)

| Mês | Pedidos | Líquida | Ticket | Taxa de recompra |
|---|---|---|---|---|
| jun/26 | 226 | R$ 68 mil | R$ 301 | 2% |
| jul/26 | 944 | R$ 274 mil | R$ 292 | 10% |
| ago/26 | 1.362 | R$ 401 mil | R$ 296 | 20% |
| set/26 | 1.687 | R$ 508 mil | R$ 302 | 29% |
| out/26 | 1.742 | R$ 558 mil | R$ 323 | 34% |
| nov/26 (1–6) | 300 | R$ 96 mil | R$ 326 | 44% |

- Top produtos (90 dias): Hair Botanika (R$ 320 mil), Tri[Mg] Complex (R$ 232 mil), TetraVit D (R$ 207 mil),
  Super Ômega 3 + CoQ10 (R$ 183 mil), Whey Balance 455 g (R$ 108 mil). 72% de quem compra Vitamina C leva o Hair.
- Picos: 09/09 e 10/10 (~R$ 100 mil no dia). Descontos subiram de 6% da bruta (jun) para 14% (out). Reembolsos ~0,6%.
- Origem (Shopify, 90 dias): Instagram 1.603 pedidos, sem origem 1.286, site 906, Google 704. O plano de crescimento
  diz que ~70% dos pedidos estão sem origem identificada.
- Diferença conhecida: a Shopify conta pedidos criados (944 em julho); o Creator Club conta pedidos **pagos** pelo mês
  do pagamento (E0.3: 880 em julho). Não é erro.

## Mídia paga (Meta Ads e UTMify)

- Conta ativa: **CA 01 - Botanika JUN/26** (a antiga "CA01 - BOTANIKA" foi desativada pela Meta). Só Meta tem gasto;
  nenhuma conta Google/TikTok ligada à UTMify.

| Mês | Gasto Meta | Compras (Meta) | ROAS (Meta) | CPA |
|---|---|---|---|---|
| jun | R$ 13,8 mil | 111 | 2,5 | R$ 125 |
| jul | R$ 18,2 mil | 681 | 11,3 | R$ 27 |
| ago | R$ 44,7 mil | 1.054 | 7,1 | R$ 42 |
| set | R$ 79,3 mil | 1.321 | 5,1 | R$ 60 |
| out | R$ 120,2 mil | 1.446 | 3,8 | R$ 83 |
| nov (1–6) | R$ 18,9 mil | 179 | 3,3 | R$ 106 |

- Gasto 9× maior de junho a outubro, com ROAS caindo e CPA subindo. UTMify out/26: faturamento R$ 520,6 mil, ROAS 4,3.
  **O lucro da UTMify está inflado**: custo de produto zerado nos 27 produtos e impostos/taxas não lidos.
- Anúncios campeões: imagem "Botanika chegou ao Brasil", vídeos de dor/problema (Hair "Cabelo caindo?", TetraVit D
  "Cansaço sem explicação?", Tri "Acorda cansada?") e vídeo com o médico parceiro. UGC de creators roda pouco.
- **Não há UTM por creator**: a única ligação venda ↔ creator é o cupom (Creator Club).

## Programa de creators (Creator Club, produção, 2026-11-06)

| Marca | Ativas | Cupons CREATOR / PROMO / sem tipo | Situação |
|---|---|---|---|
| Botanika | 119 (63 influencer, 24 UGC, 28 prescritor) | 68 / 21 / 0 | comissão rodando |
| VermeFree | 66 | 3 / 23 / **38** | quase nada atribuído; **sem extrato** |
| Revita Derma | 75 | 80 / 2 / 0 | 93 pedidos em out, **nenhum atribuído** (investigar) |

Botanika, vendas atribuídas (mês do pagamento):

| Mês | Pedidos | Vendas atribuídas | % da loja | Comissão líquida |
|---|---|---|---|---|
| jul/26 | 199 | R$ 64,2 mil | 25% | R$ 6,9 mil |
| ago/26 | 340 | R$ 112,7 mil | 30% | R$ 12,5 mil |
| set/26 | 292 | R$ 103,0 mil | 21% | R$ 12,1 mil |
| out/26 | 325 | R$ 125,6 mil | 23% | R$ 14,2 mil |
| nov/26 (1–6) | 94 | R$ 31,8 mil | 35% | R$ 3,0 mil |

- **Concentração**: VICTORIA tem ~64% das vendas atribuídas desde julho (R$ 319 mil); depois JULIACOLARES
  (R$ 39 mil). Em out/26, 18 de 119 ativas venderam. O plano de influencers de outubro (AllianceOS) mirava 100+ ativas
  e ~R$ 1.800 por creator madura.
- Saldo do extrato Botanika: R$ 49,7 mil (R$ 46,6 mil sacáveis). **Nenhum saque pelo sistema ainda**; pagamentos
  antigos importados (D-LEGACYPAY): Botanika 34 (R$ 31,8 mil), VermeFree 18 (R$ 5,4 mil).
- 82 vendas da Botanika (10 da VermeFree) atribuídas **aguardando taxa**: a comissão entra sozinha quando a taxa da
  creator for confirmada (`recheckBrand`); não é perda.
- Operação: 77 ações na fila (57 kits não escolhidos, 10 envios parados), 10 contratos sem assinatura, nenhuma
  campanha cadastrada no sistema.

## Como a equipe trabalha (Drive e AllianceOS)

- Pessoas: Ana Medeiros (Head de Creators, Hunter), Vitor (aprova copies e ofertas), Pedro (responsável), Sarah
  (ActiveCampaign), Bernardo (consultor do plano de crescimento), Gabriel (parceiro de marketing pago sobre o
  faturamento, com a comissão de influencers deduzida da base), Mafe (TikTok), Ítalo (manual das creators).
- Hunter: perfis com 8 mil+ seguidores (wellness, fitness, corrida) e profissionais de saúde; meta de 50 prospecções
  e 5 formulários por dia. Indicadores da Ana (KPI de 22/10): ativas, captações, respostas, formulários, contratos e
  faturamento médio por influencer.
- Planilhas ainda vivas: "Central - Creators Botanika" (cadastro) e "Pagamentos influencers - Botanika" (sem aba de
  outubro). Guardam CPF, Pix e endereço em texto aberto.
- Plano de crescimento (15/10): base de 3.898 clientes (48,8% inativos), CAC R$ 90, conversão 2,54%, frete grátis a
  partir de R$ 349; pilotos de indicação (917 clientes fiéis, crédito de R$ 40) e de 7 prescritores, ambos atrasados.
- Reuniões recentes: TikTok Shop (comissão de 10% a 19% por níveis, ativa = vendeu em 7 dias), contrato para quem não
  tem CNPJ, PF pelo cartão Alelo (D-ALELOPF), UGC com comissão sobre vídeos que rodarem no tráfego (05/11).

## Novembro 2026 ("Botanika November")

Metas: R$ 1,163 mi (1), R$ 1,396 mi (2), R$ 1,675 mi (3); ticket previsto R$ 330.

| Campanha | Datas | Oferta | Meta |
|---|---|---|---|
| Esquenta 11/11 | 02–10/11 | 8/10/12% por quantidade, frete grátis > R$ 249 | R$ 233 mil |
| 11/11 (Dia D) | 11/11 (VIP 10/11 20h) | até 40%, cashback 15% nos 100 primeiros | R$ 407 mil |
| Esquenta Week | 12–20/11 | 8/10/12% | R$ 116 mil |
| Botanika Week | 21–26/11 | 10/12/15%; creators divulgam com o cupom | R$ 175 mil |
| Botanika Friday | 27–28/11 | até 30% | R$ 140 mil |
| Cyber Monday | 30/11 | até 20% | R$ 93 mil |

- **Regra de cupom do mês (fichas do AllianceOS):** de 01 a 30/11 os cupons de **todas** as creators caem de 5% para
  **2%** e acumulam com as ofertas; nenhum outro cupom roda (nem BOTANIKA). Em 01/12 voltam a 5% e à "regra de
  acúmulo de 16/10" (não encontrada escrita).
- Dezembro ainda não planejado no AllianceOS.

## Pontos em aberto para o Creator Club (perguntar antes de mexer)

1. **Cupom de creator nova em novembro**: a aprovação cria cupom com o desconto padrão da marca (5%), contra a regra
   de 2% do mês. A volta para 5% em 01/12 é manual ou do sistema?
2. **Revita Derma**: 93 pedidos em outubro e nenhum atribuído apesar de 80 cupons de creator.
3. **VermeFree**: 38 cupons sem tipo (pendência da Ana já listada no `PROGRESS.md`).
4. **Leitura do Instagram**: 680 falhas (`instagram.profile`, a última em 03/11).
5. **Supabase (avisos)**: função `rls_auto_enable()` executável por `anon`; proteção contra senha vazada desligada no
   Auth; funções com `search_path` mutável (inclusive `tmp_import_central`, sobra de importação); 67 FKs sem índice.
6. **Pedidos das reuniões fora da fila**: contrato para quem não tem CNPJ; UGC com comissão por vídeo no tráfego;
   níveis de comissão do TikTok Shop.
