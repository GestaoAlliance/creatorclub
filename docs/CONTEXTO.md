# Contexto do projeto — Creator Club v2

> Resumo do negócio, do que mudou na reunião e do que a auditoria do app antigo encontrou.
> Fonte para quem chegar agora (pessoa ou IA). Detalhes completos no plano:
> https://claude.ai/code/artifact/903360ba-744d-409e-97e8-dc11dbe57f52

## O que é

Plataforma própria de gestão de creators (influencers, UGC e prescritores) no modelo da Inbazz.
A creator entra por formulário, é aprovada, recebe produtos, ganha cupom único e link rastreado na loja
Shopify da marca, acompanha as próprias vendas, acumula comissão e pede saque com nota fiscal.

- **Marcas:** Botanika primeiro (validar 100%), depois VermeFree e Revita (Shoty citada só no brief).
- **Pessoas e papéis:** Pedro (super admin), Ana (gestão), Álvaro (envio), Juci e Pâmela (pagamento —
  confirmar, ver D-PAY), Hunter (prospecção), creators.
- **Integrações:** Shopify por marca; Autentique por marca (depois); WhatsApp via n8n + API não oficial;
  Correios manual; Alelo manual (indefinido); e-mail via Resend.

## Regras de negócio combinadas

- Comissão sobre o valor dos produtos (sem frete), só pedidos pagos; pedido com dois cupons de creator
  conta para um só; comissão (interna) e desconto do cupom (Shopify) são campos separados e editáveis por pessoa.
- Cupom novo: só letras, até 8 caracteres, escolhido no formulário; UGC puro não tem cupom.
- Todo cupom no Shopify com `combinesWith` ligado (senão quebra em kits com desconto automático).
- Saque: janela dia 10 a 15, mínimo R$ 500, NF obrigatória, saque parcial permitido; o Pagamento marca pago
  sem precisar anexar comprovante.
- Alertas: 15 dias sem venda (alerta), 30 (contato), 60 (desativar cupom — automático ou só alerta: D-60D).
- Etiqueta no WhatsApp e entrada no grupo: checklist manual no card da creator.

## O que a reunião de 08/10 mudou em relação ao brief

| Ponto | Brief | Reunião |
| --- | --- | --- |
| Quando vira Ativa | Contrato assinado + pedido recebido | No envio do pedido; recebimento só dispara mensagem |
| Contrato | Autentique na aprovação | Fora da primeira versão; marcado à mão (com PDF) até o modelo da agência |
| Formulário | Reaproveitar o existente | É o do Vitor (provável AllianceOS); o v2 recebe os cadastros dele |
| Escopo extra | — | Campanhas com inscrição, níveis, push diário de vendas: depois do MVP |
| Marcas | 4 | 3 citadas (Shoty não) |

## Auditoria do app antigo (`creator-hub`) — o que NÃO repetir

Leitura estática do código (sem acesso ao banco nem à loja). Cada item já tem resposta no v2.

