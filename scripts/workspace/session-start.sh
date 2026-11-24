#!/usr/bin/env bash
# Claude Code SessionStart hook (.claude/settings.json).
#
# Only in a cloud session (CLAUDE_CODE_REMOTE=true): runs cloud-start.sh, which
# starts Docker and Postgres and syncs dependencies and migrations with the
# branch, then tells Claude and the user how it went in one line. Anywhere else
# it does nothing.
#
# Always exits 0: a failed start is reported instead of blocking the session.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

root="$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0
mkdir -p .workspace
log=".workspace/cloud-start.log"

emit() {
  python3 -c 'import json, sys; print(json.dumps({"systemMessage": sys.argv[1], "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": sys.argv[2]}}))' "$1" "$2"
}

if bash scripts/workspace/cloud-start.sh >"$log" 2>&1 </dev/null; then
  summary="$(tail -1 "$log")"
  emit "Ambiente de dev no ar: ${summary}" \
    "Sessão na nuvem: scripts/workspace/cloud-start.sh ligou o Postgres local e deixou dependências e migrations em dia com o branch. ${summary} O .env tem só valores locais. \`npm test\` roda unit e integration (no bitcraft_test); \`npm run dev\` sobe o app em http://localhost:3100, com o login dev@example.com / dev-password-local (prisma/seed.ts). Log: ${root}/${log}"
else
  emit "O ambiente de dev FALHOU: veja ${root}/${log}" \
    "scripts/workspace/cloud-start.sh FALHOU nesta sessão na nuvem (log: ${root}/${log}). Leia o fim do log e diga ao usuário o que falhou antes de rodar o app ou os testes de integração; depois de corrigir, rode de novo \`bash scripts/workspace/cloud-start.sh\`."
fi
exit 0
