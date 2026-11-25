---
name: release
description: Sends the repository owner the link to publish a BitCraft Companion release, which puts main into production. Use when they ask for a release, a production deploy, "publicar", "pôr no ar" or "subir para produção".
---

# Release

The repository owner publishes the release (the deploy steps are in their private notes, folder `projetos/bitcraft-companion`). This skill only builds the link. Do not run the Release workflow, do not create a tag and do not open the release.

The owner reads the replies, so the messages below stay in Portuguese.

1. Update `main` and the tags: `git fetch origin main --tags --quiet`.
2. Latest version: `git tag --list 'v*' --sort=-v:refname | head -1`.
3. New commits: `git log --no-merges --format=%s <latest>..origin/main`. If there are none, reply only "O `main` não mudou desde a `<latest>`." and stop.
4. CI on `main`: with the GitHub MCP, `actions_list` (`list_workflow_runs`, `ci.yml`, branch `main`) and find the run for `git rev-parse origin/main`.
   - Failed: reply only "A CI do `main` falhou: <run link>." and stop.
   - Still running or no run: say so (in Portuguese) and stop.
5. Next version: if any commit starts with `feat`, bump the middle number and reset the last (`v0.2.0` → `v0.3.0`). Otherwise bump the last (`v0.2.0` → `v0.2.1`). Never bump the first number alone.
6. Reply with **only** the link, no text before or after:

```
https://github.com/andremartinelli/bitcraft-companion/releases/new?tag=<version>&target=main&title=<version>
```
