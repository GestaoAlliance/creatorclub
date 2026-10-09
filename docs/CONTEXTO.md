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
| 24 | Login sem limite de tentativas; sessão de 30 dias sem revogação | Supabase Auth; MFA para super admin e pagamento |
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
- **Supabase:** o conector só enxerga a organização "Botanika" (plano Free) com os mesmos 2 projetos acima
  (`creator-hub` e `Botanika`, ambos ativos em `sa-east-1`). **Nenhuma organização da Gestão Alliance visível.**
- **Vercel:** o conector só enxerga o time "BotanikaBrasil" com os mesmos 4 projetos acima.
  **Nenhum time da Gestão Alliance visível.**
- Nada foi criado nem alterado em nenhuma conta. Para a E1.4, conectar (ou dar acesso a) as contas Supabase e
  Vercel da Gestão Alliance; o E0.1 (inventário do `creator-hub`) continua lendo a organização "Botanika".
