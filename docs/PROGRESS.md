# Progresso — Creator Club v2

> **Fonte da verdade do andamento.** Ler este arquivo inteiro no início de toda sessão.
> Atualizar ao fim de cada tarefa, no mesmo commit da tarefa.

## Onde estamos

- **Fase atual:** Lançamento 1 (creators já ativas da Botanika) → E1, E2 e E3 concluídas; E4 com código pronto
  (aceite bloqueado); E5 com código pronto (aceite E5.5 espera a Ana); E7 em andamento (E6 espera o Pagamento).
- **Próxima tarefa:** F2 (triagem e organização das candidatas), da fila "Captação no sistema" — só quando o
  responsável pedir. Pendente do responsável: divulgar o link novo `/inscricao/botanika` e os links dos hunters
  (convidar os hunters em Equipe e criar o código de cada um em Hunters); início do contrato das UGC nas fichas; domínio
  (P3) e conta no Resend (P2). Ana: 7 donas e 7 taxas a confirmar (E4.5). Pagamento: saques já pagos (E0.2, E6) e NFs
  antigas (I7).
- **Como revisar (D-REVIEW):** tela nova só vai ao ar com o OK do responsável sobre as capturas (celular, computador,
  claro/escuro) no PR; site ao vivo: https://creatorclub-six.vercel.app (cada merge na `main` vai ao ar).
- **Aguardando pessoas:** E4.5 (conferência da Ana em `/admin/cupons` e e-mails reais nas fichas); E0.2
  (Pagamento: Juci/Pâmela), E0.4 (Vitor).
- **Bloqueios e riscos:** limite de 100 deploys/dia da Vercel no plano grátis (prévias desligadas, D-PREVIEW);
  `read_all_orders` ainda não concedido ao app (carga histórica de pedidos com mais de 60 dias); `creator-hub` sem
  backup (guardar um dump privado).
- **Repositório:** `GestaoAlliance/creatorclub` (desde 2026-10-09; o antigo `Botanika-HUb/botanika-creator-club` não recebe mais commits)

## Fila de tarefas (uma por vez, nesta ordem)

Legenda: `[ ]` a fazer · `[~]` em andamento · `[x]` feito · `[!]` bloqueado · `[-]` adiado

### E0 — Inventário (só leitura; nada muda em produção)
- [x] **E0.1** Inventário do app antigo: o projeto Supabase `creator-hub` está **ativo** — levantar tabelas e
  contagens (creators, cupons, saques, termos) sem alterar nada; conferir se há backup; registrar.
  Fonte: consultas de leitura rodadas por quem tem acesso (D-E0SRC). Resultado em `docs/CONTEXTO.md`.
  Backup: nenhum (plano Free).
- [ ] **E0.2** Lista de saques já pagos a cada creator, por qualquer meio. *Depende do Pagamento (Juci/Pâmela).*
- [x] **E0.3** Shopify da Botanika: scopes concedidos ao app atual, `taxesIncluded`, volume de pedidos com cupom.
  Scopes já conhecidos pelo E0.1: `read_orders,write_discounts,read_products` (sem `read_all_orders`).
  `taxesIncluded = false` lido no Shopify em 2026-10-09 (D-TAX). Scopes do app novo: D-SHOPAPP.
  Volume (2026-10-10, pedidos pagos, mês do pagamento em São Paulo): jul 880 pagos, 643 com cupom, 204 de creator
  (23%, R$ 65,3 mil); ago 1.307 / 919 / 338 (26%, R$ 112,5 mil); set 1.587 / 896 / 291 (18%, R$ 103,0 mil).
- [x] **E0.4** Formulário de cadastro: é o "Formulário creators - Hunter" (Google Forms) que a Ana manda; ligado ao painel em CP-59 (D-ONBOARD).

> E0 foi definida no plano como primeira etapa, mas ficou fora desta fila até 2026-10-09 (corrigido).
> As tarefas E1.1–E1.3 já feitas não dependiam dela.

### E1 — Base do projeto
- [x] **E1.1** Esqueleto Next.js (App Router, TypeScript, Tailwind) junto do núcleo de domínio; `npm test`, `npm run typecheck` e `npm run build` passando.
- [x] **E1.2** Schema Prisma do núcleo (Brand, BrandIntegration, User, RoleGrant, CreatorAccount, Creator, CommissionPolicy, Coupon, Order, OrderLine, OrderAttribution, LedgerEntry, Withdrawal, File, WebhookEvent, Job, SyncRun, AuditLog, Click) com migração inicial e restrições (únicos, FKs `Restrict`, índice parcial de saque aberto). Testes de integração contra Postgres local.
- [x] **E1.3** CI no GitHub Actions: instalar, typecheck, testes (com Postgres de serviço), build.
- [x] **E1.4** Staging: projeto Supabase (sa-east-1) e Vercel (gru1) em contas da Gestão Alliance (D-ACCT); deploy automático da `main`.
  No ar em https://creatorclub-six.vercel.app (Vercel `creatorclub`, funções em `gru1`), banco no projeto Supabase
  `Creator Club` com as migrações aplicadas pelo deploy da `main`.

### E2 — Login e papéis (detalhada em 2026-10-09, a partir do plano)
- [x] **E2.1** Sessão com Supabase Auth: `@supabase/ssr`, `proxy.ts` renovando a sessão, `/entrar` (e-mail e senha,
  mínimo 10), sair, "esqueci a senha" e `/auth/callback`. `User.id` é o id do usuário do Auth (schema da E1.2).
  Login testado no staging. **"Esqueci a senha" só funciona de verdade depois do remetente de e-mail (D-SMTP, E2.4).**
- [x] **E2.2** Papéis e checagem central: matriz de permissões (D-ROLES), `loadActor` (sem `User` ou desativado =
  sem acesso; nunca liga conta por e-mail), `staffBrandFilter` para toda consulta de marca. Testes provam que cada
  papel só vê o que pode (unitários e no banco real).
- [x] **E2.3** Primeiros super admins: `scripts/grant-super-admin.mjs` (pega o usuário já criado no Supabase Auth,
  cria o `User` com o mesmo id, concede SUPER_ADMIN global, registra na auditoria; nunca mexe em senha; idempotente).
  Pedro e Ana concedidos no staging.
- [x] **E2.4** Convite e remoção da equipe: `/admin/equipe` (só super admin) gera link de convite de uso único
  (D-INVITE-LINK, 7 dias), lista pessoas e convites, tira papel, remove pessoa e cancela convite; `/convite/[token]`
  cria o login (e-mail do convite + senha escolhida) e concede o papel. Testado no staging. Envio por e-mail depois
  de D-SMTP.
- [x] **E2.5** Convite de creator (`CreatorInvite`): ligado à conta (nunca ao e-mail solto), uso único, 7 dias; quem
  edita creators da marca (ou super admin) convida; aceitar cria o login e liga à `CreatorAccount`. Mesmo link
  `/convite/...` da equipe. **O botão "Convidar" na ficha da creator entra na E4**, junto com a ficha e a confirmação
  dos e-mails reais (os importados do app antigo são falsos, `@import.creatorclub`).
- [-] **E2.6** MFA para SUPER_ADMIN e PAGAMENTO: **adiado** (D-MFA). Fácil de ligar depois, no ponto central de acesso.

### E3 — Sync Shopify (detalhada em 2026-10-09, a partir do plano)
Pedidos chegam por webhook, reconciliação e carga histórica; uma única função `processOrder` grava o pedido.
Nenhuma tela consulta o Shopify. Atribuição e extrato ficam na E5 (aqui só o pedido é gravado).
- [x] **E3.1** Fila no Postgres e worker: pegar tarefas com `FOR UPDATE SKIP LOCKED`, trava com prazo, nova
  tentativa com espera crescente, falha definitiva visível; `POST /api/jobs/run` protegido por segredo (D-CRON).
  O agendamento no pg_cron e o `JOBS_SECRET` na Vercel entram na E3.5, quando houver tarefa de verdade.
- [x] **E3.2** Credenciais e cliente do Shopify: token e segredo do webhook cifrados (AES-256-GCM, D-SHOPAPP);
  cliente GraphQL Admin com versão fixa, limite de custo e nova tentativa; nunca loga token.
- [x] **E3.3** `processOrder`: pedido do Shopify → `Order`/`OrderLine` em centavos; só grava se a versão
  (`updatedAt`) for mais nova; guarda os códigos de cupom; avisa se `taxesIncluded` mudar (D-TAX). Testes com
  pedidos de exemplo (pago, reembolso parcial, cancelado, teste, vários cupons).
- [x] **E3.4** Webhook `/api/webhooks/shopify/[marca]`: valida HMAC, grava `WebhookEvent` + `Job` na mesma
  transação e responde 200; repetido não duplica; HMAC errado = 401 sem gravar.
- [x] **E3.5** Reconciliação a cada 15 min (janela com margem de 30 min) e "sincronizar agora" (super admin);
  agendamento no pg_cron (D-CRON); `SyncRun` registra cada passada. O botão "sincronizar agora" entra na tela de
  saúde (E3.7); a ativação do pg_cron no staging segue `docs/ops/agendamento.md`.
- [x] **E3.6** Carga histórica (Bulk Operations) desde o primeiro cupom de creator (D-HIST). A **data** de início
  depende de saber quais cupons são de creator (D-CLASS, E4): a lista do app antigo mistura cupons promocionais
  (ex.: BOTANIKA, FRETEGRATIS, 20OFF). A carga na loja real roda quando ela for ligada; o botão fica na tela de saúde.
- [x] **E3.7** Loja de desenvolvimento ligada ao staging (D-DEVSTORE): app criado pelo responsável, webhooks
  registrados, pedido de teste passa por webhook e reconciliação; tela simples de saúde do sync.
  Parte 1 feita (CP-30): agendamento ligado, credenciais no modelo do Dev Dashboard, conexão da loja e tela
  `/admin/sync`. Mudou para a loja real (D-REALSTORE): `INTEGRATION_ENC_KEY` salva na Vercel e marca `botanika`
  criada. App "Creator Club - v2" criado no Dev Dashboard da Botanika (só `read_orders`; `read_all_orders` foi
  recusado como escopo inválido) e credenciais guardadas cifradas (CP-32). Falta: instalar o app na loja, conectar
  em `/admin/sync` (sem redigitar) e conferir pedidos reais chegando.

### E4 — Cupons e creators atuais (detalhada em 2026-10-09, a partir do plano)
Pronto quando toda creator ativa da Botanika tiver tipo do cupom, dona e taxa confirmados pela Ana (D-CLASS).
- [x] **E4.1** Estado "a confirmar" no banco: cupom sem tipo até ser classificado; dona (`CouponAssignment`) e taxa
  (`CommissionPolicy`) com quem confirmou e quando; o que não está confirmado nunca entra em cálculo (travas e
  testes).
- [x] **E4.2** Importação das 28 creators da Botanika (D-IMPORT): conta, participação, cupom, dona e taxa "a
  confirmar", preservando os IDs antigos (`legacyId`); idempotente; e-mails falsos (`@import.creatorclub`)
  marcados para revisão. Cupons vistos nos pedidos sincronizados e ausentes do import entram sem tipo.
  Pela tela `/admin/importar` (super admin envia o `Creator_rows.csv`, D-IMPORT); rodar no staging quando o deploy
  com a migração `pending_confirmation` entrar no ar.
- [x] **E4.3** Tela da Ana (`/admin/cupons`, quem edita creators da marca): lista de cupons com uso nos pedidos,
  classificar CREATOR/PROMO, confirmar dona e taxa; tudo na auditoria. Simples (D-ADMINUI).
- [x] **E4.4** Ficha da creator: contato (e-mail real), status, cupons e taxa; botão "Convidar" (E2.5).
- [!] **E4.5** Aceite: todas as ativas confirmadas; data do primeiro cupom de creator calculada (D-HIST) e carga
  histórica disparada (depende de `read_all_orders` para pedidos com mais de 60 dias).
  *Bloqueada por:* deploy (limite da Vercel), importação no staging pelo responsável, conferência da Ana.

### E5 — Atribuição e extrato no banco (detalhada em 2026-10-09, CP-38)
- [x] **E5.1** Atribuição gravada uma vez, com os códigos como evidência; pendente quando há dúvida (D-PENDING);
  taxa congelada no pagamento só de política confirmada; reavaliação depois de cada confirmação da Ana.
- [x] **E5.2** Lançamentos de comissão: devido − lançado por versão do pedido; estorno negativo (D-NEG); retenção de
  7 dias (D-HOLD).
- [x] **E5.3** Ajuste manual de saldo (só super admin, motivo obrigatório, auditoria).
- [x] **E5.4** Saldo e extrato por creator (disponível × a liberar × em saque), extrato por mês do pagamento
  (D-MONTH); na ficha da creator para quem vê valores.
- [x] **E5.5** Aceite: 10 creators no último mês conferidas contra o Shopify (pedidos com cupom × comissão lançada).
  Feito em 2026-10-10 (CP-83): setembro, as 10 com mais pedidos — 10 de 10 iguais (291 pedidos, R$ 101.432,82);
  1 pedido sem lançamento achado e corrigido pela rede de segurança. Ainda faltam 7 donas e 7 taxas a confirmar (E4.5).

### E7 — Portal da creator (detalhada em 2026-10-09; adiantada porque E5.5 e E6 esperam pessoas)
Visual *liquid glass* (`docs/design/DESIGN.md`), cor de destaque da marca vinda do banco (D-BRANDCOLOR). Cada tela
só mostra dados da própria creator, decidido no servidor.
- [x] **E7.1** Base visual e acesso: shell do portal (barra lateral recolhível, cabeçalho, tema claro/escuro), cor
  da marca como variável CSS a partir de `Brand` (Botanika `#323C91` + `#C4D78A`), troca de marca para quem
  participa de mais de uma; creator logada só vê a própria participação.
- [x] **E7.2** Início: indicadores (disponível, a liberar, vendas e comissão do mês pelo mês do pagamento) e
  atividade recente.
- [x] **E7.1b** "Ver como creator" (D-VIEWAS): super admin abre o portal de uma creator a partir da ficha, só
  leitura, com aviso e registro na auditoria. Para o responsável acompanhar as telas com dados reais.
- [x] **E7.3** Vendas: pedidos atribuídos, sem dados do cliente (D-SALESVIEW).
- [x] **E7.4** Extrato (virou a aba **Saque**, D-WDTAB): o mesmo `creatorStatement` da E5.4 com o acesso da creator.
- [x] **E7.5** Cupom e link: código, link `/r/[marca]/[código]` (registra o clique e leva à loja com o cupom
  aplicado, D-LINK), copiar; mantém as URLs do app antigo funcionando.
- [x] **E7.7** Saque no portal (adiantado da E8 por pedido do responsável, D-E7ORDER): pedir saque com a nota
  fiscal em PDF (upload), na janela e com o mínimo da marca; o painel do Pagamento continua na E8.
