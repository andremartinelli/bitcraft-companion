---
name: release
description: Manda ao dono do repositório o link para publicar uma release do BitCraft Companion, que põe o main em produção. Use quando ele pedir uma release, um deploy de produção, "publicar", "pôr no ar" ou "subir para produção".
---

# Release

Quem publica a release é o dono do repositório (`docs/deploy.md`). Esta skill só monta o link. Não rode o workflow Release, não crie tag e não abra a release.

1. Atualize o `main` e as tags: `git fetch origin main --tags --quiet`.
2. Última versão: `git tag --list 'v*' --sort=-v:refname | head -1`.
3. Commits novos: `git log --no-merges --format=%s <última>..origin/main`. Se não houver nenhum, responda só "O `main` não mudou desde a `<última>`." e pare.
4. CI do `main`: com o GitHub MCP, `actions_list` (`list_workflow_runs`, `ci.yml`, branch `main`) e ache a execução do `git rev-parse origin/main`.
   - Falhou: responda só "A CI do `main` falhou: <link da execução>." e pare.
   - Ainda rodando ou sem execução: diga isso e pare.
5. Próxima versão: se algum commit começa com `feat`, sobe o meio e zera o fim (`v0.2.0` → `v0.3.0`). Senão, sobe o fim (`v0.2.0` → `v0.2.1`). Nunca suba o primeiro número sozinho.
6. Responda **apenas** com o link, sem texto antes nem depois:

```
https://github.com/andremartinelli/bitcraft-companion/releases/new?tag=<versão>&target=main&title=<versão>
```
