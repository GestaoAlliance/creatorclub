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
| D-INVITE-LINK | 2026-10-09 | Enquanto não houver remetente de e-mail (D-SMTP), o convite da equipe é um **link de uso único** gerado em `/admin/equipe`, copiado e enviado pelo WhatsApp. O link aparece uma vez; o banco guarda só o hash. Remover da equipe = desativar o acesso (não apaga), com auditoria; ninguém remove o próprio super admin e sempre sobra um. | Pedro |
| D-MFA | 2026-10-09 | MFA (verificação em duas etapas) **adiado**: para uso interno não é necessário agora. Não veio da equipe nem do plano; foi sugestão da auditoria feita por IA (`CONTEXTO.md`, item 24). Para ligar no futuro: Supabase Auth já tem MFA por app autenticador (TOTP); exigir nível `aal2` no ponto central de acesso (`src/lib/auth/`) e criar a tela do QR code. Limite de tentativas de login já vem do Supabase Auth. | Pedro |
| D-ADMIN | 2026-10-09 | Complemento: `pgustavo723@gmail.com` (outro e-mail do Pedro) é SUPER_ADMIN de reserva, entrou pelo convite de teste da E2.4. | Pedro |
| D-TAX | 2026-10-09 | A loja da Botanika **não** usa preço com imposto incluso (`taxesIncluded = false`, `taxShipping = false`, moeda BRL, fuso `America/Sao_Paulo`), lido no Shopify em 2026-10-09. A base da comissão é o `currentSubtotalPriceSet` como vem, sem descontar imposto. Cada pedido guarda o próprio `taxesIncluded`; se a loja mudar, o sync avisa em vez de calcular. | Verificado no Shopify |
| D-HIST | 2026-10-09 | Carga histórica de pedidos **desde o primeiro uso de cupom de creator** na loja (data levantada no Shopify antes de importar e registrada no checkpoint). | Pedro |
| ~~D-DEVSTORE~~ | 2026-10-09 | **Substituída por D-REALSTORE** (a conta não permite criar loja de desenvolvimento). O staging testa o sync numa **loja de desenvolvimento do Shopify** (conta Shopify Partners da Gestão Alliance). A loja real da Botanika só é ligada quando a creator for usar de verdade; nenhum teste cria ou edita cupom na loja real. | Pedro |
| D-CRON | 2026-10-09 | Agendamento pelo **Supabase pg_cron** (com `pg_net`): o banco chama endereços protegidos do app (fila a cada minuto, reconciliação a cada 15 min). O segredo da chamada fica no Supabase Vault e na Vercel, nunca no repositório. Sem plano pago da Vercel para isso. | Pedro |
| D-SHOPAPP | 2026-10-09 | **App novo e próprio do Creator Club** em cada loja (criado pelo responsável no painel do Shopify), com `read_orders`, `read_all_orders`, `read_discounts` e `write_discounts`. Token e segredo do webhook guardados **cifrados** no banco (`BrandIntegration.secretEncrypted`, AES-256-GCM, chave só na Vercel). O app antigo do creator-hub é desligado depois do corte (E9). | Pedro |
| D-PAIDAT | 2026-10-09 | "Data do pagamento" do pedido (taxa vigente e D-MONTH) = `processedAt` da **primeira transação `SALE` ou `CAPTURE` com sucesso** no Shopify. Sem ela o pedido não está pago (Pix/boleto pendente, só autorização). Conferido em pedidos reais da Botanika (cartão e Pix via Mercado Pago: uma `SALE` com sucesso segundos antes do pedido). | Técnica |
| D-SHOPAPP | 2026-10-09 | Complemento: app do **Dev Dashboard** do Shopify (apps personalizados criados no admin não existem mais para lojas novas). O Creator Club guarda **Client ID + Client secret** (cifrados) e troca por uma chave de acesso que vale 24 h (*client credentials grant*), renovada sozinha; o Client secret também assina os webhooks. Esse modo exige **app e loja na mesma organização** do Shopify: a loja de teste é criada no Dev Dashboard da Gestão Alliance; para a loja real, o app terá de ficar na organização dona da loja (Botanika), a confirmar no corte (E9). | Documentação do Shopify |
| D-SYNCUI | 2026-10-09 | A tela de saúde do sync (`/admin/sync`, só super admin) é **simples e funcional**; o visual *liquid glass* entra quando as telas do portal começarem. | Pedro |
| D-CRON | 2026-10-09 | Complemento: agendamento **ligado no staging** (pg_cron `creatorclub-worker` a cada minuto; segredo `jobs_secret` no Vault; `JOBS_SECRET` na Vercel). Primeira chamada às 19:00 UTC respondeu 200. | Pedro |
| D-REALSTORE | 2026-10-09 | O staging (que é o mesmo banco que vai ao ar no corte) é ligado **já à loja real da Botanika** (`p01bpt-x2.myshopify.com`), na marca `botanika`, porque a conta da Gestão Alliance não consegue criar loja de desenvolvimento. Segurança: o app começa **só com leitura** (`read_orders`, `read_all_orders`); permissões de cupom só na E4. O app é criado no Dev Dashboard **da organização da Botanika** (exigência do Shopify para app e loja na mesma organização): exceção necessária ao D-ACCT. A marca "Loja de teste" (`teste`), criada antes, fica desligada e sem uso. A carga histórica na loja real espera a data de D-HIST (depende de D-CLASS). | Pedro |
| D-PREVIEW | 2026-10-09 | **Prévias da Vercel desligadas** para os ramos `claude/**` (`vercel.json`): não têm banco (D-MIGRATE) e gastavam metade do limite de 100 deploys/dia do plano grátis, que estourou em 2026-10-09. Deploy só da `main` (produção). O CI do GitHub continua rodando build e testes em todo PR. | Pedro |
| D-IMPORT | 2026-10-09 | Importação da E4: **só as 28 creators da Botanika** (as 24 da VermeFree entram quando a marca for ligada), a partir da **exportação do `creator-hub` de 2026-10-09** (D-E0SRC); antes do corte (E9) uma exportação nova mostra o que mudou. Dados pessoais da exportação nunca entram no repositório (D-PUBLIC). | Pedro |
| D-RATEIMPORT | 2026-10-09 | A taxa de cada creator vem do app antigo (15%; uma com 20%) e entra **"a confirmar"**: não vale para cálculo até a Ana confirmar. O mesmo vale para a dona de cada cupom e para o tipo CREATOR/PROMO (D-CLASS). | Pedro |
| D-ADMINUI | 2026-10-09 | Telas internas da equipe (sync, cupons, fichas) ficam **simples e funcionais** até as telas do portal (E7); o visual *liquid glass* entra lá. Amplia D-SYNCUI. | Pedro |