- [x] **E7.8** Envios (D-SHIPMENTS, D-SHIPADDR, D-SHIPSTATUS, D-SHIPWHO): a creator mantém o endereço na aba
  Envios; a equipe (Envio, Gestão, super admin) registra o envio com produtos da loja em `/admin/envios`, marca
  enviado (transportadora + rastreio) e entregue, ou cancela; a creator vê "Meus envios" com rastreio e "Recebi".
  Catálogo da loja (21 produtos) carregado em `Product` pelo conector em 2026-10-09 (D-SHIPPRODUCTS).
- [-] **E7.6** Aceite com creators piloto: trocado por "a Ana confere os números antes de liberar o portal para as
  creators" (D-ACCEPTANA). *Depende de:* conferência da Ana (E4.5).
- [x] **E8** Saques no painel do Pagamento (D-WDDECIDE): `/admin/saques` com a fila (Pix, CPF/CNPJ, disponível
  antes do pedido, NF em PDF por link assinado), marcar pago (lança o saque no extrato) ou recusar com motivo; a
  creator cancela o próprio pedido em análise.

### E6 — Saldo de abertura
- [x] **E6** Tela `/admin/abertura` (D-OPENFLOW): por creator, comissão no v2, "já pago" (total + como foi pago),
  saldo que fica; aprovar lança "Saldo de abertura" negativo e libera o saque. Só depois de a Ana marcar "Conferi os
  números" na ficha (D-ANAREVIEW). *Para usar de verdade:* a Ana confere cada creator e o Pagamento (Juci/Pâmela,
  E0.2) informa o que já pagou, com os comprovantes guardados para conferência e automação futura.

### Para conversar com a Ana (D-PERKS, depois do lançamento 1)
Bônus por metas (benefícios desbloqueados), gamificação, competições de vendas. Levantar com a Ana quais benefícios
já existem antes de desenhar.

### Antes do corte (pedidos do responsável em 2026-10-09, D-GAPS)
- [x] **P1** Backup dos bancos (D-BACKUP): cópia diária cifrada pelo GitHub Actions (CP-82), ligada em 2026-10-10
  (CP-84): primeira cópia do banco novo (74 tabelas com dados) e cópia única do app antigo, as duas com sucesso.
- [~] **P2** E-mail de convite e senha pelo Resend com domínio próprio (D-SMTP, D-EMAIL), antes de convidar as creators.
  Código pronto (CP-81): convite da creator e da equipe vai por e-mail ao ser gerado. Para ligar: comprar o domínio
  (P3); criar a conta no Resend e verificar o domínio (registros DNS); pôr `RESEND_API_KEY` e `EMAIL_FROM` na Vercel;
  configurar o SMTP do Supabase Auth com o Resend ("esqueci a senha"); testar com um e-mail da equipe.
- [ ] **P3** Domínio do projeto (o responsável compra) e os links `/r/...` antigos: o domínio do app antigo precisa
  redirecionar para o v2, senão os links nas bios quebram no corte.
- [x] **P4** Termo de aceite da creator no primeiro acesso ao portal (D-TERMS): portal bloqueado até aceitar; nome
  completo + CPF + data, IP e navegador gravados; versões (texto novo pede novo aceite); `/admin/termo` (super admin).
  Texto v1 é rascunho com as regras já combinadas: recomenda-se revisão de um advogado.

### Captação no sistema (decidido pelo responsável em 2026-10-10, D-SIGNUP; uma por vez, nesta ordem)
- [x] **F1** Formulário de inscrição próprio (`/inscricao/[marca]`), mesmas perguntas do Google, link do hunter.
- [ ] **F2** Triagem: organizar as candidatas (sem critérios automáticos por enquanto; evitar repetidas).
- [ ] **F3** Aprovar com um clique: creator, cupom na Shopify (D-COUPONCREATE) e convite do portal; recusar com resposta.
- [ ] **F4** Contrato (Autentique ou outro) e liberação do painel depois da assinatura.

### Inventário do Drive (decidido pelo responsável em 2026-10-10; uma por vez, nesta ordem)
- [x] **I1** Aviso de 60 dias sem vendas (D-IDLE60): a equipe vê no painel e na lista quem está há 60 dias sem venda.
- [x] **I2** Conferência da NF no pedido de saque (D-NFCHECK): tomador = Botanika, valor = total do saque; a data de
  emissão não bloqueia. Chave única por nota.
- [x] **I3** Saque de creator sem CNPJ (D-PFRECEIPT): recibo gerado pelo sistema e aceito eletronicamente no lugar da NF;
  Pix só em chave do próprio CPF. Retenção de imposto: confirmar com a contabilidade antes de ligar.
- [x] **I4** Formulário de Captação Botanika + VermeFree como entrada de candidatas (D-CAPTACAO), com as 110 respostas
  antigas importadas.
- [x] **I5** Link do formulário por hunter (D-HUNTERLINK): a candidata chega marcada com quem a trouxe.
- [x] **I6** UGC com cupom próprio, sem comissão (D-UGCCOUPON), e meta de vídeos no total do ciclo (D-UGCQUOTA). Escopo
  escolhido: cupom + contador de vídeos; o sistema cria o cupom na Shopify; a UGC vê no portal só as vendas.
  - [x] **I6a** Criar cupom na Shopify pela ficha (D-COUPONCREATE); permuta sem taxa ganha 0%.
  - [x] **I6b** Ciclo UGC e contador de vídeos na ficha (meta no total do ciclo, D-UGCVIDEOS).
  - [x] **I6c** Portal da UGC: só vendas, cupom e link (sem saldo e saque, D-UGCPORTAL).
- [!] **I7** NFs antigas: só 3 de 20 cupons pagos têm NF no Drive; conferir com o Pagamento onde estão as outras.
- [x] **I8** Perguntas abertas respondidas: ✅/❌ nas pastas de entrega UGC (D-UGCMARKS) e "collab" na Central (D-COLLAB);
  início do contrato das UGC fica com a equipe (D-UGCSTART).
- [x] **I9** Importar os vídeos das pastas de entrega das UGC no Drive (D-UGCIMPORT): 99 vídeos de 14 UGC.

### Depois (detalhar quando chegar lá)
E9 Corte.
Detalhe de cada uma no plano: https://claude.ai/code/artifact/903360ba-744d-409e-97e8-dc11dbe57f52

## Checkpoints (mais recente primeiro)

### CP-87 — 2026-10-10 — Formulário de inscrição do próprio sistema (F1)
- **Decidido:** D-SIGNUP (um formulário só, mesmas perguntas, CNPJ e razão social opcionais, aceite obrigatório, sem
  triagem por enquanto). Nova fila "Captação no sistema" (F1 a F4).
- **Feito:** migração `site_signup` (`consentAt` e `ipHash` na candidata; trava `CreatorApplication_site_consent`;
  `HunterClick_form` aceita `inscricao`; índice parcial para o limite de envios). Perguntas e validação puras
  (`src/domain/signup.ts`, títulos iguais aos do Google, então a leitura é a mesma), `src/lib/onboarding/signup.ts`
  (robô, limite de 5 por hora por aparelho, mesmo e-mail no dia não duplica, hunter do link), página pública
  `/inscricao/[marca]` (o que foi digitado não se perde em erro). Link do hunter `/f/[marca]/inscricao/[codigo]`. Tela
  Hunters: link de inscrição de cada hunter e o link geral; saiu o passo de colar o link do Google. Candidatas mostram a
  origem ("Inscrição pelo site", "Captação (Google)", "Hunter (Google)").
- **Verificado:** 2 unitários e 2 de integração novos (fluxo completo, robô, erros, limite, trava pelo nome).
  Capturas com a página de verdade rodando num banco local (formulário, erro, recebida, Hunters). `npm test`,
  `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-86 — 2026-10-10 — Ficha da creator organizada para o dia a dia
- **Decidido:** D-FICHA (pedido do responsável: tirar os blocos que não servem e organizar para o uso diário).
- **Feito:** `view.tsx` em duas colunas independentes; blocos sem uso para quem é só UGC escondidos; `ChecklistForm`
  com `noPayout` (campo oculto mantém o "Recebe como" guardado); cartão "Vídeos (UGC)" recebe o bloco da Central com o
  link da pasta; "Taxa de comissão" vazia diz "Nenhuma taxa definida".
- **Verificado:** capturas de UGC e influencer (computador e celular) sem erros no console. `npm test`,
  `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-85 — 2026-10-10 — Permissões novas da Shopify e recuperação de chave cancelada
- **Feito (responsável):** versão `creator-club-v2-2` do app com `read_orders`, `read_all_orders`, `read_discounts`,
  `write_discounts`, `read_products`, `read_draft_orders`, `write_draft_orders` e `read_inventory`; app reinstalado e
  loja reconectada em `/admin/sync` (5 webhooks cadastrados de novo).
- **Achado:** a reinstalação cancelou a chave de acesso guardada em memória (até 24 h) e a reconciliação passou a dar
  401 sem se recuperar. **Correção:** `refreshingClient` (em 401 esquece a chave, pede outra e tenta de novo uma vez).
  E o aviso de permissões entende que `write_x` já inclui `read_x` (o Shopify não lista o `read_x` nesse caso).
- **Verificado:** 2 unitários novos (recupera de 401; não entra em laço se a chave nova também for recusada).
  `npm test`, `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-84 — 2026-10-10 — Backup ligado (P1)
- **Feito:** segredos `BACKUP_PASSPHRASE`, `BACKUP_OLD_DATABASE_URL` e `BACKUP_DATABASE_URL` no GitHub (pelo
  responsável). No banco novo, usuário `backup_reader` só de leitura (`pg_read_all_data` + `BYPASSRLS`; conferido: lê
  dados, logins e Storage; não insere, altera, apaga nem cria), para não usar a senha principal. Primeiras cópias:
  app antigo (execução 38074439007) e banco novo (execução 38074894461, 74 tabelas com dados, 1,2 MB cifrado).
- **Falta (responsável):** baixar a cópia do app antigo e guardar no Drive da empresa (o artefato expira em 08/01/2027).

### CP-83 — 2026-10-10 — Conferência de setembro contra o Shopify (E5.5) e rede de segurança da comissão
- **Feito:** as 10 creators com mais pedidos pagos em setembro (fuso de São Paulo) conferidas pedido a pedido contra a
  loja (só leitura): mesmos pedidos e mesma soma do subtotal atual em 10 de 10 (291 pedidos, R$ 101.432,82). Regra da
  atribuição conferida (cupons promocionais antes do da creator não levam o pedido). Comissão = subtotal × taxa em
  9 de 10; a outra tinha 1 pedido pago, com dona e taxa congelada, **sem lançamento** (R$ 82,77; único em 909 desde
  junho) e nada o reavaliava. Correção: `sweepUnpostedCommissions` roda a cada reconciliação (15 min) e lança o que
  faltar (idempotente). Achados da busca na Shopify: `discount_code:` só acha o primeiro código do pedido e datas sem
  hora usam o fuso da loja (anotado para conferências futuras).
- **Verificado:** 1 teste de integração novo (lança uma vez; pendente, cancelado e teste ficam de fora).
  `npm test`, `npm run test:integration`, `npm run typecheck` e `npm run build` passando. Depois do deploy: conferir
  que o pedido sem lançamento foi lançado.

### CP-82 — 2026-10-10 — Backup cifrado diário pronto para ligar (P1)
- **Decidido:** D-BACKUP (GitHub Actions, cifra AES-256 com senha fora do repositório, 90 dias; cópia única do app
  antigo pelo mesmo caminho).
- **Feito:** `scripts/backup.sh` (pg_dump dos esquemas `public`, `auth` e `storage`, confere a cópia, cifra com `gpg`);
  `.github/workflows/backup.yml` (diário às 3h17 de São Paulo e à mão com alvo `creator-club` ou `app-antigo`; cliente
  do Postgres 17; ações fixadas por hash); `docs/BACKUP.md` (segredos, como restaurar, cuidados). De passagem: a tela de
  sync mostra sempre as permissões que faltam no app da Shopify e para que servem (incluídas `read_discounts` e
  `write_discounts`, que a criação de cupom usa).
- **Verificado:** ida e volta no banco local (copiar → cifrar → abrir → restaurar: mesmas 39 tabelas, 10 gatilhos e 277
  travas/chaves, com `btree_gist` criada antes; senha errada não abre). Este ambiente não alcança o banco de produção:
  a primeira cópia real roda no GitHub depois dos segredos. `npm test`, `npm run test:integration`,
  `npm run typecheck` e `npm run build` passando.

### CP-81 — 2026-10-10 — Convite por e-mail pronto para ligar (P2, código)
- **Decidido:** D-EMAIL (Resend com o domínio do projeto, que espera o P3; convite vai por e-mail ao ser gerado; link
  segue na tela). D-SMTP respondida.
- **Feito:** textos dos e-mails (`src/domain/email.ts`, com escape de HTML); remetente Resend por `fetch` com chave de
  idempotência por convite (`src/lib/email/sender.ts`; sem `RESEND_API_KEY`/`EMAIL_FROM` não envia nada);
  `src/lib/team/invite-email.ts` (envia, marca `emailedAt`, audita `invite.emailed` ou `invite.email_failed`; falha
  não desfaz o convite). Migração `invite_emailed` (`emailedAt` em `CreatorInvite` e `StaffInvite`). Ficha e Equipe
  avisam se foi por e-mail; convites pendentes da equipe mostram "enviado por e-mail". `.env.example` atualizado.
- **Falta (responsável):** domínio (P3), conta no Resend e DNS; depois eu configuro as variáveis e o SMTP do Auth.
- **Verificado:** 6 unitários novos (textos, escape, remetente com `fetch` falso); 3 de integração (envio marcado e
  auditado, falha sem desfazer, sem remetente não faz nada, convite da equipe). Nenhum e-mail real enviado. Migração ×
  schema sem divergência. `npm test`, `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-80 — 2026-10-10 — Vídeos das UGC importados do Drive (I9)
- **Decidido:** D-UGCMARKS corrigida (✅/❌ é da pasta, não do vídeo) e D-UGCIMPORT detalhada (todos os vídeos, cópias
  repetidas contam uma vez).
- **Feito:** leitura (só leitura) das 17 pastas: 138 itens, 112 vídeos, 13 cópias repetidas, 3 pastas vazias. Gravados
  em produção 99 vídeos de 14 UGC (30/07 a 02/10/2026; 55 com produto), por `importacao-drive`, com 14 registros na
  auditoria (`ugc.videos_imported`); conferido por soma (md5) contra o arquivo preparado. Ficha e lista: UGC sem início
  de contrato mostra quantos vídeos tem ("9 vídeos · sem datas do contrato") em vez de "fora do ciclo".
