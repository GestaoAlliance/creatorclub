# Referência: portal de creators da Bigboom

> Engenharia reversa **só olhando**, autorizada pelo dono da Bigboom (mentor do responsável). Feita em 2026-10-21.
> Nada foi criado, editado ou enviado lá. Este documento descreve o produto com palavras nossas: não copiar código,
> marca nem textos dele. **Não é decisão:** cada item da seção 3 precisa do OK do responsável antes de virar tarefa.

## 1. O que foi visto (e o que não foi)

- **Visto:** o portal da creator, com o login que estava aberto no Chrome. É uma conta de teste com a parceria
  **encerrada** no próprio dia e **sem nenhuma venda**: todas as listas apareceram vazias.
- **Não visto:** o lado da equipe (captação, análise, aprovação, contrato, criação de cupom, envios, pagamento de
  saque). O endereço de admin devolve para o portal com esse login. O responsável escolheu escrever só com o que foi
  visto. Para completar, falta um login de equipe e, se possível, uma creator ativa com vendas e saldo.
- Capturas: ficam **fora do repositório**, porque mostram dados pessoais da conta de teste. Nenhum dado pessoal dela
  entra neste documento.

## 2. Mapa do portal da creator

Uma marca só, menu no topo com 5 abas: **Início, Vendas, Saque, Loja, Conta**. E-mail da pessoa e "Sair" no canto.
Todo carregamento mostra blocos cinzas no lugar do conteúdo antes dos dados chegarem.

### Aviso de parceria encerrada (em todas as abas)
Faixa fixa no topo: diz **a data** em que a parceria acabou e o que muda e o que não muda. O saldo continua dela, ela
ainda pode sacar e usar na loja, e o cupom parou de funcionar, então não entram vendas novas.

### Início
- Saudação e uma linha com **as condições dela: % de comissão e % de desconto do cupom**.
- Cartão grande **"Disponível para saque"**, com a explicação de que a comissão só entra ali depois da carência.
- Três cartões menores:
  - **A liberar**: comissão ainda na carência.
  - **Aguardando**: vendas cujo cliente **ainda não pagou** (Pix ou boleto pendente).
  - **Já usado**: soma do que já saiu do saldo, ou seja, **saques pagos e compras na loja**.
- **Últimas vendas**, com "ver todas", que leva a Vendas. Vazio: um convite para divulgar o link ou o cupom.

### Vendas
- Três indicadores dos **últimos 30 dias**: valor vendido (GMV), número de vendas e ticket médio.
- **Histórico** com todas as datas e situações, sem o corte de 30 dias e com a comissão de cada venda. A tela avisa
  que os indicadores e a lista usam períodos diferentes.

### Saque
- Mostra o disponível agora.
- Regra na tela: **saca tudo de uma vez**, com a **nota fiscal do valor**. O pagamento vai para o **CPF ou CNPJ do
  cadastro**, sem pedir Pix na hora.
- Vazio: explica que as vendas só aparecem ali depois da carência.
- Bloco no fim: **"usar o saldo em produto"**, com botão para a Loja.

### Loja
- **A creator troca saldo por produtos da marca**, e a tela mostra o disponível.
- Sem saldo, os produtos nem aparecem, e a tela explica que eles surgem quando a comissão liberar.
  Não deu para ver o catálogo, o carrinho nem a finalização, porque a conta de teste não tinha saldo.

### Conta ("Meus dados")
- Um só cartão de cadastro: nome, CPF, telefone, CNPJ, CEP, endereço, bairro, cidade/UF e o **cupom com o link
  dela** (o link da loja que já aplica o cupom).
- Explica para que servem os dados: endereço de entrega e documento que recebe o saque.
- **Nome, CPF e e-mail só a equipe altera.** O resto ela edita pelo botão "Editar", que não foi aberto: o sistema de
  permissões bloqueou o clique, e o formulário não foi visto.

### Regras visíveis
| Regra | Como aparece |
|---|---|
| Comissão e desconto fixos por creator | "% de cada venda" e "% de desconto" no Início |
| Carência antes de liberar | Comissão em "A liberar" até passar a carência (o prazo não aparece) |
| Venda não paga não conta | Fica em "Aguardando", fora do saldo |
| Saque sempre do total | Sem valor parcial, NF do valor total |
| Destino do pagamento | CPF ou CNPJ do cadastro |
| Saldo vira produto | Loja paga com o disponível |
| Encerrar não apaga o saldo | Pode sacar e comprar depois de encerrada; cupom desligado |
| Dados sensíveis travados | Nome, CPF e e-mail só pela equipe |

## 3. O que eles têm e nós não temos (adaptado à Alliance)

Comparado com o portal atual (`/portal/[marca]`: Início, Vendas, Cupom, Saque, Envios, Avisos).

