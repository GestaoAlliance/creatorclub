# Skills do Claude neste repositório (D-SKILLS)

Instaladas em 2026-11-06 a partir do guia "As 50 melhores Claude Skills" (Asimov Academy, ago/2026), a pedido do
responsável. Ficam em `.claude/` e carregam sozinhas em toda sessão do Claude Code aberta neste repositório.

**As regras do `CLAUDE.md` valem mais que qualquer skill** (português, uma tarefa por vez, fluxo do `PROGRESS.md`,
regras de dinheiro, `docs/design/DESIGN.md`). Skill que mandar outra coisa perde.

## Como foi instalado

- Uma skill por item do guia. Itens que são pacotes grandes entraram só com a skill principal (o pacote inteiro somava
  ~700 skills e ~50 mil tokens por sessão). Exceções: **Superpowers** (as 15, que se chamam entre si), **OpenSpec**
  (propor, aplicar, arquivar), **Claude Code Kit** (só os kits da nossa stack) e **Trail of Bits** (CodeQL, Semgrep e
  SARIF, que o guia cita).
- **GSD** e **PAUL** não são skills: foram instalados pelos instaladores oficiais (`get-shit-done-cc@1.42.3 --claude
  --local --portable-hooks --no-sdk` e `paul-framework@1.4.0 --local`). O GSD põe hooks em `.claude/settings.json`;
  o caminho do Node foi trocado por `node` para funcionar em qualquer máquina. Hooks revisados: só avisos; os que
  bloqueiam (formato de commit, fronteira de fase, estado da sessão) ficam desligados até existir
  `.planning/config.json` com `hooks.community: true`. Um deles consulta o npm uma vez por sessão para avisar de
  atualização.
- Conteúdo lido antes do commit (scripts sem envio de dados, sem leitura de chaves). Removidas as imagens e o áudio de
  demonstração da Last30Days (17 MB, não usados pela skill).
- `.claude/` fica fora do deploy da Vercel (`.vercelignore`).

## Git Guardrails (ligado em 2026-11-06)

Hook `PreToolUse` em `.claude/hooks/block-dangerous-git.sh`. O original bloqueia todo `git push`, o que quebraria a
regra 3 do `CLAUDE.md`; aqui o push normal da branch de trabalho e o `--force-with-lease` continuam liberados.
Bloqueados: push forçado (`--force`, `-f`, `+ref`), push direto para `main`/`master` (vai ao ar; usar PR), apagar
branch remota, `reset --hard`, `clean -f`, `branch -D`, `checkout .`/`restore .` e `stash drop`/`clear`. Para liberar
um caso, o responsável roda o comando ou edita o script.

## Mapa: item do guia → onde está

| # | Item do guia | Instalado em | Observação |
|---|---|---|---|
| 1 | Find Skills | `skills/find-skills` | |
| 2 | Skill Creator | `skills/skill-creator` | |
| 3 | Superpowers | `skills/using-superpowers` + 14 skills do fluxo | pacote inteiro (interdependente) |
| 4 | Grill Me | `skills/grill-me` | |
| 5 | Git Guardrails | `skills/git-guardrails-claude-code` + `hooks/block-dangerous-git.sh` | **ligado**, adaptado (ver abaixo) |
| 6 | Caveman | `skills/caveman` | só liga com "/caveman" |
| 7 | Last30Days | `skills/last30days` | precisa de chaves de API (X, Reddit etc.) |
| 8 | GSD | `commands/gsd`, `agents/gsd-*`, `get-shit-done/`, `hooks/` | instalador oficial |
| 9 | Planning With Files | `skills/planning-with-files` | tem hooks próprios, só ativos quando a skill está em uso |
| 10 | OpenSpec | `skills/openspec-propose`, `-apply-change`, `-archive-change` | usa o CLI `openspec` |
| 11 | Spec-Driven Development | `skills/spec-driven-development` | sem o `CLAUDE.md` do repositório de origem |
| 12 | Allium | `skills/allium` | |
| 13 | PAUL | `commands/paul`, `paul-framework/` | instalador oficial |
| 14 | BMAD Skills | `skills/bmad-init` | entrada do método |
| 15 | Claude Code Kit | `skills/nextjs`, `react`, `prisma`, `tailwindcss` | kits da nossa stack |
| 16 | Jeff Allan Claude Skills | `skills/fullstack-guardian` | |
| 17 | Improve Codebase Architecture | `skills/improve-codebase-architecture` | |
| 18 | Frontend Design | `skills/frontend-design` | sempre abaixo do `DESIGN.md` |
| 19 | Vercel Web Design Guidelines | `skills/web-design-guidelines` | |
| 20 | Vercel React Best Practices | `skills/react-best-practices` | |
| 21 | Vercel Composition Patterns | `skills/composition-patterns` | |
| 22 | UI UX Pro Max | `skills/ui-ux-pro-max` | |
| 23 | Impeccable | `skills/impeccable` | de `pbakaus/impeccable` |
| 24 | Theme Factory | `skills/theme-factory` | não substitui o visual do `DESIGN.md` |
| 25 | Canvas Design | `skills/canvas-design` | |
| 26 | Web Artifacts Builder | `skills/web-artifacts-builder` | |
| 27 | Webapp Testing | `skills/webapp-testing` | |
| 28 | Playwright Skill | `skills/playwright-skill` | |
| 29 | Trail of Bits Security | `skills/codeql`, `semgrep`, `sarif-parsing` | |
| 30 | MCP Builder | `skills/mcp-builder` | |
| 31 | Claude API | `skills/claude-api` | |
| 32 | Axiom | `skills/axiom-swiftui` | iOS, fora do nosso uso |
| 33 | Karpathy Guidelines | `skills/karpathy-guidelines` | |
| 34–37 | DOCX, PDF, PPTX, XLSX | `skills/docx`, `pdf`, `pptx`, `xlsx` | |
| 38 | Doc Coauthoring | `skills/doc-coauthoring` | |
| 39 | Brand Guidelines | `skills/brand-guidelines` | é a marca da Anthropic, não a da Botanika |
| 40 | Internal Comms | `skills/internal-comms` | |
| 41 | Firecrawl | `skills/firecrawl-agent` | precisa de chave paga da Firecrawl |
| 42 | Printing Press | `skills/printing-press` | |
| 43 | Corey Haines Marketing | `skills/marketing-plan` | |
| 44 | Remotion Best Practices | `skills/remotion-best-practices` | |
| 45 | Algorithmic Art | `skills/algorithmic-art` | |
| 46 | Music Creation | `skills/album-conceptualizer` | |
| 47 | Claude Art Skill | — | **não instalada**: o repositório do guia não existe mais |
| 48 | Deckset Presentation Expert | `skills/deckset-presentation-expert` | |
| 49 | Data Analysis | `skills/xlsx` | o guia aponta para a mesma skill do item 37 |
| 50 | Document Skills | `skills/docx`, `pdf`, `pptx`, `xlsx` | o guia aponta para os itens 34–37 |

## Atualizar ou remover

- Skill: apagar ou trocar a pasta em `.claude/skills/<nome>` e commitar.
- GSD: `npx get-shit-done-cc@<versão> --claude --local --portable-hooks --no-sdk` (reinstala; depois trocar de novo o
  caminho absoluto do Node em `.claude/settings.json` por `node`). Remover: `--uninstall`.
- PAUL: `npx paul-framework@<versão> --local`.