- **Verificado:** `npm test`, `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-79 — 2026-10-10 — Perguntas abertas da UGC respondidas (I8)
- **Decidido:** D-UGCMARKS (✅ aprovado, conta; ❌ refazer, não conta), D-COLLAB (post em collab no Instagram; só
  informação), D-UGCSTART (equipe preenche o início do contrato das UGC na ficha), D-UGCIMPORT (importar os vídeos das
  pastas do Drive). Nova tarefa I9.
- **Visto em produção:** migração `ugc_videos` aplicada; 24 UGC na Botanika (23 só UGC), 23 sem início de contrato, 17
  com pasta de vídeos; nenhuma ainda com login no portal.
- **Verificado:** só documentação.

### CP-78 — 2026-10-10 — Portal de quem é só UGC (I6c)
- **Decidido:** D-UGCPORTAL (só quem é apenas UGC; abas Início, Vendas, Cupom e Envios; vendas com número, data e valor;
  sem termo por enquanto). I6 concluída.
- **Feito:** `PortalContext.ugcOnly`; menu sem Saque (o filtro roda no componente de cliente do menu); Início
  simplificado (vendas e pedidos do mês, cupom); Vendas sem taxa e comissão (situação "Paga" ou estorno; gráfico sem
  comissão); termo não é pedido; saque recusado no servidor e páginas de saque fora do ar; ficha sem o cartão do termo
  para quem é só UGC. Corrigido de passagem: o eixo do gráfico de vendas dava erro de hidratação ("R$ 500,0" no
  servidor × "R$ 500" no navegador).
- **Verificado:** 1 unitário novo; 2 de integração novos (portal simplificado, sem termo, saque recusado, influencer +
  UGC com portal completo, visualização da equipe). `npm test`, `npm run test:integration`, `npm run typecheck` e
  `npm run build` passando; capturas sem erros no console.

### CP-77 — 2026-10-10 — Contador de vídeos da UGC (I6b)
- **Decidido:** D-UGCVIDEOS (ciclo = período do contrato; meta por creator na ficha, começa em 9; um registro por vídeo
  com link). Onde mais aparece ficou sem preferência: ficha e selo na lista.
- **Feito:** migração `ugc_videos` (`Creator.ugcVideoGoal`; tabela `UgcVideo` com RLS; travas `Creator_ugc_video_goal`,
  `UgcVideo_values`, índice `UgcVideo_url_once` e gatilho `UgcVideo_only_remove`: nada é apagado, só retirado uma vez).
  Regras puras (`src/domain/ugc.ts`), `src/lib/creators/ugc.ts` (registrar, retirar, meta, ciclo de cada UGC, com
  auditoria). Ficha: cartão "Vídeos (UGC)" com contador, barra, vídeos e formulários. Lista: selo "vídeos 5/9".
- **Verificado:** 3 unitários novos; 3 de integração novos (fluxo completo, permissão, travas pelo nome). Migração ×
  schema sem divergência. `npm test`, `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-76 — 2026-10-10 — Criar cupom na Shopify pela ficha (I6a)
- **Decidido:** D-COUPONCREATE (escopo do I6 escolhido pelo responsável: cupom + contador de vídeos; o sistema cria o
  cupom na Shopify; portal da UGC só com vendas). I6 dividido em I6a, I6b e I6c.
- **Feito:** `src/lib/coupons/create.ts` (`discountCodeBasicCreate`: todos os produtos, qualquer cliente, combinável com
  pedido, produto e frete; depois do OK grava cupom CREATOR, dona confirmada, taxa 0% se permuta sem taxa e auditoria
  `coupon.created_in_shopify`). Ficha → Cupons: formulário "Criar cupom na Shopify" (código e desconto) para quem edita
  creators. Mensagens claras para código já usado (banco ou loja), recusa da Shopify e app sem permissão.
- **Falta (responsável):** liberar `write_discounts` e `read_discounts` no app da Shopify (Dev Dashboard → versão nova
  do app) e reconectar a loja em `/admin/sync`.
- **Verificado:** 4 testes de integração novos com Shopify falso (nenhum toca a loja real, D-REALSTORE): sucesso com
  mutação e `combinesWith` conferidos, recusas antes da Shopify, código já usado, erros da Shopify sem gravar nada.
  `npm test`, `npm run test:integration`, `npm run typecheck` e `npm run build` passando.

### CP-75 — 2026-10-10 — Link do formulário por hunter (I5)
- **Decidido:** D-HUNTERLINK detalhada: hunter é quem tem o papel Hunter na equipe; link curto do sistema
  `/f/[marca]/[formulario]/[codigo]` que conta o clique e abre o Google Forms com a pergunta "Código de quem te convidou"
  pré-preenchida; vale para os formulários Hunter e Captação.
- **Feito:** migração `hunter_links` (`HunterLink`, `HunterClick` só de inserção, `FormLink`, e na candidata `hunterCode` e
  `hunterLinkId`; RLS e travas `HunterLink_code_format`, `HunterClick_form`, `FormLink_values`). Regras puras do código e
  do link (`src/domain/hunter.ts`), `src/lib/onboarding/hunters.ts`, rota `/f/...`. Tela `/admin/hunters` (menu
  "Hunters", quem edita creators): criar o link de cada hunter, copiar os dois links, cliques em 30 dias, candidatas e
  aprovadas; colar o link pré-preenchido de cada formulário. Candidatas: "Trazida por <hunter>".
- **Falta (responsável):** adicionar a pergunta "Código de quem te convidou" (resposta curta, opcional) nos dois
  formulários, gerar o link pré-preenchido com CODIGO e colar em `/admin/hunters`; convidar os hunters em Equipe.
- **Verificado:** 2 unitários novos; 2 de integração novos (fluxo completo, permissão, travas pelo nome); migração ×
  schema sem divergência; typecheck; build.

### CP-74 — 2026-10-10 — Scripts dos formulários instalados; correção de duplicada
- **Feito (responsável):** scripts instalados nos formulários Hunter e Captação (`instalar` + `enviarTodas`). Chegaram as
  9 respostas do Hunter e 6 da Captação.
- **Feito (produção):** das 6 da Captação, 1 era a mesma resposta já importada (o nome veio com outra codificação e
  escapou da checagem) e 4 eram respostas repetidas mais antigas da mesma pessoa; as 5 foram recusadas com o motivo
  (nada apagado). Fica 1 resposta nova de verdade.
- **Corrigido:** a checagem de "já importada da planilha" compara só formulário + segundo, sem o nome.
- **Verificado:** teste de integração cobre nome com espaço a mais; typecheck.

### CP-73 — 2026-10-10 — Formulário de Captação como entrada de candidatas (I4)
- **Decidido:** D-CAPTACAO detalhada: respostas antigas entram; quem já é creator (mesmo CPF ou e-mail) entra como
  "Aprovada" ligada à ficha, o resto como "Nova"; repetidas entram uma vez (a mais recente); o STATUS da planilha vira
  observação; quem quer Botanika e VermeFree entra na Botanika com o selo "também VermeFree".
- **Feito:** migração `application_captacao` (`storiesViews`, `brandsWanted`, `collabInterest`, `note`). Leitura das
  perguntas da Captação; perguntas sem campo próprio aparecem em "Mais respostas". Rota `/api/forms/[marca]/captacao`
  (mesmo handler do Hunter, `src/lib/onboarding/form-route.ts`) e script `docs/forms/captacao-apps-script.gs`. Resposta
  que já veio da planilha (`planilha:` + segundo) não duplica quando o script manda as antigas. Candidatas: origem
  (Hunter/Captação), selo VermeFree, views, collab e observação; cartão separado em `card.tsx`.
- **Feito em produção (2026-10-10):** 112 respostas importadas da planilha (116 linhas, 4 repetidas): 7 já eram creators
  ("Aprovada", ligadas à ficha), 105 "Nova"; 10 com observação do STATUS; 92 com o selo VermeFree. Conferido por soma de
  verificação contra a planilha. Duas respostas no mesmo segundo: a segunda entrou como `planilha:<segundo>-2`.
- **Verificado:** 2 unitários novos; 1 de integração novo (campos novos, respostas extras, importada não duplica);
  migração × schema sem divergência; typecheck; build.

### CP-72 — 2026-10-10 — Saque de pessoa física com recibo (I3)
- **Decidido:** D-PFRECEIPT detalhada: sem retenção de imposto; a equipe marca "recebe como pessoa física" na ficha;
  qualquer chave Pix, e o Pagamento confere o nome no app do banco antes de pagar.
- **Feito:** migração `withdrawal_receipt` (`Creator.receivesAsIndividual`, `Brand.legalName` com a razão social da
  Botanika, método `RECEIPT_PIX`, tabela `WithdrawalReceipt` só de inserção com RLS e trava `WithdrawalReceipt_values`).
  Regra pura `receiptText` e `brlInWords` (valor por extenso). Pedido de saque com núcleo único para nota e recibo
  (`requestWithdrawalWithReceipt`): nome completo, CPF válido (igual ao da ficha; ficha sem CPF recebe o digitado),
  aceite; texto aceito, IP e navegador gravados. Portal: aba Saque explica o recibo; o passo a passo vira "confira e
  aceite o recibo". Pagamento: selo "pessoa física · recibo", aviso para conferir o nome do Pix e página do recibo
  (`/admin/saques/recibo/[id]`, CPF mascarado sem `personal.fiscal`). Ficha: "Recebe como" no cartão de contrato.
- **Verificado:** 2 unitários novos; 3 de integração novos (fluxo completo com ficha, portal, Pagamento e permissão;
  CPF diferente; travas pelo nome); migração × schema sem divergência; typecheck; build.

### CP-71 — 2026-10-10 — Conferência da NF no pedido de saque (I2)
- **Decidido:** D-NFCHECK detalhada: nota errada bloqueia na hora com o motivo; nota que o sistema não lê entra marcada
  "conferir a nota" para o Pagamento; confere tomadora, valor, emissor = CNPJ da ficha (ficha sem CNPJ recebe o da
  nota), código 17.06 e chave nunca usada (recusado ou cancelado libera a nota).
- **Feito:** leitura do DANFSe (NFS-e padrão nacional) com `unpdf` 1.8.1 (`src/lib/withdrawals/nf.ts`), regra pura
  `parseNfseText`/`checkNf` (`src/domain/nf.ts`). Migração `withdrawal_nf_check`: `Withdrawal.nfAccessKey` e
  `nfCheck` (OK/MANUAL), travas `Withdrawal_nf_access_key_format` e `Withdrawal_nf_access_key_once`. Pagamento: selos
  "nota conferida"/"conferir a nota" e aviso. Portal: instrução da nota cita código 17.06, CNPJ do cadastro e a
  conferência.
- **Verificado:** leitor testado com uma NF real do Drive (fora do repositório; passou como conferida); 5 unitários
  novos (PDF gerado no teste com dados fictícios); 5 de integração novos (nota certa, cada motivo de bloqueio, nota
  ilegível, nota repetida e liberada após recusa, travas pelo nome); migração × schema sem divergência; typecheck; build.

### CP-70 — 2026-10-10 — Aviso de 60 dias sem vender (I1)
- **Decidido:** D-IDLE60 detalhada (quem nunca vendeu conta desde o início do contrato; sem data, desde a entrada no
  sistema; aparece no painel, na lista e na ficha). Ficam fora do aviso: pausadas, desligadas e contrato de permuta.
- **Feito:** regra pura `idleStatus` (`IDLE_WARN_DAYS` = 60); `lastSaleAt` (último pagamento de pedido elegível
  atribuído). Painel: cartão "Sem vender" com atalho para `/admin/creators?semvenda=1`. Lista: selo "sem vender há N
  dias" / "nunca vendeu · N dias" e filtro. Ficha: última venda e dias sem vender no cartão de contrato.
- **Verificado:** 1 unitário novo; 1 de integração novo (venda cancelada não conta, nunca vendeu, contrato recente,
  pausada e permuta fora, painel); typecheck; build.

### CP-69 — 2026-10-10 — Perguntas do inventário do Drive respondidas
- **Decidido:** D-RATECONTRACT, D-IDLE60, D-PRESCNF, D-PFRECEIPT, D-NFCHECK, D-UGCQUOTA, D-UGCCOUPON, D-CAPTACAO,
  D-HUNTERLINK (respostas do responsável às perguntas 2 a 10 do doc "Inventário do Drive — Creator Club Botanika").
- **Feito:** fila "Inventário do Drive" (I1–I8) com o trabalho que sai dessas decisões. Só documentação.
- **Falta:** saber onde estão as NFs antigas (I7) e o significado de ✅/❌ e "collab" (I8).

### CP-68 — 2026-10-10 — Termo v3 publicado
- **Decidido:** texto do termo v3 aprovado pelo responsável (D-TERMS): mínimo de vendas do contrato de cada creator
  (no lugar de R$ 500/R$ 1.000 fixos), permuta sem comissão (3.6), kit mensal escolhido no portal (6) e vigência (8).
- **Feito:** migração `terms_v3` (nova versão do termo da Botanika + auditoria `terms.published`). Todas as creators
  aceitam de novo no próximo acesso.
- **Verificado:** migração testada num banco local (versão criada com o texto novo); migração × schema sem divergência.

### CP-67 — 2026-10-10 — Kit mensal: a creator escolhe os produtos no portal
- **Decidido:** D-KIT (o fechamento do mês concede o kit pela faixa de vendas do mês no contrato da creator; ela
  escolhe os produtos no portal; o kit espera sem prazo).
- **Feito:** migração `kit_grants` (tabela `KitGrant` com RLS e travas `KitGrant_month_format`, `KitGrant_values`,
  `KitGrant_chosen`). Regra pura `kitProductsFor` (faixa mais alta alcançada; faixa com teto só até o teto) e
  `validateKitChoice`. O fechamento (`closeBrandMonth`) grava o kit de cada creator ativa cujo modelo tem faixas.
  Portal, aba Envios: cartão "Você ganhou N suplementos", escolha com + e −, pede o endereço completo; confirmar cria
  o envio "Preparando" com a cópia do endereço e marca o kit como escolhido (uma vez só; auditado). Equipe: o painel
  mostra "Kits a escolher" no cartão de Envios; o envio aparece em `/admin/envios` como qualquer outro.
  Migração `kit_tier_gap`: no modelo influencer out/26, de R$ 4.000 a R$ 9.999,99 continua com 2 suplementos.
- **Observação:** setembro já fechou; os primeiros kits saem no fechamento de 01/11 (vendas de outubro).
- **Verificado:** 4 unitários novos; 3 de integração novos (fluxo completo, faixa mais alta e quem não ganha, travas
  pelo nome); migração × schema sem divergência; typecheck; build.

### CP-66 — 2026-10-10 — Cada creator segue o contrato que assinou
- **Decidido:** D-CONTRACTVER (cada creator segue a versão de contrato que assinou; quem não tem contrato no Drive
  segue o modelo de R$ 1.000 até a equipe trocar na ficha; DRANAI, prescritora com contrato de influencer, segue o
  de influencer). Inventário completo do Drive no doc "Inventário do Drive — Creator Club Botanika".