| # | Problema no app antigo | Como o v2 resolve |
| --- | --- | --- |
| 1 | Saldo do saque soma vendas sem dedupe (só o relatório do admin deduplica) | Atribuição única por pedido, gravada (`OrderAttribution`) |
| 2 | Comissão = vendas de todo o período × taxa **atual** | Taxa com vigência, congelada no pagamento (`CommissionPolicy`) |
| 3 | "Reivindicar cupom": quem sabe um cupom importado assume o painel | Login só por convite |
| 4 | Remover creator apaga saques e NFs (cascade) | Nada financeiro é apagado (`Restrict`, status) |
| 5 | `Math.max(0, …)` esconde saldo negativo | Saldo pode ficar negativo, visível |
| 6 | Saque sem trava (dois cliques = dois saques), sempre o saldo inteiro, mínimo errado | Um saque aberto por creator (índice no banco), parcial, regras da marca |
| 7 | Toda tela consulta o Shopify ao vivo (cache de 180 s) | Telas leem só do banco; sync por webhook + reconciliação |
| 8 | Token e secret do Shopify em texto puro | Segredos cifrados |
| 9 | NF e banner gravados dentro do Postgres | Storage privado |
| 10 | E-mail de aprovação mostra a comissão como "desconto do cliente" | Campos separados |
| 11 | Cupom aceita números e 12 caracteres | Só letras, até 8 |
| 12 | Todo deploy redefine a senha do admin; sem "esqueci a senha" | Supabase Auth; seed nunca sobrescreve |
| 13 | Dinheiro em `Float` | Centavos inteiros |
| 14 | Relatório só lista creators aprovadas | Relatório sai do extrato |
| 15 | Início do mês em UTC | Datas de negócio em America/Sao_Paulo |
| 16 | Só dois níveis de admin; API Shopify 2025-01 | Papéis por marca; API estável atual |
| 17 | "Entrar como" abre a conta inteira (outras marcas) e permite saque | Fora do escopo |
| 18 | Não pede `read_all_orders`: Shopify só devolve 60 dias | Pedir o escopo e conferir antes da carga |
| 19 | Editar cupom não regrava `combinesWith` | Toda gravação regrava |
| 20 | "Importar cupons" transforma cupom promocional em creator | Tipo CREATOR/PROMO, classificado pela Ana |
| 21 | Falha do Shopify vira saldo zero | Mostrar último dado do banco e hora da sync |
| 22 | OAuth com `state` reaproveitável e sem conferir a loja | Nonce de uso único, loja esperada |
| 23 | Trocar tipo de cupom apaga antes de recriar | Criar o novo antes de apagar o antigo |
| 24 | Login sem limite de tentativas; sessão de 30 dias sem revogação | Supabase Auth (limite de tentativas); MFA adiado (D-MFA) |
| 25 | Só 50 itens por pedido lidos | Paginar itens |

## O que existe hoje nas contas (levantado em 2026-10-09, só leitura)

- **Supabase**, organização "Botanika", **plano Free**, 2 projetos ativos em `sa-east-1`:
  `creator-hub` (app antigo, criado 2026-07-17, **ativo**) e `Botanika` (criado 2026-06-10, uso a confirmar).
  O brief diz que os dados do app antigo se perderam com a pausa; o projeto aparece **ativo**, então os dados
  podem ainda existir. Verificar no E0, sem alterar nada.
- **Vercel**, time "BotanikaBrasil": projetos `central`, `operacional`, `planejador-tap` e `creator-club`
  (provavelmente o app antigo). Plano do time não informado pela API.

## Contas da Gestão Alliance (D-ACCT, conferido em 2026-10-09, só leitura)

- **GitHub:** conta `GestaoAlliance` ("Gestão Alliance"). Repositório do projeto: `GestaoAlliance/creatorclub`,
  com a `main` idêntica à do antigo `Botanika-HUb/botanika-creator-club` (7 commits, até `ad79a40`, sem reescrita).
  O repositório antigo deixa de receber commits.
- **Supabase:** organização **"Creator Club"** (id `mytknzgmocxhrkfpxbut`), **plano Free**, com 1 projeto:
  `Creator Club` (ref `svrntecpbdgudueqiosh`, `sa-east-1`, Postgres 17, criado 2026-10-09, ativo; schema `public`
  vazio). Criado fora desta sessão; é o candidato ao staging da E1.4.
- **Vercel:** time **"GestaoAlliance"** (slug `gestaoalliance`, id `team_NMkkIPjNnY1WbCVxBMbnpEEO`), com 1 projeto:
  `alliance-os` (AllianceOS). Ainda não há projeto do Creator Club. Plano do time não informado pela API.
- **Vercel, projeto do Creator Club** (2026-10-09): o repositório foi ligado à Vercel fora desta sessão e gerou
  **dois** projetos no time GestaoAlliance, ambos publicando prévias dos PRs: `creatorclub`
  (`prj_rkJhwGQR6MfItmgsHDTxrUoDgXQz`) e `creatorclub-ksmg` (`prj_gYmxvtxuvMaUXVw235xnQRxnepxd`, duplicado).
  O `creatorclub-ksmg` foi **apagado** pelo responsável no painel; fica o **`creatorclub`**. O conector da
  Vercel ainda não enxerga nenhum dos dois (404).
- **Staging no ar (E1.4, 2026-10-09):** https://creatorclub-six.vercel.app — funções em `gru1`, banco no projeto
  Supabase `Creator Club` (`DATABASE_URL` pelo transaction pooler 6543; `DIRECT_URL` pelo session pooler 5432,
  só no ambiente Production da Vercel).
