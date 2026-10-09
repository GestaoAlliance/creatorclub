# Progresso — Creator Club v2

> **Fonte da verdade do andamento.** Ler este arquivo inteiro no início de toda sessão.
> Atualizar ao fim de cada tarefa, no mesmo commit da tarefa.

## Onde estamos

- **Fase atual:** Lançamento 1 (creators já ativas da Botanika) → E1 Base do projeto
- **Próxima tarefa:** E0.1 — inventário do app antigo no Supabase (só leitura). Depois E1.4 (aguarda D-INFRA).
- **Bloqueios:** contas Supabase e Vercel da Gestão Alliance ainda não aparecem nos conectores (só para E1.4 em diante)
- **Repositório:** `GestaoAlliance/creatorclub` (desde 2026-10-09; o antigo `Botanika-HUb/botanika-creator-club` não recebe mais commits)

## Fila de tarefas (uma por vez, nesta ordem)

Legenda: `[ ]` a fazer · `[~]` em andamento · `[x]` feito · `[!]` bloqueado

### E0 — Inventário (só leitura; nada muda em produção)
- [ ] **E0.1** Inventário do app antigo: o projeto Supabase `creator-hub` está **ativo** — levantar tabelas e
  contagens (creators, cupons, saques, termos) sem alterar nada; conferir se há backup; registrar.
- [ ] **E0.2** Lista de saques já pagos a cada creator, por qualquer meio. *Depende do Pagamento (Juci/Pâmela).*
- [ ] **E0.3** Shopify da Botanika: scopes concedidos ao app atual, `taxesIncluded`, volume de pedidos com cupom.
  *Depende de acesso de admin ao Shopify.*
- [ ] **E0.4** Formulário do Vitor: onde roda e como pode enviar cadastros. *Depende do Vitor.*

> E0 foi definida no plano como primeira etapa, mas ficou fora desta fila até 2026-10-09 (corrigido).
> As tarefas E1.1–E1.3 já feitas não dependiam dela.

### E1 — Base do projeto
- [x] **E1.1** Esqueleto Next.js (App Router, TypeScript, Tailwind) junto do núcleo de domínio; `npm test`, `npm run typecheck` e `npm run build` passando.
- [x] **E1.2** Schema Prisma do núcleo (Brand, BrandIntegration, User, RoleGrant, CreatorAccount, Creator, CommissionPolicy, Coupon, Order, OrderLine, OrderAttribution, LedgerEntry, Withdrawal, File, WebhookEvent, Job, SyncRun, AuditLog, Click) com migração inicial e restrições (únicos, FKs `Restrict`, índice parcial de saque aberto). Testes de integração contra Postgres local.
- [x] **E1.3** CI no GitHub Actions: instalar, typecheck, testes (com Postgres de serviço), build.
- [!] **E1.4** Staging: projeto Supabase (sa-east-1) e Vercel (gru1) em contas da Gestão Alliance (D-ACCT); deploy automático da `main`. *Bloqueado: contas.*

### Depois de E1 (detalhar quando chegar lá)
E2 Login e papéis · E3 Sync Shopify · E4 Cupons e creators atuais · E5 Atribuição e extrato no banco ·
E6 Saldo de abertura e conferência · E7 Portal da creator · E8 Saques · E9 Corte.
Detalhe de cada uma no plano: https://claude.ai/code/artifact/903360ba-744d-409e-97e8-dc11dbe57f52

## Checkpoints (mais recente primeiro)

### CP-05 — 2026-10-09 — Migração para as contas da Gestão Alliance (D-ACCT)
- **Feito:** histórico completo da `main` de `Botanika-HUb/botanika-creator-club` (7 commits, até `ad79a40`)
  enviado sem reescrita para `GestaoAlliance/creatorclub`. D-ACCT decidida (contas da Gestão Alliance);
  endereço novo no `CLAUDE.md` e aqui; contas conferidas registradas em `docs/CONTEXTO.md`.
- **Verificado (só leitura):** GitHub conectado como `GestaoAlliance`. Supabase e Vercel conectados ainda
  mostram só as contas da Botanika (org "Botanika" Free; time "BotanikaBrasil") — nenhuma conta da Gestão
  Alliance visível; nada foi criado nem alterado. CI no repositório novo: run 37946319707 (commit `ad79a40`),
  primeira execução, **verde**.
- **Pendente:** dar acesso às contas Supabase e Vercel da Gestão Alliance antes da E1.4.

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
