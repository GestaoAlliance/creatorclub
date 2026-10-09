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
| ~~D-ACCT~~ | ~~Donos das contas Supabase/Vercel~~ | ~~Contas da empresa, Pedro dono~~ — **substituída** em 2026-10-09 (ver D-ACCT em Decididas) | E1.4 |
| D-INFRA | Staging no Supabase Free + Vercel gratuito, ou plano pago desde o início? | Ver CONTEXTO.md (contas existentes). A organização "Creator Club" (Gestão Alliance) é Free: pausa após 7 dias sem uso; produção nunca em Free | E1.4 |