- **Feito:** migração `contract_templates` (tabela `ContractTemplate` com RLS e trava `ContractTemplate_values`;
  5 versões da Botanika: influencer set/26 R$ 1.000, influencer com faixas próprias, influencer out/26 R$ 500,
  prescritor, UGC permuta sem comissão; `Creator.contractTemplateId`; padrão da marca passa a R$ 1.000; cada creator
  ligada ao modelo pelo tipo). O fechamento mensal e o progresso usam o mínimo do modelo (sem comissão = não libera).
  Ficha: "Modelo de contrato assinado" no cartão de contrato.
- **Falta (produção, depois do deploy):** ligar RAFA ao modelo de faixas próprias e DRANAI ao de influencer.
- **Verificado:** unitário novo; 3 de integração novos (mínimo do modelo, permuta sem liberação, trava pelo nome,
  modelo de outra marca); migração × schema sem divergência; dados da migração conferidos num banco local; typecheck.

### CP-65 — 2026-10-10 — Histórico de envios importado das planilhas
- **Decidido:** D-SHIPIMPORT (envios com rastreio entram como entregues; data = "último pedido" da Central quando
  existe, senão a data de criação da planilha com a observação "data aproximada"; "Whey" sem sabor = Whey Sem Sabor;
  linhas sem rastreio entram como "Preparando"; endereço do envio = texto da planilha).
- **Feito:** `formatAddress` aceita o endereço em texto livre dos envios importados (`ShipmentAddress`). Importação em
  produção (Drive → banco): 46 envios (42 entregues, 4 preparando), 116 itens casados com o catálogo, 24 com data
  aproximada. 2 linhas sem creator no sistema ficaram de fora (passadas ao responsável).
- **Verificado:** unitário novo (endereço em texto); typecheck; testes.

### CP-64 — 2026-10-10 — Contrato e checklist na ficha (Central), com aviso de vencimento
- **Decidido:** D-CHECKLIST e D-CENTRAL. Cartão "Contrato e checklist" na ficha (início, fim — vazio = início + 6
  meses, UGC 3 —, contrato assinado, cupom cadastrado, seguimos no Instagram, grupo, etiquetada, observação), editável
  por quem edita creators. Aviso: cartão "Contratos" no Início (vencem em 30 dias / vencidos), selo na lista de
  creators e filtro "Só contratos vencendo ou vencidos"; nunca desliga sozinho. Importação da Central: criar as 20
  creators que não existem (ativas, cupom de creator 15% / desconto 5% confirmados, saque liberado), para quem existe
  só preencher dados vazios, e a aba UGC como creators tipo UGC (sem cupom) com pasta, situação dos vídeos e pedido.
- **Feito:** migração `contract_checklist` (colunas na `Creator`, `CreatorAccount.instagram`, trava
  `Creator_contract_period`). `src/domain/contract.ts` (meses por tipo, soma de meses, situação do contrato) e
  `src/lib/creators/contract.ts` (`updateChecklist`, com auditoria `creator.checklist`). Instagram na ficha.
- **Importado em produção (2026-10-10):** 20 creators/prescritores novos, 27 existentes completados (só campos
  vazios), 23 UGC novas e 1 existente com tipo UGC; 29 com datas de contrato. 4 linhas sem cupom e sem cadastro no
  sistema ficaram de fora (passadas ao responsável).
- **Verificado:** 3 unitários e 3 de integração novos (trava pelo nome, contagem do Início); typecheck; testes.

### CP-63 — 2026-10-10 — Pagamentos da planilha no sistema e sugestão do saldo de abertura
- **Decidido:** D-LEGACYPAY (a planilha "Pagamentos influencers" entra no sistema, pagamento por pagamento, só com os
  valores; tudo nela foi pago, segundo o responsável; a linha da LUDMILLA de R$ 14,16 repetida em julho e agosto foi
  paga uma vez). Importação direta pelo Claude (Drive → banco), sem dados pessoais no repositório.
- **Feito:** migração `legacy_payments` (tabela `LegacyPayment` com RLS, somente inserção e travas
  `LegacyPayment_month_format` e `LegacyPayment_amounts`). `/admin/abertura` já vem preenchida com o total pago e a
  descrição por mês; a equipe confere com os comprovantes e aprova.
- **Comparação planilha × sistema (por cupom, mês do pagamento):** batem julho de JULIACOLARES, FESTEVES, ORTOP e
  LUDMILLA; agosto de 9 cupons; setembro de 6. Diferem: JOINGLE (jul, ago, set), VICTORIA (jul, ago, set),
  JULIACOLARES (ago, set), FESTEVES, COLHER, LUCCA, LUDI, BRAUHER, ANAAMARAL (set). Fora da planilha: JULIANAROSA
  em julho e BARBIERI em agosto e setembro. As diferenças viram saldo (a receber ou a abater).
- **Importado em produção (2026-10-10):** 34 linhas (jul–set), R$ 31.807,80; resumo do saldo por cupom passado ao
  responsável (diferenças viram saldo a receber ou a abater).
- **Verificado:** integração (1 novo, travas pelo nome); migração × schema sem divergência; typecheck.

### CP-62 — 2026-10-10 — Correção de taxa desde o início (planilha de pagamentos × sistema)
- **Decidido:** D-RATEFIX. Comparando a planilha "Pagamentos influencers" com o sistema, duas taxas provisórias do app
  antigo (D-RATEPROV) estavam erradas: VICTORIA é 10% (sistema 15%) e CEMBRANELLI é 15% (sistema 20%). O responsável
  confirmou a planilha. Correção vale para todos os pedidos, com a diferença lançada no extrato.
- **Feito:** `src/lib/commission/rate-fix.ts` (`correctRateSinceStart`: só super admin, só com saque travado, só com
  uma taxa no histórico; muda a taxa e a taxa congelada dos pedidos e lança a diferença de cada pedido como
  estorno/comissão com nota e chave própria; auditoria `commission.correct`). Botão "Corrigir desde o início" no
  cartão de taxa da ficha.
- **Aplicado em produção (2026-10-10, a pedido do responsável):** VICTORIA 15% → 10% (661 pedidos, −R$ 11.283,78) e
  CEMBRANELLI 20% → 15% (4 pedidos, −R$ 40,89), pela mesma regra da função, em SQL numa transação, com auditoria
  `commission.correct` (autor `claude-a-pedido-do-responsavel`). Conferido: CEMBRANELLI agosto = R$ 122,72, igual à planilha.
- **Verificado:** integração (2 novos: estorno da diferença, reprocessar não duplica, permissões e travas); typecheck.

### CP-61 — 2026-10-10 — Termo v2 publicado (regras do contrato)
- **Decidido:** texto do termo v2 aprovado pelo responsável (só os itens 4 e 5 mudam: liberação mensal com mínimo de
  vendas de R$ 500 / R$ 1.000 e acúmulo; saque do valor total do dia 1 ao 10, pagamento até o dia 15). Publicado
  pelo Claude a pedido do responsável.
- **Feito:** migração `terms_v2` (nova versão da Botanika e registro `terms.published` na auditoria). Toda creator
  aceita de novo no próximo acesso (D-TERMS). Kit mensal e vigência entram numa v3 quando existirem no sistema.
- **Verificado:** migração aplicada num banco novo com a v1 (vira versão 2, com auditoria); migração × schema sem
  divergência; typecheck; testes.

### CP-60 — 2026-10-10 — Regras do contrato: fechamento mensal com mínimo de vendas e saque do dia 1 ao 10
- **Decidido:** D-CONTRACT (as regras dos contratos assinados valem sobre D-HOLD e D-WDRULES): comissão do mês fica a
  liberar e é liberada no dia 1 do mês seguinte só se as vendas acumuladas desde a última liberação chegam ao mínimo
  (R$ 500 influencer/UGC, R$ 1.000 prescritor); sem atingir, acumulam para o mês seguinte. NF do valor total liberado
  do dia 1 ao 10, pagamento até o dia 15, sem saque parcial e sem mínimo por pedido.
- **Feito:** migração `contract_monthly_release` (tabelas `CommissionRelease` e `MonthClosing` com RLS, somente
  inserção e travas `CommissionRelease_month_format`, `CommissionRelease_reached_min`, `MonthClosing_month_format`,
  `MonthClosing_releases_nonneg`, `Brand_releaseMin_positive`; mínimos na `Brand`; janela da Botanika 1–10, mínimo
  por pedido 1 centavo). `src/domain/release.ts` (plano de liberações, acumulado, mínimo por tipo) e
  `computeBalance` com liberação mensal (retido = líquido de cada mês não liberado). `src/lib/commission/release.ts`
  (fechamento pelo worker a cada minuto, 1 h depois da meia-noite do dia 1, uma vez por marca e mês; progresso da
  liberação). Saque exige o valor igual ao total disponível; formulário sem o passo "Valor". Portal (Início, Vendas,
  Saque) e ficha com "vendas acumuladas X de R$ 500" e "a liberar" sem data fixa.
- **Atenção:** o termo publicado (v1) ainda fala em saque do dia 10 ao 15 com mínimo de R$ 500 por pedido; o texto v2
  precisa do OK do responsável. No primeiro fechamento (01/11, ou no deploy para setembro e antes) o sistema percorre
  desde o primeiro mês com venda.
- **Verificado:** 127 unitários (12 novos); 141 de integração (3 novos, travas pelo nome); migração × schema sem
  divergência; typecheck; build. Capturas para o OK.

### CP-59 — 2026-10-10 — Candidatas do formulário Hunter no painel (onboarding, parte 1)
- **Decidido:** D-ONBOARD (o formulário Hunter que a Ana manda alimenta o sistema por um script do Google Forms que
  envia cada resposta na hora; a equipe aprova no painel com cupom, tipo, comissão 15% e desconto 5% editáveis;
  aprovar cria conta (ou reaproveita pelo e-mail), creator ativa, cupom de creator, dona e taxa confirmadas, saque
  liberado e conferência dispensada (creator nova não tem pagamento antigo) e gera o convite do portal; recusar
  guarda o motivo). Adianta parte do L2 por pedido do responsável: automatizar o máximo.
- **Feito:** migração `applications` (tabela `CreatorApplication` com RLS e travas `CreatorApplication_decided` e
  `CreatorApplication_name`). `src/lib/onboarding/applications.ts` (leitura das perguntas pelo título, tipo pelo
  "Sou:", cupom sugerido ajustado para só letras e até 8, aprovação em transação, recusa). Rota
  `POST /api/forms/[marca]/hunter` com `Authorization: Bearer $FORMS_SECRET` (mesma resposta não duplica). Script
  `docs/forms/hunter-apps-script.gs` (instalar + enviar as respostas antigas). Tela `/admin/candidatas` (menu
  "Candidatas") e cartão no Início quando há novas.
- **Falta (próximas partes):** criar o cupom sozinho na Shopify ao aprovar (precisa `write_discounts` no app e
  reconectar); checklist da Central na ficha (contrato de 6 meses, grupo, etiquetada, seguimos no Insta). Para ligar:
  `FORMS_SECRET` na Vercel e o script colado no formulário.
- **Verificado:** 115 unitários (4 novos); 138 de integração (3 novos, travas pelo nome); migração × schema sem
  divergência; typecheck; build. Capturas para o OK.

### CP-58 — 2026-10-10 — Feedback do responsável: cupons em abas e "Loja de teste" arquivada
- **Decidido:** D-COUPONTABS (Cupons separados em "A conferir", "Creators" e "Promocionais", com busca; trocar o
  tipo de um promocional fica em "Trocar tipo"), D-ARCHIVE (marca não é apagada; arquivada some de todas as telas;
  a "Loja de teste" de 09/10, sem dados, foi arquivada na migração com registro na auditoria).
- **Feito:** migração `brand_archive` (`Brand.archivedAt`); listas de marcas filtram arquivadas (painel, Creators,
  Cupons, Shopify, Equipe, Importar, telas de entrada). `src/app/admin/cupons/board.tsx` com abas e busca.
- **Feedback em andamento:** a equipe (Juci, Alvaro, Ana) vai mandar ajustes pelo WhatsApp; o responsável repassa.
- **Verificado:** 111 unitários; 135 de integração (1 novo: marca arquivada some); migração × schema sem
  divergência; typecheck; build. Capturas para o OK.

### CP-57 — 2026-10-10 — Termo de aceite da creator (P4)
- **Decidido:** D-TERMS (portal bloqueado até aceitar a versão mais nova; a creator digita nome completo e CPF, e
  ficam gravados data, IP e navegador; o CPF vai para o cadastro se estiver vazio e, se for diferente, o aceite é
  recusado; texto novo = versão nova = novo aceite; publicar é só do super admin; a equipe vendo o portal não é
  bloqueada; saque exige o termo aceito).
- **Feito:** migração `terms` (tabelas `TermsVersion` e `TermsAcceptance`, RLS, travas `TermsVersion_valid`,
  `TermsAcceptance_cpf`, `TermsAcceptance_name`, gatilhos de só inserção; versão 1 da Botanika com o rascunho).
  `src/lib/terms/terms.ts` (CPF com dígito verificador, aceite idempotente, publicação com versão seguinte, painel,
  situação na ficha). Tela de aceite no portal (`TermsGate` no layout), `/admin/termo` (menu "Termo") e bloco
  "Termo de aceite" na ficha (CPF mascarado).
- **Atenção ao subir:** com o merge, todas as creators da Botanika passam a ver o termo no próximo acesso
  (inclusive a Creator Teste).
- **Verificado:** 111 unitários (2 novos); 134 de integração (4 novos, travas pelo nome); migração × schema sem
  divergência; typecheck; build. Capturas e texto para o OK do responsável.

### CP-56 — 2026-10-10 — Mesmo visual em todo o sistema (D-DESIGNALL)
- **Decidido:** D-DESIGNALL (substitui D-ADMINUI): o *liquid glass* do portal vale para todas as telas da equipe e
  para login, senha e convite; menu por papel; Início da equipe com os números do papel; cor da marca escolhida.
- **Feito:** peças comuns (`src/components/ui/`: estilos, `Card`, `Kpi`, `PageHeader`, `Msg`); menu único
  (`src/components/portal/nav.tsx`, com "Mais" no celular) usado pelo portal e pela equipe; `src/lib/staff/` (menu por
  papel, testado; marca do topo por cookie `cc_brand`; números do Início); `/admin` (Início) e moldura em
  `src/app/admin/layout.tsx`. Telas refeitas: Creators (com busca), ficha (cartões), Cupons, Envios, Saques,
  Abertura, Equipe, Shopify, Importar, entrar, esqueci, nova senha, convite, página inicial. `/conta` leva a equipe
  ao painel e a creator ao portal. Telas de entrada com a cor da Botanika enquanto for a única marca (D-LOGINCOLOR). Ficha e Início separados em componentes de exibição (para as capturas).
- **Verificado:** 109 unitários (1 novo: menu por papel); 130 de integração; typecheck; build. Capturas para o OK.