- Primeira conferência (mesmo dia, antes da troca dos conectores): só apareciam as contas da Botanika
  (seção anterior). Depois da troca, **a organização "Botanika" do Supabase e o time "BotanikaBrasil" da Vercel
  não aparecem mais** nos conectores.
- Nada foi criado nem alterado em nenhuma conta. Só o Claude fica na conta da Botanika; nenhuma conta da
  Botanika é conectada às ferramentas do projeto. O E0.1 lê uma exportação do `creator-hub` (D-E0SRC).

## Inventário do app antigo `creator-hub` (E0.1, 2026-10-09, só leitura)

Fonte: consultas `select` rodadas no SQL Editor por quem tem acesso à Botanika (D-E0SRC). Nada foi alterado.
Um achado de segurança foi passado ao responsável e não é descrito aqui (D-PUBLIC).

**Tabelas (schema `public`) e linhas**

| Tabela | Linhas | Conteúdo |
| --- | --- | --- |
| `Brand` | 2 | Marca, conexão Shopify, taxas padrão, termo, meta, campanha e briefing |
| `Creator` | 52 | Cadastro, cupom, taxa, aceite do termo, endereço de envio, CPF, Pix, contrato |
| `CreatorAccount` | 2 | Login da creator (e-mail + senha) |
| `Admin` | 2 | Login de admin, opcionalmente preso a uma marca |
| `Click` | 1.223 | Clique no link rastreado (IP, user agent, referrer, landing) |
| `Withdrawal` | **0** | Saque, com NF gravada no banco (`nfData bytea`) |
| `BrandAsset` | 0 | Arquivos da marca gravados no banco (`bytea`) |

Migrações Prisma: 11, de `20260717000000_init` a `20260824020000_briefings` (última aplicada em 2026-08-24).

**Creators** — todas as 52 com status `APPROVED` e cupom; criadas entre 2026-07-21 e 2026-07-30 (cara de
importação em lote, não de formulário). Aceitaram o termo: 1. Com login (`accountId`): 1. Reivindicadas
(`claimed`): 1. Ou seja, quase nenhuma creator usou o portal antigo, e as 52 precisam ser classificadas
(CREATOR/PROMO e dona) na E4 (D-CLASS) — ver item 20 da auditoria.

**Termos** — não há tabela própria: texto e versão em `Brand` (`termTitle`, `termBody`, `termVersion` = 1);
aceite em `Creator` (`termsAcceptedAt`, `termsVersion`, `termsName`, `termsCpf`, `termsIp`).

**Saques** — nenhum registrado. Tudo o que já foi pago saiu por fora do app: a E0.2 (Pagamento) é a única fonte.

**Marcas** — `botanika` (Botanika) e `vermfree` (VermeFree), ambas com app Shopify instalado em 2026-07-22,
escopos `read_orders,write_discounts,read_products` (**sem `read_all_orders`**: só 60 dias de pedidos — item 18).
Valores gravados: comissão padrão 0,15, desconto padrão 0,05, `withdrawalMinSales` 1000 (o combinado é saque
mínimo de R$ 500 por solicitação — D-MIN; o app antigo media outra coisa), meta mensal.

**Tipos** — taxas, metas, mínimo e valor de saque em `double precision` (item 13); datas em
`timestamp without time zone`. Na carga para o v2, converter para centavos/pontos-base com arredondamento
explícito e conferir.

**Backup** — **nenhum** (página Database → Backups vazia, plano Free; conferido em 2026-10-09). Os dados do
`creator-hub` existem só no banco ativo: se o projeto for pausado ou apagado antes da migração (E4/E6), eles se perdem.
Recomendação: quem tem acesso guardar uma cópia (dump) em local seguro e privado, fora deste repositório.

## Código do app antigo (recebido em 2026-10-09)

O código-fonte do `creator-hub` foi enviado pelo responsável (zip) e lido só como referência; **não entra neste
repositório** (D-PUBLIC). Bate com a auditoria acima. Ponto a não esquecer no corte (E9): os links rastreados das
creators apontam para a rota `/r/[marca]/[código]` do app antigo; o v2 precisa manter essas URLs funcionando
(mesma rota ou redirecionamento), senão os links nas bios param.
