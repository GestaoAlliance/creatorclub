# Design — Creator Club v2

> Direção visual definida pelo responsável em 2026-10-09. **Só referência**: não muda a ordem da fila.
> Usar quando as telas de verdade forem construídas (portal da creator, painel dos admins).
> Dúvida de design: perguntar antes de fazer, nunca decidir sozinho (ver `CLAUDE.md`).

## Linha escolhida

- **Estilo:** *liquid glass* (vidro translúcido, desfoque, brilho nas bordas), com cara de app.
- **Cores:** base **monocromática e minimalista** (preto, branco, cinzas). A cor entra só como destaque.
- **Identidade por marca:** cada marca tem a sua cor de destaque, e a interface troca de cor conforme a marca em
  que a pessoa está. Exemplo: uma creator que participa da Botanika e da VermeFree vê a cor de cada marca ao
  alternar entre elas. É o diferencial visual do produto.
- **Painel (dashboard):** layout com **barra lateral recolhível** (ícones + rótulos, recolhe para só ícones),
  cabeçalho com notificações, tema claro/escuro e perfil; grade de cartões de indicadores (KPIs); lista de
  atividade recente; cartões laterais de resumo.
- **Indicadores e menus:** os da referência são de exemplo. Os de verdade seguem o que cada papel precisa
  (creator, Gestão, Envio, Pagamento, super admin) e o que cada um pode ver (E2.2).

## Referências recebidas (código de exemplo, não é código do app)

| Arquivo | O que é | Usar para |
| --- | --- | --- |
| `referencias/dashboard-com-sidebar.md` | Dashboard com sidebar recolhível (21st.dev) | Estrutura do painel de admins e creators |
| `referencias/liquid-glass-button.md` | Botões *liquid glass* e *metal* (shadcn + cva) | Botões e o efeito de vidro |
| `referencias/glass-card.md` | Cartão de vidro com imagem, selos e autor (shadcn + framer-motion) | Cartões (campanhas, briefings, produtos) |

## Para quando as telas começarem (não fazer antes)

- As referências pedem estrutura **shadcn/ui** (`src/components/ui`, `cn` em `src/lib/utils`) e as libs
  `lucide-react`, `@radix-ui/react-slot`, `class-variance-authority` e `framer-motion`. Instalar com versão
  exata quando a primeira tela usar cada uma.
- A cor da marca vem do banco (`Brand.primaryColor`), aplicada como variável CSS do tema; nada de cor fixa no
  componente (a referência usa azul fixo).
- Textos em português; KPIs de dinheiro sempre em centavos convertidos só na exibição.
- Pontos de atenção já vistos nas referências, a resolver na hora:
  - o filtro de vidro usa `backdrop-filter: url(#...)`, que só funciona em navegadores baseados no Chromium;
    precisa de alternativa (desfoque simples) em Safari/iPhone;
  - o filtro SVG tem `id` fixo, repetido a cada botão na página;
  - o exemplo de dashboard usa valores aleatórios e dados fixos: tudo vira dado real do banco.

## Em aberto

| ID | Pergunta | Precisa antes de |
| --- | --- | --- |
| D-BRANDCOLOR | Cor de cada marca. Foi dito "Botanika azul, VermeFree verde", mas o app antigo tinha o contrário: Botanika `#2f6b3f` (verde) e VermeFree `#1f6f8b` (azul). Quais são as cores oficiais (código hex)? | Primeira tela com marca |
