#!/usr/bin/env bash
# Claude Code SessionStart hook (.claude/settings.json).
#
# Only in a cloud session (CLAUDE_CODE_REMOTE=true):
#   1. brings a stale branch up to the branch's last push (sync_branch);
#   2. runs cloud-start.sh, which starts Docker and Postgres and syncs
#      dependencies and migrations with the branch;
#   3. tells Claude and the user how it went in one line.
# Anywhere else it does nothing.
#
# Always exits 0: a failed start is reported instead of blocking the session.
# Everything runs inside main(), which bash reads whole before running: the
# fast-forward may rewrite this very file while it runs.
set -uo pipefail

emit() {
  python3 -c 'import json, sys; print(json.dumps({"systemMessage": sys.argv[1], "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": sys.argv[2]}}))' "$1" "$2"
}

# A session opened on a branch that the environment's cache already holds can
# start on the cached commit instead of the branch's last push (seen on
# 2026-11-24: the session fetched the new commit, then checked out the cached
# local branch). Fast-forwards the branch to origin only when that is safe: no
# changes to tracked files and the branch only behind. Prints a note for the
# summary when it moved the branch or had to leave it behind.
sync_branch() {
  local branch head target
  branch="$(git branch --show-current)"
  [ -n "$branch" ] || return 0
  git fetch -q origin "$branch" 2>/dev/null || return 0
  head="$(git rev-parse HEAD)"
  target="$(git rev-parse FETCH_HEAD)"
  [ "$head" != "$target" ] || return 0
  if ! git merge-base --is-ancestor "$head" "$target"; then
    git merge-base --is-ancestor "$target" "$head" ||
      echo "Atenção: o branch ${branch} local divergiu do GitHub (${head:0:7} x ${target:0:7}); não mexi nele."
    return 0
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Atenção: o branch ${branch} está atrás do GitHub (${head:0:7} x ${target:0:7}) e tem mudanças locais; não avancei."
    return 0
  fi
  if git merge -q --ff-only "$target"; then
    echo "O branch ${branch} começou no commit do cache (${head:0:7}) e foi avançado até o último push (${target:0:7})."
  else
    echo "Atenção: o branch ${branch} está atrás do GitHub (${head:0:7} x ${target:0:7}) e o avanço falhou; confira com git status."
  fi
}

main() {
  local root log branch_note summary
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || return 0

  root="$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" || return 0
  cd "$root" || return 0
  mkdir -p .workspace
  log=".workspace/cloud-start.log"

  branch_note="$(sync_branch 2>/dev/null)"
  branch_note="${branch_note:+${branch_note} }"

  if bash scripts/workspace/cloud-start.sh >"$log" 2>&1 </dev/null; then
    summary="$(tail -1 "$log")"
    emit "Ambiente de dev no ar: ${branch_note}${summary}" \
      "Sessão na nuvem: ${branch_note}scripts/workspace/cloud-start.sh ligou o Postgres local e deixou dependências e migrations em dia com o branch. ${summary} O .env tem só valores locais. \`npm test\` roda unit e integration (no bitcraft_test); \`npm run dev\` sobe o app em http://localhost:3100, com o login dev@example.com / dev-password-local (prisma/seed.ts). Log: ${root}/${log}"
  else
    emit "O ambiente de dev FALHOU: veja ${root}/${log}" \
      "${branch_note}scripts/workspace/cloud-start.sh FALHOU nesta sessão na nuvem (log: ${root}/${log}). Leia o fim do log e diga ao usuário o que falhou antes de rodar o app ou os testes de integração; depois de corrigir, rode de novo \`bash scripts/workspace/cloud-start.sh\`."
  fi
}

# One line: bash reads it whole before running main.
main "$@"; exit 0
