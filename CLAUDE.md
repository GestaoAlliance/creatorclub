# Creator Club v2 — regras do projeto

Plataforma própria de gestão de creators da Botanika (multi-marca; só Botanika ligada no início).
Sistema separado do AllianceOS; depois compartilha dados com ele por eventos.
Plano vivo: https://claude.ai/code/artifact/903360ba-744d-409e-97e8-dc11dbe57f52
Repositório: `GestaoAlliance/creatorclub` (substitui `Botanika-HUb/botanika-creator-club`, que guarda o mesmo histórico
até 2026-10-09 e não recebe mais commits). Contas do projeto: Gestão Alliance (D-ACCT).

## Como trabalhar neste repositório (obrigatório)

0. **Toda resposta ao responsável é em português do Brasil.** Nunca responder em inglês (pedido do responsável).

1. **Antes de qualquer coisa**, ler `docs/PROGRESS.md` (onde estamos, próxima tarefa), `docs/DECISIONS.md`
   e, na primeira vez, `docs/CONTEXTO.md` (negócio, reunião, auditoria do app antigo, contas existentes).
2. Fazer **só a próxima tarefa** da fila, uma por vez. Não puxar trabalho de fases seguintes.
3. Toda tarefa termina com: testes e typecheck passando → `docs/PROGRESS.md` atualizado
   (marcar a tarefa, novo checkpoint `CP-NN` no topo da lista, próxima tarefa) → **um commit** → push.
4. Decisão nova ou mudada vai para `docs/DECISIONS.md` no mesmo commit.
5. Regra de negócio que não está nos documentos: perguntar, não inventar. **Qualquer dúvida** (negócio, design,
   escolha que muda o que o usuário vê): perguntar antes de executar. Nunca decidir sozinho para evitar retrabalho.
6. O repositório é a memória do projeto. O que não está aqui não aconteceu.

## Escopo atual (lançamento 1)

Creators **já ativas** da Botanika: portal com vendas, saldo correto, extrato, cupom, link e saque.
Onboarding de novas creators, Hunter, UGC, alertas e Autentique vêm depois.

## Regras de dinheiro (não negociáveis)

- Valores em **centavos inteiros**; taxas em **pontos-base** (1500 = 15%). Nunca `Float`.
- Saldo = soma do extrato (`LedgerEntry`). O extrato só recebe inserções; correção é novo lançamento.
- Nada é apagado: creator e cupom ganham status; FKs financeiras com `Restrict`.
- Atribuição: primeiro código CREATOR da lista do pedido leva o pedido; PROMO nunca atribui.
  Decidida uma vez e gravada com a lista de códigos como evidência.
- Taxa: a vigente no **pagamento** do pedido (`CommissionPolicy`), congelada na atribuição.
- Comissão incremental: `devido − lançado`; chave de idempotência inclui a versão do pedido.
- Base: subtotal atual dos produtos (`currentSubtotalPriceSet`), só pedidos `PAID`/`PARTIALLY_REFUNDED`,
  não cancelados, não teste. Conferir `taxesIncluded` da loja antes de fechar a regra.
- Saldo pode ficar negativo; nunca cortar em zero (D-NEG: abate das próximas comissões).
- Comissão liberada no fechamento do mês (dia 1) quando as vendas acumuladas chegam ao mínimo do contrato (D-CONTRACT,
  substitui D-HOLD); saque com NF do valor total do dia 1 ao 10; a venda conta no mês do pagamento (D-MONTH).
- Datas em UTC; "dia"/"mês"/janela de saque em `America/Sao_Paulo`.

## Arquitetura

- Nenhuma tela consulta o Shopify. Shopify só por webhook, reconciliação, carga histórica e ações de cupom.
- Webhook: valida HMAC, grava evento + tarefa na fila do Postgres na mesma transação, depois responde 200.
  Nada roda "depois da resposta".
- Todo cupom gravado no Shopify (criar ou editar) leva `combinesWith` com order/product/shipping = true.
- Login por convite; não existe "reivindicar cupom". "Entrar como" fora do escopo; exceção: super admin vê o portal
  de uma creator só para leitura (D-VIEWAS).

