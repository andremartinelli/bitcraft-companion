#!/usr/bin/env bash
# Claude Code hooks for graphify (.claude/settings.json): reminds Claude to ask
# the code's graph before grepping or reading files. Does nothing where
# graphify isn't installed (only the cloud sessions install it).
PATH="$HOME/.local/bin:$PATH"
command -v graphify >/dev/null 2>&1 || exit 0
exec graphify hook-guard "$@"
