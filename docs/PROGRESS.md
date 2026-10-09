# Progresso — Creator Club v2

> **Fonte da verdade do andamento.** Ler este arquivo inteiro no início de toda sessão.
> Atualizar ao fim de cada tarefa, no mesmo commit da tarefa.

## Onde estamos

- **Fase atual:** Lançamento 1 (creators já ativas da Botanika) → E1 e E2 concluídas; E3 em andamento
- **Próxima tarefa:** E3.4 — Webhook `/api/webhooks/shopify/[marca]`. E0.2–E0.4 seguem quando as pessoas responderem.
  Em paralelo, quando as pessoas responderem: E0.2, E0.3, E0.4.
- **Bloqueios:** E0.2 depende do Pagamento (Juci/Pâmela); E0.3 de acesso de admin ao Shopify; E0.4 do Vitor.
  `creator-hub` **sem backup**: recomendado guardar um dump privado antes de qualquer pausa do projeto.
  E1.4: contas da Gestão Alliance conectadas; falta decidir D-INFRA (organização Supabase está no plano Free).
- **Repositório:** `GestaoAlliance/creatorclub` (desde 2026-10-09; o antigo `Botanika-HUb/botanika-creator-club` não recebe mais commits)

## Fila de tarefas (uma por vez, nesta ordem)

Legenda: `[ ]` a fazer · `[~]` em andamento · `[x]` feito · `[!]` bloqueado · `[-]` adiado

### E0 — Inventário (só leitura; nada muda em produção)
- [x] **E0.1** Inventário do app antigo: o projeto Supabase `creator-hub` está **ativo** — levantar tabelas e
  contagens (creators, cupons, saques, termos) sem alterar nada; conferir se há backup; registrar.
  Fonte: consultas de leitura rodadas por quem tem acesso (D-E0SRC). Resultado em `docs/CONTEXTO.md`.
  Backup: nenhum (plano Free).
- [ ] **E0.2** Lista de saques já pagos a cada creator, por qualquer meio. *Depende do Pagamento (Juci/Pâmela).*
- [ ] **E0.3** Shopify da Botanika: scopes concedidos ao app atual, `taxesIncluded`, volume de pedidos com cupom.
  Scopes já conhecidos pelo E0.1: `read_orders,write_discounts,read_products` (sem `read_all_orders`).
  `taxesIncluded = false` lido no Shopify em 2026-10-09 (D-TAX). Scopes do app novo: D-SHOPAPP.
  Falta: volume de pedidos com cupom (levantado na E3.5).
- [ ] **E0.4** Formulário do Vitor: onde roda e como pode enviar cadastros. *Depende do Vitor.*

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
- [ ] **E3.4** Webhook `/api/webhooks/shopify/[marca]`: valida HMAC, grava `WebhookEvent` + `Job` na mesma
  transação e responde 200; repetido não duplica; HMAC errado = 401 sem gravar.
- [ ] **E3.5** Reconciliação a cada 15 min (janela com margem de 30 min) e "sincronizar agora" (super admin);
  agendamento no pg_cron (D-CRON); `SyncRun` registra cada passada.
- [ ] **E3.6** Carga histórica (Bulk Operations) desde o primeiro cupom de creator (D-HIST).
- [ ] **E3.7** Loja de desenvolvimento ligada ao staging (D-DEVSTORE): app criado pelo responsável, webhooks
  registrados, pedido de teste passa por webhook e reconciliação; tela simples de saúde do sync.

### Depois de E3 (detalhar quando chegar lá)
E4 Cupons e creators atuais · E5 Atribuição e extrato no banco ·
E6 Saldo de abertura e conferência · E7 Portal da creator · E8 Saques · E9 Corte.
Detalhe de cada uma no plano: https://claude.ai/code/artifact/903360ba-744d-409e-97e8-dc11dbe57f52

## Checkpoints (mais recente primeiro)

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