### CP-55 — 2026-10-10 — Saldo de abertura e conferência da Ana (E6)
- **Decidido:** D-OPENFLOW (o Pagamento informa um total já pago + observação por creator; aprovar lança o "Saldo de
  abertura" negativo e libera o saque; saldo negativo é aceito com aviso, D-NEG; aprovam Pagamento e super admin;
  comprovantes guardados para conferir e automatizar depois), D-ANAREVIEW (as confirmações provisórias de taxa e
  cupom, D-RATEPROV, não contam como conferência: a Ana marca "Conferi os números" na ficha; sem isso a abertura
  fica travada).
- **Feito:** migração `opening_balance` (índice `LedgerEntry_one_opening_per_creator`; `Creator.reviewedAt/ById` com a
  trava `Creator_review_has_author`). `src/lib/withdrawals/opening.ts` (`openingList`, `approveOpening` em transação
  com `FOR UPDATE` e dupla aprovação impossível, `markReviewed`; tudo auditado). Telas `/admin/abertura` (link em
  `/conta`) e o bloco "Conferência da Ana" na ficha da creator.
- **Verificado:** 108 unitários; 130 de integração (6 novos: aprovar com corrida, nada pago, negativo, recusas,
  conferência da Ana, travas pelo nome); migração × schema sem divergência; typecheck; build.

### CP-54 — 2026-10-10 — Portal aberto pela equipe sem "ver como" não dá mais 404
- **Corrigido:** o responsável abriu o link `/portal/botanika` no celular e, depois de entrar como super admin, caiu
  num 404: a visualização "ver como creator" (D-VIEWAS) fica num cookie deste aparelho, e sem ela a equipe não tem
  portal próprio. Agora quem é da equipe vai para `/admin/creators` com o aviso de como abrir o portal de uma
  creator; creator sem acesso à marca continua com 404.
- **Feito também:** conta de teste "Creator Teste" (Botanika, e-mail do responsável, saldo fictício de R$ 1.000 por
  ajuste e saque liberado) para testar o portal de ponta a ponta; registrada na auditoria
  (`creator.test_account`). Passar para Desligada quando os testes terminarem.
- **Verificado:** typecheck, testes unitários e de integração, build.

### CP-53 — 2026-10-09 — Saques no painel do Pagamento (E8)
- **Decidido:** D-WDDECIDE (recusa com motivo obrigatório, que a creator vê; pago no dia do clique, sem comprovante;
  a creator pode cancelar o próprio pedido em análise; decidem Pagamento e super admin, Gestão não vê a fila),
  D-ACCEPTANA (sem piloto com creators: a Ana confere antes de liberar). Catálogo da loja carregado (E7.8).
- **Feito:** migração `withdrawal_decisions` (travas `Withdrawal_decided_has_author`, `Withdrawal_rejected_has_note`
  e índice `LedgerEntry_one_payment_per_withdrawal`). `src/lib/withdrawals/decide.ts` (pagar: lançamento WITHDRAWAL
  negativo na mesma transação; recusar; cancelar pela creator; fila com disponível antes do pedido e aviso de valor
  acima do saldo; tudo só a partir de "Em análise", à prova de dois cliques, e auditado). Telas `/admin/saques`
  (link em `/conta`), `/admin/saques/nf/[id]` (abre a NF por link assinado de 5 minutos) e "Cancelar pedido" na
  aba Saque; o motivo da recusa aparece como "motivo: …".
- **Não testado ponta a ponta:** abrir a NF real do Supabase (o ambiente de desenvolvimento não alcança a rede).
- **Verificado:** 108 unitários; 124 de integração (5 novos: pagar com corrida, recusar, cancelar, permissões,
  travas pelo nome; 1 ajustado à nova trava de autor); migração × schema sem divergência; typecheck; build.

### CP-52 — 2026-10-09 — Envios de produtos às creators (E7.8)
- **Decidido:** D-SHIPMENTS completada com D-SHIPADDR (endereço na ficha, mantido pela creator no portal; cada envio
  guarda a cópia do dia), D-SHIPSTATUS (Preparando → Enviado com transportadora e rastreio → Entregue pela equipe ou
  pelo "Recebi" da creator; cancelar antes da entrega; link de rastreio dos Correios), D-SHIPWHO (registram: Envio,
  Gestão e super admin; nova permissão `shipping.manage`), D-SHIPPRODUCTS (produtos da loja).
- **Feito:** migração `shipments`: endereço em `CreatorAccount` (`addr*`, travas `CreatorAccount_addr_zip` e
  `CreatorAccount_addr_state_uf`), tabelas `Product`, `Shipment` e `ShipmentItem` com RLS, travas
  `Shipment_status_dates` (cada situação com as suas datas e autores; enviado exige rastreio) e
  `ShipmentItem_quantity_positive`. `src/lib/shipments/` (endereço normalizado; registrar com produtos da mesma
  marca e cópia do endereço e dos nomes; mudanças de situação só a partir da situação esperada, à prova de dois
  cliques; tudo auditado; a visualização da equipe não altera nada). Telas `/portal/[marca]/envios` (item "Envios"
  no menu; a barra do celular passou a dividir o espaço entre 5 itens) e `/admin/envios` (link em `/conta`).
- **Falta:** carregar os 21 produtos da loja em `Product` depois do deploy (pelo conector, D-SHIPPRODUCTS); sem
  isso o formulário "Novo envio" mostra "Nenhum produto carregado".
- **Verificado:** 108 unitários (4 novos); 119 de integração (5 novos: fluxo completo, entregue/cancelado, corrida
  de dois cliques, recusas, travas pelo nome); migração × schema sem divergência; typecheck; build. Capturas para o
  OK do responsável.

### CP-51 — 2026-10-09 — Aba Saque com saldo, movimentações e pedido de saque com NF em PDF (E7.4 + E7.7)
- **Decidido:** D-WDTAB (o extrato não tem aba própria: a aba chama **Saque** e reúne saldo, botão, meus saques e
  movimentações por mês), D-WDLOCK (saque travado por creator até o Pagamento aprovar o saldo de abertura, E6; hoje
  todas travadas), D-WDRULES (janela 10–15, mínimo R$ 500 por pedido, parcial, um em aberto, NF em PDF até 10 MB,
  Pix), D-NF parcial (CNPJ do tomador 65.100.830/0001-36 da Botanika; descrição/código do serviço ainda em aberto),
  D-WDFLOW (valor → enviar a nota já emitida → confirmar; a aba mostra antes os dados para emitir), D-NF com
  sugestão de descrição e do subitem 17.06 (propaganda e publicidade), a confirmar com contador.
- **Feito:** migração `withdrawals_unlock` (`Creator.withdrawalsUnlockedAt/ById` com a trava
  `Creator_unlock_has_author`; `Brand.nfTakerDocument`). `src/lib/portal/withdrawals.ts` (aba: saldo, próxima
  liberação, motivos que travam o botão, meus saques, extrato do mês). `src/lib/withdrawals/request.ts`
  (`requestWithdrawal`: transação com `FOR UPDATE` na creator, saldo recalculado, regras do domínio, chave Pix exigida
  se faltar, PDF conferido pelos bytes `%PDF-`, `File` + `Withdrawal` + auditoria `withdrawal.request`, mesmo pedido
  nunca duplica, corrida entre dois pedidos: só um passa). PDF sobe do navegador direto para o bucket privado `nf`
  do Supabase por link assinado (a Vercel limita o corpo a 4,5 MB); o servidor baixa e confere. Bucket `nf` criado no
  staging (privado, só PDF, 10 MB). Telas `/portal/[marca]/saque` e `/saque/novo`; item "Saque" no menu.
- **Não testado ponta a ponta:** o envio real do PDF ao Supabase (o ambiente de desenvolvimento não alcança a rede);
  conferir no primeiro saque liberado.
- **Corrigido (testes intermitentes):** os testes geravam nomes aleatórios trocando todo dígito por "X" (só 7
  símbolos em 6 posições); com centenas de marcas e cupons por execução, às vezes dois nomes saíam iguais
  (`Brand_slug_key`, visto no CI deste PR e antes na atribuição). Agora `letters()` em `fixtures.ts` usa a entropia
  inteira do UUID (0→G … 9→P).
- **Verificado:** 104 unitários (2 novos); 114 de integração (6 novos, incluindo a trava pelo nome e a corrida);
  migração × schema sem divergência; typecheck; build. Capturas para o OK do responsável.

### CP-50 — 2026-10-09 — Cupom e link no portal (E7.5)
- **Decidido:** D-LINKFALLBACK (link de cupom desconhecido, promocional ou de creator desligada leva à página inicial
  da loja, sem cupom e sem contar clique; o link na bio nunca quebra). IP nunca gravado: hash diário.
- **Feito:** rota `/r/[marca]/[código]` (mesma do app antigo): grava o clique (`Click`, hash do IP que muda por dia,
  navegador, origem) antes de responder e redireciona para `<loja>/discount/<CÓDIGO>?redirect=<caminho>` (só
  caminhos da própria loja); fora do `proxy`. `src/lib/links/tracked.ts`. Aba Cupom (`/portal/[marca]/cupom`):
  código e link para copiar, compartilhar pelo celular, cliques no mês e no total; o link usa o endereço por onde o
  portal foi aberto (vale no domínio novo sem mudar nada). Item "Cupom" no menu; atalho no Início.
- **Atenção:** o link mostrado hoje é do endereço `creatorclub-six.vercel.app`; com o domínio próprio (P3) muda
  sozinho. Os links antigos nas bios apontam para o domínio do app antigo: redirecionar no corte (P3).
- **Verificado:** 102 unitários (3 novos); 108 de integração (1 novo: clique gravado sem IP, promocional e
  desconhecido vão à home, marca inexistente 404, desligada não conta, contagem do mês no fuso); typecheck; build.

### CP-49 — 2026-10-09 — Vendas no portal com período e gráfico por dia (E7.3)
- **Decidido:** D-PERIOD (seletor Hoje · Ontem · 7 dias · Este mês · Personalizado, em dias da marca; gráfico de
  vendas por dia com a comissão e os pedidos na ficha ao passar o dedo; cartões Pedidos, Vendas, Comissão e Ticket
  médio), D-SHIPMENTS (envios de produtos à creator), D-E7ORDER (ordem das próximas telas), D-PERKS (bônus, metas,
  gamificação e competições anotados para conversar com a Ana). Pedidos do responsável a partir de um print do
  painel da Botanika.
- **Feito:** `dayKey`, `startOfLocalDay` (funciona com horário de verão), `addDaysKey`/`nextDayKey` no domínio;
  `src/lib/portal/period.ts` (`resolvePeriod`: presets, personalizado até 366 dias, nunca depois de hoje, inválido
  volta para Este mês); `portalSales` por período (pedidos pagos atribuídos, sem teste nem nunca pago, sem dados do
  cliente; série por dia; totais com ticket médio). Tela `/portal/[marca]/vendas`: seletor numa linha acima de tudo,
  cartões (no celular, um cartão com uma linha por número), gráfico de uma série (área + linha 2px na cor da
  marca, cruz e ficha, setas do teclado, tabela para leitor de tela), lista de pedidos (tabela no computador, lista no
  celular). Item "Vendas" no menu.
- **Corrigido:** tema escuro. O React refazia o `<html>` no navegador e apagava `data-theme`; agora o CSS segue o
  aparelho sozinho e só a escolha do botão vira atributo, reaplicada ao montar (`ThemeSync`).
- **Verificado:** 99 unitários (5 novos: dias no fuso, período, situação); 107 de integração (período, dia do
  pagamento no fuso, estornada, teste e não pago fora, outra creator não vê); typecheck; build. Capturas
  (computador e celular, claro e escuro, personalizado) para o OK do responsável.

### CP-48 — 2026-10-09 — Histórico completo da loja e classificação dos cupons (no staging, pelo responsável)
- **Carga histórica:** exportação em lote pedida pelo conector da Shopify (só leitura; a loja começou em junho de
  2026) e importada pelo próprio worker (`shopify.backfill.import`, mesma `processOrder`): **4.592 pedidos** (igual
  ao total da loja), 2.925 com cupom. Contorna, só para o histórico, a falta de `read_all_orders` no app (D-HISTMCP).
- **Classificação (D-CLASSPEDRO):** o responsável decidiu no chat, gravado em nome dele com auditoria:
  BOTANIKA (1º pedido), ANOVA e os cupons de campanha/recuperação/frete são PROMO; VICTORIA, JULIACOLARES e os
  cupons com dona conhecida são CREATOR; cupons "DR…" são de prescritores (categoria PRESCRITOR).
  Cupons de creator sem cadastro (LUCCA, LARILESSA, LUDI, BRAUHER, DRALORENA, CRISCRUZ, CLEYARBS) viraram creators
  novas com o nome do código e e-mail a confirmar. Cadastros falsos do app antigo (BOTANIKA, ANOVA10, ANOVA7,
  BRASIL10, FRETEGRATIS, PALPITE12, VOLTEI10) ficaram Desligada.
- **Taxas (D-RATEPROV):** 15% para todas e 20% para a Raquel Cembranelli, confirmadas como provisórias para as
  comissões rodarem; a Ana revisa cada uma (há exceções). Taxa é congelada na atribuição: corrigir depois é por
  ajuste manual ou mudança de taxa para a frente.
- **Desde o 1º uso (D-SINCEFIRST):** dona e taxa valem desde 01/06/2026; vendas antes do cadastro no app antigo
  contam. O que já foi pago por fora abate no saldo de abertura (D-OPEN, E6).
- **Falta:** cupom `XGFA2YM4DGSE` sem tipo (parece código automático); e-mails reais das creators.

### CP-47 — 2026-10-09 — "Ver como creator" e novo jeito de revisar
- **Decidido:** D-VIEWAS ("ver como creator" só para super admin, só leitura, auditado; muda a regra "Entrar como
  fora do escopo" do `CLAUDE.md`), D-REVIEW (tela nova só com OK sobre capturas; prévias da Vercel continuam
  desligadas), D-GAPS (backup, Resend, domínio e termo entram antes do corte).
- **Feito:** permissão `portal.viewAs` (só SUPER_ADMIN); `portalContext` aceita a visualização (cookie `cc_view_as`
  com o id, permissão conferida a cada página; para quem não pode, o cookie é ignorado); `startViewAs` registra
  `portal.view_as` na auditoria; ações para começar e sair; aviso âmbar no portal; botão na ficha da creator.
  Moldura e Início viraram componentes de exibição (`PortalShell`, `HomeView`), o que permite capturas com dados de
  exemplo sem login.
- **Verificado:** 93 unitários; 106 de integração (2 novos: super admin vê e fica na auditoria, cookie de outra marca
  não vale, Gestão não vê, cookie forjado por outra creator é ignorado); typecheck; build. Capturas no PR.

### CP-46 — 2026-10-09 — Início do portal (E7.2)
- **Decidido:** D-HOMEKPI (4 cartões: disponível, a liberar com a próxima liberação, vendas do mês, comissão do mês;
  abaixo, as 8 últimas movimentações e o cartão do cupom).