## Decisões em aberto (marcar no código com `// DECISÃO-ABERTA: <id>`)

- Nenhuma no momento (D-OPEN decidida em 2026-10-10: D-OPENFLOW e D-ANAREVIEW).

## Comandos

- `npm test` — testes unitários (Vitest, `test/*.test.ts`, sem banco)
- `npm run test:integration` — testes contra Postgres real (`test/integration/`); exige `TEST_DATABASE_URL`.
  Cada execução cria um schema descartável, aplica as migrações reais e apaga no fim.
- `npm run db:migrate` — aplica migrações (`prisma migrate deploy`); `npm run db:generate` — gera o cliente
- `npm run typecheck` — gera os tipos de rota do Next e roda `tsc`
- `npm run build` — build de produção do Next
- `npm run dev` — app local em http://localhost:3000
- `GET /api/health` (app no ar) e `GET /api/ready` (app alcança o banco)
- `POST /api/forms/[marca]/hunter` e `/captacao` — respostas dos formulários Hunter e Captação (scripts em `docs/forms/`), com `Authorization: Bearer $FORMS_SECRET`
- `POST /api/jobs/run` — worker da fila (`src/lib/jobs/`), só com `Authorization: Bearer $JOBS_SECRET` (D-CRON)
- `node scripts/grant-super-admin.mjs "email:Nome"` — dá SUPER_ADMIN a quem já tem usuário no Supabase Auth

## Login (Supabase Auth)

- Sessão em cookies via `@supabase/ssr`; `src/proxy.ts` só renova a sessão. Acesso é decidido no servidor,
  em cada página e ação (nunca só no proxy).
- Depois de entrar, redirecionar só com `safeNextPath` (`src/lib/auth/rules.ts`): nunca para outro site.
- Mensagens de erro de login não revelam se a conta existe.
- `SUPABASE_SECRET_KEY` só em código de servidor (`src/lib/supabase/admin.ts`, com `server-only`).
- Convite: token aleatório mostrado uma vez; no banco só o hash (`src/lib/team/tokens.ts`).

## Stack fixada

Next.js 16.3.8 (App Router, Turbopack), React 19.3.0, Tailwind 4, TypeScript 5.9, Vitest 3. Versões exatas no
`package.json` (`--save-exact`). Antes de escrever código do Next, consultar a documentação da versão instalada em
`node_modules/next/dist/docs/`: a API muda entre versões (ex.: `middleware` virou `proxy`).
`next-env.d.ts` é gerado e fica fora do Git.

## Banco (Prisma 7)

- Prisma 7.10.0 com `@prisma/adapter-pg`; cliente gerado em `src/generated/prisma` (fora do Git, gerado no
  `postinstall`). Conexão do app em `src/lib/db.ts`. Configuração em `prisma.config.ts` (URL vem de `DATABASE_URL`).
- Na Vercel, `scripts/vercel-build.mjs` aplica as migrações só no deploy de produção, com `DIRECT_URL` (D-MIGRATE).
- Toda tabela nova liga RLS na própria migração (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), D-RLS.
- Travas que o Prisma não expressa ficam em SQL no fim da migração (`CHECK`, `EXCLUDE` contra sobreposição de
  vigência, índices parciais, gatilhos de "somente inserção"). Toda trava nova ganha teste de integração que
  exige o **nome** da trava no erro (`expectDbError`).
- Depois de mudar o schema: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  num banco recém-migrado precisa sair vazio (sem divergência).
- `prisma migrate reset` é bloqueado quando roda pelo Claude. Para recomeçar do zero localmente, criar um banco novo.

## Design

Tela nova só vai ao ar com o OK do responsável sobre capturas no PR (D-REVIEW).

Todas as telas (creator e equipe) usam o mesmo visual (D-DESIGNALL): peças em `src/components/ui/`.
Antes de construir qualquer tela, ler `docs/design/DESIGN.md`: *liquid glass*, base monocromática, cor de destaque
da marca vinda do banco (troca conforme a marca). Referências de código em `docs/design/referencias/` (só referência).

## Convenções

UI e textos em português do Brasil; código e nomes de tabelas em inglês.
Mudanças pequenas, cada uma com teste.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