## Em aberto (usar a proposta até haver resposta; marcar no código `// DECISÃO-ABERTA: <id>`)

| ID | Pergunta | Proposta em uso | Precisa antes de |
| --- | --- | --- | --- |
| D-HOLD | Dias de retenção da comissão | 0 dias | E5 |
| D-NEG | Estorno depois de saque pago | Saldo negativo abate do próximo | E5 |
| D-MONTH | Comissão conta pela data do pedido ou do pagamento | Data do pagamento | E5 |
| D-OPEN | Saldo inicial: reconstrução ou abertura | Abertura aprovada pelo Pagamento | E6 |
| ~~D-HIST~~ | ~~Desde quando importar pedidos~~ — **decidida** em 2026-10-09 | E3 |
| ~~D-TAX~~ | ~~Loja usa preço com imposto incluso?~~ — **decidida** em 2026-10-09 (não usa) | E3 |
| D-RATE | Comissão padrão por marca (15% ou 10%) | 15% na Botanika | E4 |
| D-CLASS | Quem classifica cupons CREATOR/PROMO e confirma a dona | Ana (papel GESTAO; tela da E4.3) | E4 |
| D-PAY | Quem tem papel Pagamento | Juci e Pâmela | E2 |
| D-NF | Código de serviço e descrição da NF | — | E8 |
| D-MIN | R$ 500 é mínimo por solicitação | Sim, por solicitação | E8 |
| ~~D-ADMIN~~ | ~~E-mail do primeiro SUPER_ADMIN~~ — **decidida** em 2026-10-09 | E2.3 |
| D-SMTP | Remetente dos e-mails do Auth (convite, senha): Resend com qual domínio e conta? O e-mail padrão do Supabase só serve para teste (poucos envios por hora) | Resend, conta da Gestão Alliance, domínio a definir | E2.4 |
| D-INVITE-TTL | Prazo de validade do convite | 7 dias | E2.4 |
| ~~D-ADJUST~~ | ~~Pagamento pode ajustar saldo?~~ — **decidida** em 2026-10-09: só SUPER_ADMIN | E5 |
| D-HUNTERSRC | Como saber de qual hunter veio cada creator? UTM não parece o melhor; ideia: pelo formulário que a hunter envia à creator | — | L2 (Hunter) |
| ~~D-LOGIN~~ | ~~Forma de entrar~~ — **decidida** em 2026-10-09 | E2.1 |
| ~~D-ACCT~~ | ~~Donos das contas Supabase/Vercel~~ | ~~Contas da empresa, Pedro dono~~ — **substituída** em 2026-10-09 (ver D-ACCT em Decididas) | E1.4 |
| ~~D-INFRA~~ | ~~Staging no Supabase Free + Vercel gratuito, ou plano pago desde o início?~~ — **decidida** em 2026-10-09 (ver D-INFRA em Decididas) | Ver CONTEXTO.md (contas existentes). A organização "Creator Club" (Gestão Alliance) é Free: pausa após 7 dias sem uso; produção nunca em Free | E1.4 |