- **Feito:** `readLedger` e `statementForMonth` separados de `creatorStatement` (a leitura sem checagem de acesso
  serve à equipe e à creator; quem chama decide o acesso). `src/lib/portal/home.ts` (`portalSummary`: vendas = pedidos
  pagos atribuídos no mês do pagamento, sem cancelados e teste, soma da base; comissão = comissões − estornos dos
  pedidos do mês; cupons em uso, nenhum para Desligada). Tela Início com os cartões, movimentações e botão de copiar
  o cupom. O link "ver extrato" entra com a tela de extrato (E7.4).
- **Verificado:** 93 unitários; 104 de integração (1 novo: saldo, próxima liberação, mês no fuso de São Paulo,
  cancelado fora, estorno abatendo, outra creator não vê nada); typecheck; build.

### CP-45 — 2026-10-09 — Base visual do portal e acesso da creator (E7.1)
- **Decidido:** D-PORTALNAV (celular com barra inferior; computador com barra lateral recolhível), D-GLASS (desfoque
  igual em todos os navegadores), D-THEME (segue o aparelho, botão troca e lembra), D-PORTALURL (`/portal/[marca]`),
  D-PORTALACCESS (Ativa, Pausada e Desligada entram; Desligada com aviso).
- **Feito:** migração `brand_colors` (`Brand.secondaryColor`; trava `Brand_colors_hex` só `#RRGGBB`, porque a cor vira
  CSS; Botanika `#323C91` + `#C4D78A`; padrão neutro `#18181B` no lugar do verde antigo). `src/lib/portal/context.ts`
  (`portalContext`: a creator só entra nas marcas em que participa; `portalHome`; `brandCssVars` com segunda trava).
  Tema por `data-theme` definido antes da pintura (layout raiz); utilitários `glass` e `portal-bg`. Portal:
  `/portal` leva à marca da creator; `/portal/[marca]` com moldura (menu lateral/inferior, troca de marca, tema,
  sair, aviso de Desligada) e Início provisório. `/conta` manda creator sem papel na equipe direto ao portal.
  `lucide-react` 1.54.0 (ícones). Conferido em capturas (claro, escuro, celular) numa página temporária.
- **Verificado:** 93 unitários (2 novos); 103 de integração (3 novos, incluindo a trava pelo nome); migração × schema
  sem divergência; typecheck; build.
- **CI:** imagem do Postgres trocada para o espelho `public.ecr.aws/docker/library/postgres:16` (o Docker Hub
  recusou o download por limite de acesso sem login duas vezes seguidas).
- **Atenção:** `next dev` acrescenta sozinho um bloco ao `CLAUDE.md`; não commitar esse bloco.

### CP-44 — 2026-10-09 — E7 detalhada; cor da Botanika, vendas sem cliente e destino do link decididos
- **Decidido:** D-BRANDCOLOR (Botanika `#323C91` + `#C4D78A`), D-SALESVIEW, D-LINK; ordem: E7 antes de E6 (E5.5
  espera a Ana, E6 espera a lista de saques do Pagamento).
- **Feito:** E7 quebrada em E7.1–E7.6.
- **Vercel:** pedido para conferir se o plano mudou; a API não mostra o plano e não há cobrança registrada em
  outubro. Prévias continuam desligadas (D-PREVIEW) de todo jeito: não têm banco.

### CP-43 — 2026-10-09 — Saldo e extrato por creator (E5.4)
- **Feito:** `src/lib/commission/statement.ts` (`creatorStatement`: saldo = soma do extrato, separado em a liberar,
  em saque e disponível, pode ficar negativo; meses com total líquido; lançamentos do mês com pedido, base e taxa;
  só `money.view` da marca). `monthKey`, `entryMonth` e `isMonthKey` no domínio. Na ficha da creator, seção
  "Saldo e extrato" com navegação por mês (`?mes=AAAA-MM`). Complemento de D-MONTH registrado.
- **Corrigido:** a seção E5 (E5.1–E5.5) não tinha sido escrita na fila no CP-38; agora está.
- **Verificado:** 91 unitários (3 novos); 100 de integração (2 novos: separação do saldo, mês do pagamento, estorno
  em outro mês, saldo negativo, permissão e mês inválido); typecheck; build.

### CP-42 — 2026-10-09 — Ajuste manual (E5.3) e importação feita no staging
- **No staging (a pedido do responsável, sem subir arquivo):** importação das 28 creators da Botanika com o
  `Creator_rows.csv` já enviado, pela mesma lógica de `/admin/importar` (rodada num banco descartável com os IDs do
  staging e gravada pelo conector do Supabase): 28 contas, 28 creators, 26 cupons novos + VICTORIA e BOTANIKA
  reaproveitados (já vistos nos pedidos), 28 donas e 28 taxas a confirmar (27 × 15%, 1 × 20%); auditoria
  `import.legacy`. Arquivos temporários com dados pessoais apagados deste ambiente. A tela de importação fica para
  o corte (comparação com o app antigo), se for preciso.
- **Feito (E5.3):** `src/lib/commission/adjust.ts` (só `ledger.adjust` = super admin; valor com sinal em reais
  convertido sem Float; motivo obrigatório; `requestId` da tela contra clique duplo; auditoria `ledger.adjust`);
  migração `adjustment_reason` com a trava `LedgerEntry_adjustment_has_reason` (motivo e autor obrigatórios). Na
  ficha: lista de ajustes para quem vê valores e formulário só para super admin.
- **Verificado:** 88 unitários (2 novos); 98 de integração (3 novos, incluindo a trava pelo nome); migração × schema
  sem divergência; typecheck; build.

### CP-41 — 2026-10-09 — Loja Botanika ligada e sync no ar (E3.7 concluída)
- **No staging:** o deploy liberou às ~20:00 UTC; loja `p01bpt-x2.myshopify.com` marcada como conectada (só
  `read_orders`) e os 5 webhooks cadastrados pelo conector do Supabase (pg_net com a chave de 24 h, sem trazê-la ao
  chat), auditoria `integration.connect`. A primeira reconciliação (20:01 UTC) gravou 10 pedidos reais, todos pagos,
  sem erro. Migrações `pending_confirmation` e `hold_7_days` aplicadas pelo deploy seguinte.
- **Corrigido:** `processOrder` passa a registrar os códigos dos pedidos como cupom (sem tipo) também quando a
  versão é repetida (os 10 pedidos foram gravados pela versão anterior, que não registrava).

### CP-40 — 2026-10-09 — Lançamentos de comissão (E5.2)
- **Feito:** `src/lib/commission/ledger.ts`: `postCommission` (devido − lançado por versão do pedido; COMMISSION ou
  REVERSAL; chave de idempotência com a versão; trava por pedido na transação contra lançamento em dobro; crédito
  disponível 7 dias depois do pagamento, débito na hora; não lança sem atribuição, sem taxa congelada, com imposto
  incluso ou moeda diferente) e `settleOrder` (atribuição + lançamento), usados por webhook, reconciliação e carga
  histórica; a reavaliação da marca também lança. `processOrder` passa a devolver o pedido mesmo quando a versão é
  repetida (a liquidação é refeita se algo falhou antes); o aviso de imposto só é registrado em versão nova.
- **Verificado:** 86 unitários; 95 de integração (5 novos: pago com retenção e repetição, reembolso parcial e
  cancelamento somando zero, 5 processos simultâneos lançando uma vez, casos que não lançam, pendente lançado pela
  reavaliação); typecheck; build.

### CP-39 — 2026-10-09 — Atribuição no banco (E5.1)
- **Feito:** `src/lib/commission/attribution.ts`: `decideAttribution` (decide uma vez, com os códigos como evidência;
  pendente não grava; taxa congelada só com pedido pago e política confirmada cobrindo o pagamento, nunca a atual
  por omissão; gravação à prova de corrida), `recheckBrand` (pedidos sem atribuição e atribuições pagas sem taxa) e
  tarefa `attribution.recheck`, pedida a cada confirmação da Ana (no máximo uma por minuto). Webhook, reconciliação
  e carga histórica passam a decidir a atribuição logo depois de gravar o pedido. Migração `hold_7_days`: retenção
  padrão de 7 dias (D-HOLD) e marcas existentes de 0 para 7.
- **Verificado:** 86 unitários; 90 de integração (6 novos: pendente → confirmado → atribuído → taxa congelada,
  decisão gravada não muda, taxa congela no pagamento, pago antes da vigência fica sem taxa, reavaliação em lote,
  retenção padrão); migração × schema sem divergência; typecheck; build.

### CP-38 — 2026-10-09 — E5 detalhada; D-HOLD, D-NEG, D-MONTH decididas
- **Decidido:** D-HOLD (7 dias), D-NEG (saldo negativo abate das próximas comissões), D-MONTH (mês do pagamento).
  `CLAUDE.md` atualizado.
- **Feito:** E5 quebrada em E5.1–E5.5; E4.5 marcada como bloqueada (deploy, importação, conferência da Ana).

### CP-37 — 2026-10-09 — Ficha da creator (E4.4)
- **Decidido:** D-STATUS (Ativa, Pausada, Desligada).
- **Feito:** `src/lib/creators/profile.ts`: lista e ficha (`creators.view`; CPF/CNPJ/Pix só com `personal.fiscal`);
  `updateContact` (nome, e-mail real, telefone; recusa e-mail falso, inválido ou de outra creator; quem já entrou no
  portal não troca o e-mail de login por aqui); `setCreatorStatus` (datas de ativação/desligamento); `changeRate`
  (só com a taxa atual confirmada: fecha a vigente agora e abre a nova confirmada, D-RATECHG); tudo auditado.
  Convite (E2.5) passa a recusar e-mail falso da importação. Telas `/admin/creators` e `/admin/creators/[id]`
  (contato, situação, cupons, taxas, "Gerar link de convite"); links em `/conta` e na conferência.
- **Verificado:** 86 unitários; 84 de integração (5 novos: e-mail falso → real → convite, e-mail repetido e login
  já criado, situação, mudança de taxa com vigência, permissões por papel); typecheck; build.

### CP-36 — 2026-10-09 — Tela de conferência da Ana (E4.3)
- **Feito:** `src/lib/coupons/review.ts` (só quem edita creators da marca: Gestão ou super admin): lista de cupons
  com pedidos que usaram cada código, tipo, dona e taxa vigentes; `classifyCoupon` (CREATOR/PROMO; cupom que já
  levou pedido não muda de tipo); `confirmOwner` (troca a dona importada errada antes de confirmar; cupom sem dona
  pede "desde quando"); `confirmRate` (corrige o valor e confirma; taxa digitada como 15 ou 12,5, sem Float);
  progresso "X de Y creators ativas confirmadas"; auditoria `coupon.classify`, `coupon.owner.confirm`,
  `commission.confirm`. Tela `/admin/cupons` (simples, D-ADMINUI) e link em `/conta`. Mudar taxa ou dona **já
  confirmadas** (com vigência nova) fica para a ficha (E4.4).
- **Verificado:** 86 unitários (2 novos); 79 de integração (4 novos: fluxo completo com auditoria e progresso, troca de
  dona e data obrigatória, PROMO e cupom com pedido, permissões por papel e marca); typecheck; build.

### CP-35 — 2026-10-09 — Importação das creators do app antigo (E4.2)
- **Decidido:** importação por tela, com o arquivo enviado pelo super admin (os dados pessoais não passam pelo chat).
- **Feito:** `src/lib/import/csv.ts` (CSV RFC 4180 sem dependência nova); `src/lib/import/legacy.ts` (só as linhas da
  marca pelo `legacyId`; conta, participação ACTIVE/INACTIVE, cupom sem tipo, dona e taxa a confirmar, datas do
  app antigo em UTC, taxa em pontos-base sem Float; e-mail repetido em outra conta é erro da linha; rodar de novo
  não cria nem sobrescreve e lista as diferenças; auditoria `import.legacy`); tela `/admin/importar` (super
  admin) e link em `/conta`. `processOrder` passa a registrar como cupom (sem tipo) todo código visto num pedido.
- **Ensaio com o arquivo real (banco local descartável, só totais):** 52 linhas, 28 da Botanika; criadas 28 contas,
  28 creators, 28 cupons, 28 donas e 28 taxas (27 × 15%, 1 × 20%), nenhum erro; 16 e-mails falsos
  (`@import.creatorclub`) a revisar; segunda rodada: nada criado, 28 sem mudança, 0 diferenças.
- **Verificado:** 84 unitários (3 novos); 75 de integração (3 novos); typecheck; build.

### CP-34 — 2026-10-09 — Estado "a confirmar" (E4.1)
- **Decidido:** D-PENDING (pedido com cupom a confirmar antes do de creator fica pendente; taxa a confirmar é erro).
- **Feito:** migração `pending_confirmation`: `Coupon.kind` passa a aceitar vazio (não classificado), com
  `classifiedAt`/`classifiedById`; `CouponAssignment` e `CommissionPolicy` ganham `confirmedAt`/`confirmedById`;
  travas `Coupon_classified_consistent`, `CouponAssignment_confirmed_has_author`,
  `CommissionPolicy_confirmed_has_author`. Domínio: `attributeOrder` devolve pendente
  (`unknown_coupon`/`unclassified`/`owner_unconfirmed`) e `rateAt` recusa taxa não confirmada.
- **Verificado:** 81 unitários (6 novos); 72 de integração (2 novos, exigindo o nome de cada trava); migração ×
  schema sem divergência; typecheck; build.

### CP-33 — 2026-10-09 — E4 detalhada
- **Decidido:** D-IMPORT (só as 28 da Botanika, exportação de hoje e conferência no corte), D-RATEIMPORT (taxa,
  dona e tipo "a confirmar" até a Ana), D-ADMINUI (telas internas simples até a E7).
- **Feito:** E4 quebrada em E4.1–E4.5. App "Creator Club - v2" instalado na loja pelo responsável; chave de acesso
  obtida pelo banco (`read_orders`). A loja segue **desligada** até o deploy com o código novo entrar no ar (o que
  está no ar não lê as credenciais novas e faria o Shopify desligar os webhooks por falha).
- **Risco anotado (plano):** webhooks de pedido podem exigir liberação de "protected customer data" no app; a
  reconciliação cobre enquanto isso.

### CP-32 — 2026-10-09 — App da Botanika criado e credenciais guardadas
- **No Shopify (pelo responsável):** app "Creator Club - v2" no Dev Dashboard da organização Botanika Brasil, versão
  `creator-club-v2-1` ativa, escopo `read_orders`, webhooks 2026-10. `read_all_orders` foi recusado na criação
  ("escopo inválido"): fica para a carga histórica (pedidos com mais de 60 dias).
- **Conferido:** pedido da chave de acesso feito pelo banco (pg_net) respondeu `app_not_installed`: credenciais
  aceitas, falta instalar o app na loja. A resposta guardada pelo pg_net tem só o erro, nenhuma chave.
