# Decisões — Creator Club v2

> Registro curto do que já foi decidido e do que está em aberto.
> Decisão nova ou mudada = nova linha com data. Nunca apagar linha antiga; marcar como substituída.

## Decididas

| ID | Data | Decisão | Quem |
| --- | --- | --- | --- |
| D-SCOPE | 2026-10-09 | Lançamento 1 atende só creators **já ativas** da Botanika (portal, saldo correto, saque). Onboarding de novas vem no L2. | Pedro |
| D-SEP | 2026-10-09 | Sistema **separado** do AllianceOS; compartilha dados com ele depois, por eventos. | Pedro |
| D-CONTRACT | 2026-10-09 | Até o Autentique entrar, contrato marcado à mão na pipeline com o **PDF assinado anexado**. | Pedro |
| D-STACK | 2026-10-09 | Next.js + TypeScript + Prisma + Postgres (Supabase Pro, sa-east-1) + Vercel (gru1). Repositório próprio. | Pedro |
| D-MONEY | 2026-10-08 | Centavos inteiros e pontos-base; extrato só de inserções; nada é apagado. | Plano |
| D-ATTR | 2026-10-08 | Primeiro cupom CREATOR da lista do pedido leva tudo; PROMO nunca atribui; atribuição gravada uma vez. | Plano |
| D-RATECHG | 2026-10-08 | Mudança de taxa vale só para pedidos pagos depois dela. | Plano |
| D-AUTH | 2026-10-08 | Login por convite (Supabase Auth); sem "reivindicar cupom"; "entrar como" fora do escopo. | Plano |
| D-ORDERS | 2026-10-09 | Guardar **todos** os pedidos (poucos campos), não só os com cupom. | Plano |
| D-INTCENTS | 2026-10-09 | Valores em `Int` (32 bits) de centavos: até R$ 21,4 milhões por linha, suficiente para pedido, lançamento e saque. Somas são feitas em SQL. Rever se algum valor individual puder passar disso. | Técnica |
| D-COUPONOWNER | 2026-10-09 | Cupom (código único por marca) separado de `CouponAssignment` (dona com vigência, sem sobreposição): troca de dona não reescreve o passado. | Técnica |
| D-QUEUE | 2026-10-09 | Webhook grava evento + tarefa no Postgres na mesma transação antes de responder; worker processa. | Plano |
| D-ACCT | 2026-10-09 | Contas do projeto passam a ser as da **Gestão Alliance** (substitui a proposta "contas da empresa, Pedro dono"). GitHub já migrado: repositório `GestaoAlliance/creatorclub` com todo o histórico de `Botanika-HUb/botanika-creator-club` (sem reescrever). Supabase: organização "Creator Club" (Free, projeto `Creator Club` em sa-east-1). Vercel: time "GestaoAlliance". Projetos novos (E1.4) nascem nessas contas (ver CONTEXTO.md). | Pedido de 2026-10-09 |
| D-ACCT | 2026-10-09 | Complemento: só o **Claude** fica na conta da Botanika. GitHub, Supabase, Vercel e qualquer outra ferramenta do projeto ficam nas contas da Gestão Alliance, separadas do resto da Botanika. Nenhuma conta da Botanika é conectada às ferramentas do projeto. | Pedido de 2026-10-09 |
| D-E0SRC | 2026-10-09 | O inventário do app antigo (E0.1) é feito a partir de uma **exportação** das tabelas do `creator-hub` (CSV ou dump) enviada por quem tem acesso à Botanika, não por conexão ao Supabase da Botanika. | Pedido de 2026-10-09 |
| D-PUBLIC | 2026-10-09 | O repositório `GestaoAlliance/creatorclub` continua **público**. Achados de segurança de sistemas em produção e dados pessoais não são registrados aqui; ficam com o responsável, fora do repositório. Contagens e regras de negócio podem ser registradas. | Pedido de 2026-10-09 |
| D-INFRA | 2026-10-09 | Staging começa no **Supabase Free** (organização "Creator Club", projeto `Creator Club`) e no projeto Vercel `creatorclub` (time GestaoAlliance), para não travar. Antes de qualquer creator usar de verdade (E9), Supabase e Vercel passam para plano pago; produção nunca em Free. | Pedido de 2026-10-09 |
| D-RLS | 2026-10-09 | Toda tabela do banco com **RLS ligado e sem políticas**: a Data API do Supabase (anon/authenticated) não lê nem grava nada; o app acessa só pelo servidor, como dono das tabelas. Teste de integração cobra RLS em toda tabela nova. | Técnica |
| D-MIGRATE | 2026-10-09 | Migrações aplicadas pelo build da Vercel **só no deploy de produção** (a `main`), via `DIRECT_URL` (session pooler 5432); o app usa `DATABASE_URL` (transaction pooler 6543). Prévias de PR não têm variáveis de banco. | Técnica |
| D-EXTPUBLIC | 2026-10-09 | A extensão `btree_gist` (EXCLUDE de vigência) fica no schema `public`: o aviso "Extension in Public" do Supabase é risco aceito. Mover exige ser dono dos tipos da extensão, o que o papel `postgres` do Supabase não é; a extensão só traz operadores de índice, sem dados. | Técnica |
| D-ADMIN | 2026-10-09 | SUPER_ADMIN (vê e faz tudo, em todas as marcas): **Pedro** (`pedrogustavolage@gmail.com`) e **Ana**. Super admins adicionam e removem pessoas da equipe ao longo do tempo (E2.4). | Pedro |
| D-LOGIN | 2026-10-09 | Entrada por **e-mail e senha** (mínimo 10) com "esqueci a senha"; link mágico só se pedirem depois. | Pedro |
| D-ROLES | 2026-10-09 | Permissões por papel (`src/lib/auth/permissions.ts`): **Gestão** vê e edita creators e cupons, vê valores, endereço, CPF e Pix. **Envio** vê lista de envio e endereço, sem valores. **Pagamento** vê creators, valores, CPF e Pix; vê saques e NF e marca como pago. **Hunter** só as próprias prospecções. Ajuste manual de saldo, conexão de loja e gestão da equipe: só SUPER_ADMIN. Negar por padrão. | Pedro |
| D-ADJUST | 2026-10-09 | Ajuste manual de saldo (lançamento `ADJUSTMENT` no extrato: bônus, correção) **só SUPER_ADMIN**. Cada ajuste é uma linha própria, com valor, motivo e quem lançou; nunca apagado (correção = novo ajuste). Motivo obrigatório na tela (E5). O saldo é a soma do extrato: o Shopify fornece só as vendas. | Pedro |

