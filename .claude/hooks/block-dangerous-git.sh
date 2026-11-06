#!/bin/bash
# Git Guardrails (D-SKILLS, adaptado da skill git-guardrails-claude-code).
# Bloqueia comandos Git destrutivos antes de rodar. Push normal da branch de trabalho
# continua liberado (regra 3 do CLAUDE.md: toda tarefa termina com push).
INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).tool_input?.command??""))}catch{}})')
[ -z "$COMMAND" ] && exit 0

block() {
  echo "BLOQUEADO (Git Guardrails): '$COMMAND' — $1. Peça ao responsável para rodar ou liberar." >&2
  exit 2
}

# Força de push (--force-with-lease continua permitido: só sobrescreve se ninguém mexeu)
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\bpush\b[^;&|]*(--force([^-]|$)|\s-f\b|\s\+[^ ]+)' && block "push forçado"
# Push direto para main/master (cada push na main vai ao ar em produção)
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\bpush\b[^;&|]*(\s|:)(main|master)\b' && block "push direto para a main (vai ao ar); use PR"
# Apagar branch remota
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\bpush\b[^;&|]*(--delete|\s-d\b|\s:[^ ]+)' && block "apagar branch remota"
# Descartar trabalho local
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\breset\b[^;&|]*--hard' && block "reset --hard descarta alterações"
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\bclean\b[^;&|]*\s-[a-zA-Z]*f' && block "clean -f apaga arquivos não commitados"
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\bbranch\b[^;&|]*(\s-D\b|--delete\s+--force|-d\s+-f)' && block "branch -D apaga branch sem merge"
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\b(checkout|restore)\b[^;&|]*\s(--\s+)?\.(\s|$)' && block "descarta todas as alterações locais"
printf '%s' "$COMMAND" | grep -qE 'git[^;&|]*\bstash\b\s+(drop|clear)' && block "apaga stash"
exit 0