- **No staging:** Client ID/secret cifrados com a `INTEGRATION_ENC_KEY` e gravados em `BrandIntegration` da marca
  `botanika` como DESCONECTADA (sem sync até conectar), com auditoria `integration.credentials`. Nada disso vai para o
  repositório (D-PUBLIC).
- **Feito no código:** "Reconectar" com Client ID/secret em branco reaproveita os guardados (para mudar escopos sem
  redigitar); `app_not_installed` vira mensagem clara; a tela mostra loja desconectada.
- **Verificado:** 75 unitários; 70 de integração (2 novos); typecheck.

### CP-31 — 2026-10-09 — Loja real da Botanika no lugar da loja de teste
- **Decidido:** D-REALSTORE (substitui D-DEVSTORE: a conta não cria loja de desenvolvimento; app só leitura até a
  E4, criado na organização da Botanika no Shopify) e D-PREVIEW (prévias da Vercel desligadas para `claude/**`).
- **Aconteceu:** a Vercel recusou deploys por limite do plano grátis (100/dia) a partir da prévia do PR #23.
- **No staging:** `INTEGRATION_ENC_KEY` salva na Vercel pelo responsável; marcas criadas pelo conector do Supabase,
  com auditoria `brand.create`: `teste` ("Loja de teste", desligada, sem uso) e `botanika` (Botanika, cor
  `#323C91`, `storeUrl` https://botanikabrasil.com.br, `legacyId` do app antigo, desligada para creators).
- **Feito no código:** `vercel.json` sem deploy para `claude/**`; permissões recomendadas na conexão passam a ser só
  `read_all_orders` (cupons ficam para a E4).
- **Verificado:** 75 unitários; 68 de integração; typecheck.

### CP-30 — 2026-10-09 — Agendamento no ar, conexão da loja e tela de saúde (E3.7, parte 1)
- **Decidido:** D-SYNCUI (tela simples). Complementos: D-SHOPAPP (Dev Dashboard, Client ID/secret, chave de 24 h,
  mesma organização) e D-CRON (ligado).
- **No staging:** `JOBS_SECRET` salva na Vercel pelo responsável; `pg_cron` e `pg_net` ligados, segredo no Vault,
  agendamento `creatorclub-worker` a cada minuto; chamadas de 19:00 e 19:01 UTC responderam 200 (fila vazia).
- **Feito:** `src/lib/shopify/token.ts` (troca Client ID/secret pela chave de 24 h, guarda em memória e renova
  10 min antes; erro claro para loja fora da organização; nunca ecoa o segredo); credenciais passam a ser Client
  ID + Client secret (o secret valida o HMAC do webhook); `src/lib/shopify/connect.ts` (só super admin: confere
  credenciais e permissão `read_orders`, avisa permissões recomendadas faltando e imposto incluso, grava cifrado,
  cadastra os 5 webhooks de pedido sem duplicar, audita `integration.connect`); `src/lib/shopify/health.ts` e a
  tela `/admin/sync` (loja, última reconciliação, pedidos, fila, falhas, webhooks 24 h, passadas, avisos,
  "Sincronizar agora", "Importar histórico", conectar/reconectar loja); link em `/conta`.
- **Verificado:** 75 unitários (3 novos); 68 de integração (4 novos: conectar com webhooks e auditoria, sem
  permissão não grava, aviso de imposto, tela de saúde por papel); typecheck; build.

### CP-29 — 2026-10-09 — Carga histórica (E3.6)
- **Feito:** `src/lib/shopify/backfill.ts`: `startHistoricalImport` (só super admin, uma carga por vez por marca;
  carga parada por tarefa que falhou de vez é fechada com erro e pode ser refeita; auditoria `sync.backfill`)
  → tarefa `start` (pede a Bulk Operation de pedidos criados desde a data) → `poll` a cada 30 s (até 2 h;
  FAILED/CANCELED/EXPIRED fecham a passada com o motivo) → `import` baixa o JSONL, remonta pedidos e itens e grava
  com `processOrder` em lotes de 200, retomando do ponto em que parou. Passada em `SyncRun` (`backfill`).
- **Conferido no Shopify:** mutação, consulta de acompanhamento e consulta da exportação validadas no schema
  `2026-10` (nada executado na loja).
- **Em aberto:** data de início da carga na loja real (primeiro cupom de creator) depende de D-CLASS.
- **Verificado:** 72 unitários (3 novos); 64 de integração (4 novos: fluxo completo com 2 lotes, exportação que
  falha, período sem pedidos, permissão e uma carga por vez); typecheck.

### CP-28 — 2026-10-09 — Reconciliação e agendamento (E3.5)
- **Feito:** `src/lib/shopify/reconcile.ts`: relê no Shopify os pedidos alterados desde o cursor da última passada
  boa menos 30 min (primeira passada: últimos 30 min; a carga histórica cobre o passado), 25 por página, até 20
  páginas por passada (o resto continua na seguinte); grava com `processOrder`; pedido com mais de 50 itens vira
  tarefa própria; cada passada em `SyncRun` (com erro, se houver; passada com erro não move a janela) e
  `lastSyncAt` da loja. O worker (`/api/jobs/run`) agenda uma reconciliação por loja conectada a cada 15 min.
  `requestSyncNow` ("sincronizar agora"): só super admin, no máximo uma por minuto, na auditoria.
  Roteiro do pg_cron em `docs/ops/agendamento.md` (segredo no Vault e na Vercel, nunca no repositório).
- **Conferido no Shopify (leitura):** filtro `updated_at:>=` com ordenação por `UPDATED_AT` funciona na loja.
- **Verificado:** 69 unitários; 60 de integração (6 novos: primeira passada, janela com margem, passada com erro
  não move a janela, pedido grande e limite de páginas, um agendamento por 15 min, permissão e limite do
  "sincronizar agora"); typecheck.

### CP-27 — 2026-10-09 — Webhook do Shopify (E3.4)
- **Feito:** `POST /api/webhooks/shopify/[marca]` (fora do `proxy`) e `src/lib/shopify/webhook.ts`: valida o HMAC
  do corpo cru com a chave do app (tempo constante) e o domínio da loja; grava `WebhookEvent` + tarefa
  `shopify.order.sync` na mesma transação e responde 200; aviso repetido (mesmo `Webhook-Id`) não duplica.
  Tópicos que viram tarefa: `orders/create`, `orders/updated`, `orders/paid`, `orders/cancelled`,
  `refunds/create`; os demais ficam gravados como IGNORED. Assinatura errada ou loja trocada = 401 sem gravar;
  marca sem Shopify = 404; sem tópico/id = 400. A tarefa marca o evento como PROCESSED.
  Testes de integração passam a rodar um arquivo por vez (a fila é global no schema de teste).
- **Verificado:** 69 unitários (4 novos); 54 de integração (6 novos), duas execuções seguidas; typecheck.

### CP-26 — 2026-10-09 — Gravação dos pedidos (E3.3)
- **Decidido:** D-PAIDAT (data do pagamento = primeira `SALE`/`CAPTURE` com sucesso), conferido em 5 pedidos
  reais da Botanika (leitura).
- **Feito:** `src/lib/shopify/orders.ts`: consulta do pedido (com todas as páginas de itens), conversão para
  centavos sem Float, cupons na ordem do Shopify, `processOrder` (cria; atualiza só se `updatedAt` for mais novo;
  igual ou antigo é ignorado, decidido pelo banco sem corrida; itens por `upsert`; avisa `taxes_included` e
  `currency_not_brl`). Tarefa `shopify.order.sync` (`src/lib/shopify/jobs.ts`) registrada no worker: busca o
  pedido, grava, e registra aviso na auditoria (`order.warning`) para a tela de saúde e para a E5.
- **Verificado:** 65 unitários (5 novos: conversão, reembolso/cancelado/teste, data do pagamento, paginação de
  itens, pedido inexistente); 48 de integração (6 novos: cria/atualiza/ignora versão antiga, marcas separadas,
  avisos, itens pela metade não grava, tarefa grava e audita aviso, pedido apagado e payload inválido); typecheck.

### CP-25 — 2026-10-09 — Credenciais e cliente do Shopify (E3.2)
- **Feito:** `src/lib/crypto/secret-box.ts` (AES-256-GCM, chave `INTEGRATION_ENC_KEY` de 32 bytes; a marca entra
  como dado autenticado, então o segredo de uma marca não abre em outra); `src/lib/shopify/credentials.ts` (token
  e segredo do webhook gravados cifrados em `BrandIntegration`; ler devolve `null` sem loja conectada);
  `src/lib/shopify/client.ts` (GraphQL Admin na versão fixa `2026-10`, a estável mais nova; só domínio
  `*.myshopify.com`; espera pelo custo em THROTTLED; nova tentativa em 429 com `Retry-After`, 5xx e rede, até 5
  vezes; 401/403 e erro de consulta falham na hora; mensagens sem o token).
- **Verificado:** 60 unitários (10 novos); 42 de integração (3 novos: grava cifrado e lê só com a chave certa,
  segredo de uma marca não abre em outra, sem loja = `null` e domínio inválido não grava); typecheck.
- **Falta (na E3.7):** gerar `INTEGRATION_ENC_KEY` e salvar na Vercel; gravar as credenciais da loja de dev.

### CP-24 — 2026-10-09 — Fila no Postgres e worker (E3.1)
- **Feito:** `src/lib/jobs/queue.ts`: `enqueueJob` (na transação de quem chama; `dedupeKey` repetida é ignorada),
  `claimJobs` (`FOR UPDATE SKIP LOCKED`, prazo de 5 min, cada pega conta uma tentativa), `runJobs` (espera de
  30 s dobrando até 1 h; última tentativa ou tipo desconhecido = FAILED; só quem segura a tarefa a conclui;
  tarefa presa na última tentativa vira FAILED). `POST /api/jobs/run` exige `Authorization: Bearer JOBS_SECRET`
  (mínimo 32 caracteres, comparação em tempo constante; sem segredo, 401 para todos) e fica fora do `proxy`.
  Testes de integração passam a usar `search_path` no schema de teste (SQL cru da fila).
- **Verificado:** 50 unitários (4 novos); 39 de integração (8 novos: dedupe, transação desfeita, dois workers sem
  pegar a mesma tarefa, agendada para depois, nova tentativa com espera, tipo desconhecido, tarefa presa
  retomada sem o worker antigo concluir, presa na última tentativa); typecheck; build.

### CP-23 — 2026-10-09 — E3 detalhada
- **Decidido:** D-DEVSTORE (staging numa loja de desenvolvimento), D-CRON (agendamento pelo pg_cron do Supabase),
  D-SHOPAPP (app novo do Creator Club, token cifrado), D-HIST (desde o primeiro cupom de creator).
- **Verificado no Shopify (D-TAX):** loja Botanika Brasil com `taxesIncluded = false`, `taxShipping = false`, BRL,
  fuso `America/Sao_Paulo`. A base da comissão (`currentSubtotalPriceSet`) não tem imposto a descontar.
- **Feito:** E3 quebrada em E3.1–E3.7.

### CP-22 — 2026-10-09 — E2 concluída (MFA adiado)
- **Decidido:** D-MFA (adiado; veio da auditoria feita por IA, não da equipe nem do plano).
- **Verificado no staging:** migração `creator_invites` aplicada pelo deploy (5 migrações; `CreatorInvite` com RLS;
  nenhuma tabela sem RLS).
- **E2 fechada:** login (E2.1), papéis (E2.2), super admins (E2.3), convite da equipe (E2.4), convite de creator
  (E2.5); MFA adiado (E2.6).

### CP-21 — 2026-10-09 — Convite de creator (E2.5)
- **Feito:** migração `creator_invites` (tabela `CreatorInvite`, RLS, trava `CreatorInvite_accepted_has_user`);
  `src/lib/team/creator-invites.ts` (criar com permissão `creators.edit` numa das marcas da creator; aceitar uma vez,
  e-mail da sessão = e-mail da conta, liga `CreatorAccount.userId`; auditoria); `/convite/[token]` passa a resolver
  convite de equipe ou de creator.
- **Verificado:** 46 unitários; 31 de integração (4 novos: Gestão convida e a creator aceita uma vez com o login
  ligado às participações; quem não edita creators da marca não convida; e-mail diferente e convite vencido não
  ligam a conta; trava no banco); migração × schema sem divergência; build.
- **Fica para a E4:** botão "Convidar" na ficha e confirmação dos e-mails reais das creators.

### CP-20 — 2026-10-09 — Convite da equipe no ar (E2.4 concluída)
- **Configurado (pelo responsável):** `SUPABASE_SECRET_KEY` na Vercel (Production e Preview, Secret).
- **Verificado no staging:** migração `staff_invites` aplicada pelo deploy (tabela com RLS; nenhuma tabela sem RLS).
  `/conta` mostra "Super admin (todas as marcas)" e o link da equipe; convite gerado em `/admin/equipe` para
  `pgustavo723@gmail.com`, aceito em janela anônima, login criado e papel concedido; auditoria com `invite.create` e
  `invite.accept`. `pgustavo723@gmail.com` fica como super admin de reserva (D-ADMIN).
- **Não testado ao vivo:** remover da equipe e tirar papel (cobertos pelos testes de integração).

### CP-19 — 2026-10-09 — Convite e remoção da equipe no código (E2.4, parte 1)
- **Decidido:** D-INVITE-LINK (link pelo WhatsApp até haver remetente). Em aberto: D-INVITE-TTL (7 dias em uso).
- **Feito:** migração `staff_invites` (tabela `StaffInvite`, RLS, travas `StaffInvite_global_only_super_admin` e
  `StaffInvite_accepted_has_user`); `src/lib/team/` (token com só o hash no banco; criar, aceitar uma única vez,
  cancelar convite; tirar papel; desativar pessoa; tudo com auditoria); `/admin/equipe`, `/convite/[token]`,
  link "Equipe e convites" em `/conta` para super admins; `src/lib/supabase/admin.ts` (chave secreta, só servidor).
- **Verificado:** 46 unitários (2 novos); 27 de integração (5 novos: convite aceito uma vez e com papel na marca;
  e-mail errado, vencido e cancelado recusados; só super admin convida; trava de convite global no banco; tirar
  papel e remover pessoa com auditoria, sem tirar o próprio super admin); migração × schema sem divergência; build.

### CP-18 — 2026-10-09 — Super admins Pedro e Ana (E2.3)
- **Decidido:** D-ADJUST (ajuste manual de saldo só SUPER_ADMIN; cada ajuste com motivo e autor). E-mail de login
  da Ana confirmado: `contato@anamedeiros.com`.
- **Feito:** `scripts/grant-super-admin.mjs` ("email:Nome", usa `DIRECT_URL`/`DATABASE_URL`); `/conta` mostra os
  papéis de quem entrou ou "acesso ainda não liberado".
- **No staging:** usuários do Auth criados no painel pelo responsável (Pedro às 17:42, Ana às 17:59, confirmados);
  SUPER_ADMIN global concedido aos dois com o mesmo SQL do script (pelo conector do Supabase, já que este ambiente
  não alcança o banco), 1 registro de auditoria cada.
- **Verificado:** 44 unitários; 22 de integração (3 novos: concede e audita, rodar de novo não duplica, e-mail sem
  usuário no Auth falha sem gravar); typecheck; build.

### CP-17 — 2026-10-09 — Papéis e checagem central (E2.2)
- **Decidido:** D-ADMIN (Pedro e Ana super admins), D-LOGIN (e-mail e senha), D-ROLES (tabela de permissões).
  Em aberto: D-ADJUST (Pagamento pode ajustar saldo? por ora só super admin, marcado no código) e D-HUNTERSRC (L2).
- **Feito:** `src/lib/auth/permissions.ts` (matriz, `brandsWith`, `can`; negar por padrão; papel global só vale para
  SUPER_ADMIN), `src/lib/auth/actor.ts` (`loadActor`, `staffBrandFilter`), `src/lib/auth/current.ts` (Actor da sessão).
- **Verificado:** 44 unitários (7 novos: matriz exata por papel, escopo por marca, negar por padrão); 19 de
  integração (3 novos: cada papel vê só as creators das marcas permitidas, usuário desativado/inexistente sem
  acesso, creator recebe só as próprias participações); typecheck.

### CP-16 — 2026-10-09 — Login no ar (E2.1 concluída)
- **Configurado (pelo responsável):** na Vercel, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (Production e Preview). No Supabase Auth: cadastro aberto desligado, senha mínima 10, Site URL
  `https://creatorclub-six.vercel.app`, links de retorno `https://creatorclub-six.vercel.app/**` e
  `https://*-gestaoalliance.vercel.app/**` (prévias do time). Primeiro usuário criado no painel (sem e-mail).
- **Verificado:** login em `https://creatorclub-six.vercel.app/entrar` leva a `/conta` mostrando o e-mail; no banco,
  1 usuário confirmado com login às 17:42 UTC.
- **Design:** cor oficial da Botanika `#323C91` lida do tema da loja (D-BRANDCOLOR); VermeFree pendente.
- **Pendente:** e-mails do Auth (nova senha, convites) dependem de D-SMTP.

### CP-15 — 2026-10-09 — Direção de design registrada
- **Feito:** `docs/design/DESIGN.md` com a linha visual (*liquid glass*, monocromático, cor de destaque por marca,
  dashboard com sidebar recolhível) e as 3 referências de código recebidas em `docs/design/referencias/`.
  Só referência: não muda a fila. `CLAUDE.md` passa a exigir perguntar antes de executar qualquer dúvida e a ler
  o `DESIGN.md` antes de construir telas.
- **Em aberto:** D-BRANDCOLOR (cores oficiais; o app antigo tinha Botanika verde e VermeFree azul, o contrário do
  que foi dito).

### CP-14 — 2026-10-09 — Login com Supabase Auth no código (E2.1, parte 1)
- **Feito:** `@supabase/ssr` 0.12.7 e `@supabase/supabase-js` 2.117.2 (versões exatas); `src/proxy.ts` renova a
  sessão sem decidir acesso; `/entrar` (e-mail e senha, mensagem única que não revela se a conta existe),
  `/entrar/esqueci`, `/entrar/nova-senha`, `/auth/callback` (troca o código do e-mail por sessão), `/conta` com
  "Sair". Regras puras em `src/lib/auth/rules.ts`: senha mínima 10, e-mail normalizado e `safeNextPath`
  (depois de entrar, só caminhos internos: bloqueia `//site`, `/\site`, `https://...`).
- **Verificado:** 37 unitários (4 novos), typecheck, build; app local: `/entrar` 200, `/conta` sem sessão vai para
  `/entrar?next=/conta`, `/auth/callback` com `next=//evil.com` e sem código vai para `/entrar?erro=link`.
  Este ambiente não alcança o Supabase, então o login de verdade é testado no staging.

### CP-13 — 2026-10-09 — E2 detalhada
- **Feito:** E2 quebrada em E2.1–E2.6 a partir da seção "Login, papéis e segurança" do plano. Decisões novas em
  aberto: D-ADMIN (e-mail do primeiro super admin), D-SMTP (remetente dos e-mails de convite e senha), D-LOGIN.
- **Verificado:** deploy da `main` aplicou sozinho a migração `db_hardening` no staging (3 migrações, nenhuma
  tabela sem RLS, `search_path` da função fixo).

### CP-12 — 2026-10-09 — Staging com banco migrado (E1.4)
- **Causa do travamento (CP-11):** a `DIRECT_URL` salva na Vercel estava com a porta **6543** (transaction
  pooler); `prisma migrate deploy` trava nesse pooler. Corrigida para 5432 e feito redeploy.
- **Verificado no Supabase (projeto `Creator Club`):** `_prisma_migrations` com `core` e `rls_lockdown` aplicadas
  em 2026-10-09 16:59 UTC, sem rollback; 21 tabelas em `public`, **todas com RLS**.
- **Verificador de segurança do Supabase:** "RLS sem políticas" (21) é o esperado (D-RLS); `rls_auto_enable` é
  função do próprio Supabase (gatilho de evento, não chamável pela API); `forbid_update_delete` sem `search_path`
  fixo → corrigido na migração `db_hardening`; `btree_gist` no `public` → risco aceito (mover exige ser dono dos
  tipos da extensão, o papel `postgres` não é; testado localmente, a migração falharia).
- **Feito no código:** `vercel-build` recusa `DIRECT_URL` na porta 6543 com mensagem clara; migração
  `db_hardening`.
- **Verificado no app publicado:** `/api/ready` responde `{"ok":true,"db":"ok"}`; funções (`/`, `/api/health`,
  `/api/ready`) na região `gru1`; domínio de produção `creatorclub-six.vercel.app`. **E1.4 concluída.**
- **Verificado localmente:** 33 unitários; 16 de integração em banco comum e em banco com schema `extensions`
  (como o Supabase); migração × schema sem divergência; typecheck.

### CP-11 — 2026-10-09 — Primeiro deploy do staging travou na migração (E1.4)
- **Aconteceu:** com `DATABASE_URL` e `DIRECT_URL` na Vercel, o deploy da `main` (`4548e29`) conectou no banco
  pelo session pooler (senha ok: a primeira consulta da Prisma aparece no Postgres) e parou logo depois, sem erro,
  por mais de 5 minutos. Nenhuma tabela criada. Build cancelado.
- **Feito:** a migração no build ganha limite de 3 minutos (falha clara em vez de travar a fila do Hobby) e
  registro passo a passo do schema engine (`DEBUG=prisma:schemaEngine*`) para achar onde para.
- **Verificado:** caminho de produção do script testado localmente (migra, registra os passos, build ok).
- **Próximo:** novo deploy da `main` e leitura do registro.

### CP-10 — 2026-10-09 — Staging preparado no código (E1.4, parte 1)
- **Feito:** D-INFRA decidida (staging no Free, pago antes da E9). `vercel.json` com região `gru1`;
  `scripts/vercel-build.mjs` aplica migrações só no deploy de produção, com `DIRECT_URL`; migração
  `rls_lockdown` liga RLS em todas as tabelas (a Data API do Supabase não enxerga nada); `GET /api/ready`
  responde se o app alcança o banco (503 sem detalhes se não).
- **Verificado:** 33 unitários; 16 de integração contra Postgres 16 (o de RLS falha sem a migração nova e passa
  com ela); migração × schema sem divergência; typecheck; build. Caminho de produção do script testado localmente:
  aplica as 2 migrações, 21 tabelas com RLS, build ok; sem as variáveis, falha com mensagem clara.
- **Falta (E1.4, parte 2):** variáveis de banco na Vercel (o conector não enxerga o projeto) e primeiro deploy.

### CP-09 — 2026-10-09 — Backup do app antigo (fecha a pendência da E0.1)
- **Feito:** registrado que o `creator-hub` não tem backup (página Database → Backups vazia, plano Free),
  conforme conferido pelo responsável. Recomendado guardar um dump privado, fora do repositório.
- **Verificado:** CI verde na `main` após o merge do CP-08 (run 37950378777, commit `f66b809`).

### CP-08 — 2026-10-09 — Projeto Vercel do Creator Club
- **Feito:** registrado que o repositório está ligado ao projeto Vercel `creatorclub` (time GestaoAlliance).
  O duplicado `creatorclub-ksmg`, criado na mesma ligação, foi apagado pelo responsável no painel.
- **Verificado:** CI verde na `main` após o merge do CP-06/CP-07 (run 37949525868, commit `f87c36d`).
  A exclusão do `-ksmg` não pôde ser conferida daqui: o conector da Vercel não enxerga esses projetos.

### CP-07 — 2026-10-09 — Inventário do app antigo (E0.1)
- **Feito:** tabelas, colunas, contagens, creators por status, marcas e migrações do `creator-hub` registradas
  em `docs/CONTEXTO.md`. Leitura feita por consultas `select` rodadas no SQL Editor por quem tem acesso;
  nada foi alterado e nenhuma conta da Botanika foi conectada.
- **Principais achados:** 52 creators, todas `APPROVED` com cupom, cadastradas em lote (21–30/07); só 1 aceitou
  termo e só 1 tem login. **Nenhum saque** registrado no app. Duas lojas (Botanika e VermeFree) sem
  `read_all_orders`. Dinheiro em `double precision`.
- **Segurança:** um achado sobre o app antigo foi passado ao responsável e fica fora deste repositório, que é
  público (D-PUBLIC).
- **Pendente:** confirmar se há backup do `creator-hub`.

### CP-06 — 2026-10-09 — Separação das contas e fonte do inventário (D-ACCT, D-E0SRC)
- **Feito:** D-ACCT complementada (só o Claude fica na Botanika; todas as ferramentas na Gestão Alliance).
  D-E0SRC: E0.1 usa exportação do `creator-hub`, sem conectar a conta da Botanika. E0.1 marcada como
  bloqueada até a exportação chegar.
- **Verificado:** CI verde na `main` após o merge do CP-05 (run 37947443371, commit `6db46e8`).

### CP-05 — 2026-10-09 — Migração para as contas da Gestão Alliance (D-ACCT)
- **Feito:** histórico completo da `main` de `Botanika-HUb/botanika-creator-club` (7 commits, até `ad79a40`)
  enviado sem reescrita para `GestaoAlliance/creatorclub`. D-ACCT decidida (contas da Gestão Alliance);
  endereço novo no `CLAUDE.md` e aqui; contas conferidas registradas em `docs/CONTEXTO.md`.
- **Verificado (só leitura):** GitHub conectado como `GestaoAlliance`. Supabase: organização "Creator Club"
  (Free) com o projeto `Creator Club` (sa-east-1, schema `public` vazio). Vercel: time "GestaoAlliance" com só
  `alliance-os`. Nada foi criado nem alterado. CI no repositório novo: run 37946319707 (commit `ad79a40`),
  primeira execução, **verde**.
- **Pendente:** D-INFRA (Free ou pago) antes da E1.4; acesso de leitura à organização Supabase "Botanika" para o E0.1.

### CP-04 — 2026-10-09 — CI no GitHub Actions (E1.3)
- **Feito:** `.github/workflows/ci.yml` em todo push na `main` e em PR: `npm ci` (gera cliente Prisma),
  typecheck, testes unitários, testes de integração com Postgres 16 de serviço, checagem de divergência
  migração × schema (`prisma migrate diff --exit-code`) e build. Actions fixadas por hash de commit (v5, Node 24).
- **Verificado:** YAML válido; passo de divergência testado localmente (sai 0 sem divergência, 2 com divergência).
  Primeira execução no GitHub (run 37942062366, commit `30daa74`): **verde em todos os passos**, ~1 min.
  O log do Postgres do runner mostra cada trava disparando nos testes (somente inserção, sinal por tipo,
  FK por marca, saque aberto único, sobreposição de vigência, papéis).

### CP-03 — 2026-10-09 — Schema do banco (E1.2)
- **Feito:** Prisma 7.10.0 + `@prisma/adapter-pg`; schema com 20 tabelas do núcleo e migração `core`.
  Travas em SQL: taxas e descontos em faixa válida; vigência de taxa e de dona de cupom sem sobreposição
  (`EXCLUDE` com `btree_gist`); extrato e auditoria só de inserção (gatilho); sinal do lançamento coerente
  com o tipo; crédito/estorno exige pedido; um saque em aberto por creator (índice parcial); só SUPER_ADMIN
  global; FKs compostas `(id, brandId)` impedem misturar marcas; tudo com `Restrict`.
- **Verificado:** 13 testes de integração contra Postgres 16 real, cada um exigindo o nome exato da trava;
  32 unitários; typecheck; build. Migração aplicada em banco vazio sem divergência com o schema.
  Schemas de teste apagados ao fim (0 restantes).
- **Decisões técnicas:** D-INTCENTS e D-COUPONOWNER (ver `docs/DECISIONS.md`). Cliente Prisma gerado fora do Git.
- **Fora do escopo, de propósito:** convite de creator (`CreatorInvite`) entra na E2; contrato/envio/pipeline no L2.

### CP-02 — 2026-10-09 — Esqueleto do app (E1.1)
- **Feito:** Next.js 16.3.8 + React 19.3.0 + Tailwind 4 junto do núcleo de domínio; layout em pt-BR,
  página "Em construção", `GET /api/health` (liveness), cabeçalhos de segurança, alias `@/` em app e testes.
- **Verificado:** 32 testes; `npm run typecheck` e `npm run build` passando a partir de clone limpo
  (sem `.next/`); app subiu com `next start`: `/api/health` 200 com JSON, `/` 200, `X-Frame-Options: DENY`,
  sem `X-Powered-By`.
- **Decisão técnica:** `next-env.d.ts` fora do Git; `typecheck` roda `next typegen` antes do `tsc`
  (sem isso o typecheck quebra em clone limpo, ex.: CI).

### CP-01 — 2026-10-09 — Núcleo de domínio
- **Feito:** regras de dinheiro em `src/domain` (centavos/bps, cupom novo só letras ≤8, taxa com vigência,
  atribuição first_creator_code_v1, comissão incremental idempotente por versão do pedido, saldo com
  retenção/reserva sem corte em zero, regras de saque 10–15 em São Paulo).
- **Verificado:** 31 testes passando; typecheck limpo.
- **Commit:** `d46660a`.
- **Pendências registradas:** D-HOLD usa 0 dias até decisão.

## Como retomar em um chat novo

Cole isto no início do chat:

> Projeto Creator Club v2, repositório `GestaoAlliance/creatorclub`.
> Leia `CLAUDE.md`, `docs/PROGRESS.md` e `docs/DECISIONS.md` antes de qualquer coisa.
> Faça só a "Próxima tarefa" de `docs/PROGRESS.md`, uma por vez, e atualize o arquivo ao terminar.