### 3.1 Loja: usar o saldo em produtos (o maior ganho)
Nós só temos o saque em dinheiro com NF. Para a Alliance, isso seria **por marca**: o saldo da Botanika compra
produtos da Botanika, e o mesmo vale para VermeFree e Revita Derma, cada uma com o catálogo que já sincronizamos
(D-SHIPPRODUCTS). A compra viraria um **lançamento de saída no extrato**, como o saque (o extrato só recebe inserções), e um
**envio** na fila do Envio, aproveitando o que já existe para os kits (D-KIT). A Revita só entra depois da loja (A3).

**Perguntas antes de desenhar (regras de negócio, não inventar):**
1. As marcas querem isso? Com que preço: o de venda, com desconto ou o de custo?
2. Comprar com saldo depende da liberação do dia 1 (D-CONTRACT) e da janela do dia 1 ao 10, ou vale o mês todo?
3. Precisa de NF quando a creator usa o saldo em produto?
4. Uma creator de duas marcas pode usar o saldo de uma na loja da outra? (Proposta: não, cada marca com o seu.)
5. Frete: quem paga?
6. Saldo negativo (D-NEG) bloqueia a compra? (Proposta: só compra com o disponível positivo.)

### 3.2 Cartão "Aguardando" (venda feita, ainda não paga)
Hoje um pedido só existe para a creator depois de pago (D-PAIDAT): Pix ou boleto pendente fica invisível, e ela acha
que a venda sumiu. Proposta: mostrar o **valor das vendas aguardando pagamento**, **fora do saldo e do extrato**. Isso
não mexe nas regras de dinheiro. Precisa conferir se o sync já guarda o pedido pendente com o cupom (E3) e definir
quando um pendente sai da lista (Pix vencido, boleto não pago).

### 3.3 Cartão "Já usado"
Total do que já saiu do saldo (saques pagos e, se 3.1 existir, compras). Sai direto da soma do extrato. Ajuda a
creator a entender "quanto já ganhei de verdade".

### 3.4 Condições dela no Início
Uma linha com **a comissão e o desconto do cupom** dela, em cada marca. Nós já temos os dois (taxa vigente e
desconto do cupom), mas eles só aparecem no contrato.

### 3.5 Aba "Meus dados" no portal
Hoje o endereço fica no cartão de Envios, e CPF/CNPJ/telefone não aparecem para ela. Proposta: uma aba de cadastro
com o mesmo corte deles (nome, CPF e e-mail só a equipe muda; telefone e endereço ela mesma), mais o cupom e o link.
Para a Alliance: **o cadastro da pessoa é um só** (`CreatorAccount`) e vale para todas as marcas, mas o cupom e o
link são **de cada marca**. Pergunta: CNPJ e razão social (que vão no contrato e na NF) ela pode trocar sozinha ou só
a equipe?

### 3.6 Aviso de encerramento mais completo
O nosso já diz que a participação foi encerrada e que ela continua vendo saldo e extrato. Falta mostrar **a data** e
dizer o que ainda dá para fazer (sacar o que sobrou; usar na loja, se 3.1 existir). Pergunta: creator desligada ainda
pode sacar o saldo liberado? Isso precisa ser confirmado nas regras de saque (D-CONTRACT).

### 3.7 Pequenas coisas de tela
- Saque com um caminho para "usar em produto" (só se 3.1 existir).
- Vazios que explicam o próximo passo: o nosso já faz isso na maioria das telas, mas vale revisar uma por uma.

## 4. Onde nós já vamos além (não copiar o modelo deles)
- **Liberação mensal pelo mínimo do contrato** (D-CONTRACT, D-KITANA) em vez de carência por venda. O cartão "A
  liberar" deles é parecido com o nosso, mas a regra é outra. A nossa continua valendo.
- **Várias marcas** com painel da Alliance, cupom, taxa e loja por marca (D-ALLIANCE).
- **Envios e kits** (boas-vindas e mensal) escolhidos no portal; **Avisos** (sininho e e-mail); **contrato e termo**
  assinados no portal; página de **Cupom** com compartilhar; filtro de **período** em Vendas (D-PERIOD), que cobre os
  30 dias deles.
- Saldo que pode ficar negativo e extrato só de inserções (D-NEG). Não deu para ver como eles tratam
  estorno.

## 5. Para completar esta referência
1. Login de **equipe** da Bigboom, para mapear captação → análise → aprovação → contrato → cupom → envios → pagamento.
2. Uma **creator ativa com vendas e saldo**, para ver o histórico preenchido, o formulário de saque e a Loja por dentro.
3. Abrir o "Editar" de Meus dados (fica bloqueado sem autorização explícita, mesmo sem salvar).