## Em aberto (usar a proposta até haver resposta; marcar no código `// DECISÃO-ABERTA: <id>`)

| ID | Pergunta | Proposta em uso | Precisa antes de |
| --- | --- | --- | --- |
| D-HOLD | Dias de retenção da comissão | 0 dias | E5 |
| D-NEG | Estorno depois de saque pago | Saldo negativo abate do próximo | E5 |
| D-MONTH | Comissão conta pela data do pedido ou do pagamento | Data do pagamento | E5 |
| D-OPEN | Saldo inicial: reconstrução ou abertura | Abertura aprovada pelo Pagamento | E6 |
| D-HIST | Desde quando importar pedidos | Desde o primeiro cupom de creator | E3 |
| D-TAX | Loja usa preço com imposto incluso (`taxesIncluded`)? | Verificar num pedido real | E3 |
| D-RATE | Comissão padrão por marca (15% ou 10%) | 15% na Botanika | E4 |
| D-CLASS | Quem classifica cupons CREATOR/PROMO e confirma a dona | Ana | E4 |
| D-PAY | Quem tem papel Pagamento | Juci e Pâmela | E2 |
| D-NF | Código de serviço e descrição da NF | — | E8 |
| D-MIN | R$ 500 é mínimo por solicitação | Sim, por solicitação | E8 |
| ~~D-ADMIN~~ | ~~E-mail do primeiro SUPER_ADMIN~~ — **decidida** em 2026-10-09 | E2.3 |
| D-SMTP | Remetente dos e-mails do Auth (convite, senha): Resend com qual domínio e conta? O e-mail padrão do Supabase só serve para teste (poucos envios por hora) | Resend, conta da Gestão Alliance, domínio a definir | E2.4 |
| ~~D-ADJUST~~ | ~~Pagamento pode ajustar saldo?~~ — **decidida** em 2026-10-09: só SUPER_ADMIN | E5 |
| D-HUNTERSRC | Como saber de qual hunter veio cada creator? UTM não parece o melhor; ideia: pelo formulário que a hunter envia à creator | — | L2 (Hunter) |
| ~~D-LOGIN~~ | ~~Forma de entrar~~ — **decidida** em 2026-10-09 | E2.1 |
| ~~D-ACCT~~ | ~~Donos das contas Supabase/Vercel~~ | ~~Contas da empresa, Pedro dono~~ — **substituída** em 2026-10-09 (ver D-ACCT em Decididas) | E1.4 |
| ~~D-INFRA~~ | ~~Staging no Supabase Free + Vercel gratuito, ou plano pago desde o início?~~ — **decidida** em 2026-10-09 (ver D-INFRA em Decididas) | Ver CONTEXTO.md (contas existentes). A organização "Creator Club" (Gestão Alliance) é Free: pausa após 7 dias sem uso; produção nunca em Free | E1.4 |
