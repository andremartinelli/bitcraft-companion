# BitCraft Companion

Companion app for BitCraft Online 1.0, with open sign-up. It looks up recipes and items, calculates costs (calculator and plans) and tracks the inventory of each account's character and of the people in its plans, read from the public BitJita API. It runs for free on Vercel, with the database on Neon (Postgres).

- Approved design: `docs/design/2026-11-24-vercel.md`. The old AdonisJS app's design docs exist only in git history.
- Reference prototype (look and behavior): `docs/reference/bitcraft-receitas.html`.
- **History:** the old AdonisJS app was ported and removed from the repository in the merge to `main` (2026-11-24). To look at it, check the git history before that merge (the `legacy/` folder on branch `claude/fork-vercel-e03995`, or `main` up to commit `c4a56b3`).
- **Language:** code, comments, documentation, commits and PRs are in English. The app's interface is in Portuguese (pt-BR) and stays that way; so do messages only the owner reads (CLI script errors, Telegram or merge-bot notices). `README.md` is English and `README.pt-BR.md` is Portuguese, each linking to the other.
- **Private notes:** the deploy and release steps (Vercel, Neon, GitHub secrets, previews, production data import) are not in this repository. They are in the owner's private notes, folder `projetos/bitcraft-companion`.

## Claude Code cloud sessions

Development runs in Claude Code cloud sessions (claude.ai/code), in an environment for this repository only.

- **When the session opens,** the SessionStart hook (`.claude/settings.json` → `scripts/workspace/session-start.sh`) first checks the branch. A session opened on a branch that the environment cache already holds may start at the cache's commit instead of the last push. If the tree is clean and the branch is only behind GitHub, the hook fast-forwards it (`git merge --ff-only`) and says so in the summary. If the branch has changes or has diverged, the hook only warns. Then it runs `scripts/workspace/cloud-start.sh`:
  - starts Docker and a Postgres 17 on `127.0.0.1:54320`, with the databases `bitcraft_dev` (the app) and `bitcraft_test` (integration tests);
  - runs `npm ci` if `package-lock.json` changed, generates the Prisma client and applies the branch's migrations to both databases.

  The last line of the log (`.workspace/cloud-start.log`) is the summary. If the hook warns that it failed, read the log before running the app or the tests.
- **The environment cache** is built by `scripts/workspace/cloud-setup.sh`: Node and Postgres in the CI versions, a `.env` with local values only, dependencies, migrations, game data in `bitcraft_dev` and the `db:seed` user. The cache keeps files, not processes; that is why the hook starts everything again in each session.
- **Node:** the cloud image only ships a few Node versions in `/opt/nodeNN`. When the CI's version is not among them, the recipe downloads it from `nodejs.org` (checked against `SHASUMS256.txt`) into `/opt/nodeNN`. If the download fails, it uses the newest one in the image and says so in the summary.
- **Sessions with several repositories do not run hooks.** Run `bash scripts/workspace/cloud-start.sh` by hand before the app or the integration tests.
- **Dev login:** `dev@example.com` / `dev-password-local` (`prisma/seed.ts`).
- **Nothing from the cloud reaches production.** The `.env` points only to the local Postgres, and the scripts refuse any other URL. There are no production secrets in the cloud: releases (deploy and migrations on Neon) and the game data import on Neon run through GitHub Actions workflows, triggered by the repository owner.
- **Network:** tests use fixtures and need no network.
  - The session's GitHub proxy only lets `api.github.com` read the repositories attached to the session. The normal import asks that API for the BitCraft_GameData commit and gets a 403. So the recipe downloads the same tables from the branch tip through `raw.githubusercontent.com` and imports from the folder (`--path`).
  - The dev app's inventory reads `bitjita.com`, which must be allowed in the environment's network. Without it, pages open but the sync fails.
- **Next docs:** the installed version ships its documentation in `node_modules/next/dist/docs/`. Look there instead of trusting memory. `agentRules: false` in `next.config.ts` stops `next dev` from generating an `AGENTS.md` with that same notice on every run.
- **Pull requests:** work on a branch and open the PR; merging and releases are the repository owner's. CI (`.github/workflows/ci.yml`) runs typecheck, lint and tests on every PR. Merging goes through GitHub auto-merge (below).

## Merging PRs

`main` has a GitHub ruleset ("Main protection"): only commits with green CI ("Tests") on a branch up to date with `main` get in, and nobody can force-push or delete `main`. The merge is a squash, through GitHub auto-merge. Merging to `main` publishes nothing: production only changes with a release.

- **When the owner says to merge a PR,** turn on auto-merge. GitHub then squash-merges (the only method enabled in the repository) once CI passes. Never turn on auto-merge or merge without that request.
  - In the cloud the proxy refuses GitHub's GraphQL, and `gh pr merge --auto` uses GraphQL. Use the cloud REST route: `gh api -X PUT repos/andremartinelli/bitcraft-companion/pulls/<n>/ccr/auto_merge -f merge_method=squash`. Without `merge_method` it asks for a merge commit and GitHub refuses. Outside the cloud: `gh pr merge <n> --auto --squash`.
  - A PR that is already up to date with green CI does not accept auto-merge: merge it directly, `gh api -X PUT repos/andremartinelli/bitcraft-companion/pulls/<n>/merge -f merge_method=squash`.
  - `.claude/settings.json` sets "ask" on the commands and GitHub MCP tools that merge or turn on auto-merge. In a cloud session with more than one repository that file does not apply: there, the owner's request in the chat is the only approval.
  - In the cloud `gh` writes even when `gh auth status` says the token is invalid: the session proxy adds the credential.
- **PR behind `main`** (another PR went in first): auto-merge waits. Update it with `gh api -X PUT repos/andremartinelli/bitcraft-companion/pulls/<n>/update-branch` (`gh pr update-branch` uses GraphQL; or the PR's "Update branch" button); CI runs again and the merge happens when it passes.
- Do not wait for CI: say that auto-merge is on and that the result shows on the PR. With red CI the merge does not happen. To cancel: `gh api -X DELETE repos/andremartinelli/bitcraft-companion/pulls/<n>/ccr/auto_merge`.
- A new commit from someone without write access (a fork) turns auto-merge off: the owner turns it on again after reviewing.

## Code graph (graphify)

[graphify](https://github.com/safishamsi/graphify) builds a code graph in `graphify-out/` (outside git): who calls whom and which files change together.

- **In the cloud,** `cloud-start.sh` installs the version pinned in `scripts/workspace/lib.sh` (`GRAPHIFY_VERSION`) and rebuilds the branch's graph every session, from the syntax tree only: no AI, about 4 s. Outside the cloud: `uv tool install graphifyy==<version>` and `graphify update .`.
- **Before the first grep or file read** on a question about the code:
  - run `graphify query "<question>"`;
  - for the link between two things, `graphify path "<A>" "<B>"`;
  - for a concept, `graphify explain "<X>"`.
  Read only the lines the graph pointed to, and repeat this rule in the request of every subagent that explores the code. The `PreToolUse` hooks in `.claude/settings.json` remind of this (`scripts/workspace/graphify-hook.sh`, which does nothing where graphify is not installed).
- `graphify-out/GRAPH_REPORT.md` only for an architecture overview.
- **After changing code,** run `graphify update .`.
- Each session's graph does not read the `.md` files with AI. `/graphify .` does the full read with subagents and spends the plan: only when the owner asks.
- **Changing versions:** read the new one's changelog and hooks, change `GRAPHIFY_VERSION` and prove it in a fresh session.

## Stack

Next.js 16 (App Router, Turbopack) with TypeScript, Prisma 7 on Postgres (`@prisma/adapter-pg`), Chakra UI 3, Zod for validation and Vitest for tests.

## Conventions (Rails → Next)

The project follows Rails conventions. When in doubt, do what Rails would do.

| Rails | Here |
|---|---|
| RESTful `resources` | Folders in `src/app/(app)/` with resource URLs (`/plans`, `/plans/[id]`, `/recipes`, `/items/[id]`, `/game_player`). Mutations are server actions, one `actions.ts` per resource, with Rails-style action names (`createPlan`, `updatePlan`, `destroyPlan`). Route handlers (`src/app/api/`) only for what is not a form action: search-as-you-type, the cron and the BitJita sync. Next runs one tab's actions one at a time, so an action that takes several seconds holds the others and the page looks frozen. |
| Thin controllers | Pages (server components) and actions only read the input, validate, call, and render or redirect. Rules live in `src/models/` or `src/services/`. |
| Service objects / POROs | `src/services/<area>/<name>.ts`, one class or module per use case. |
| Models | Prisma has no classes: each table's queries and rules live in `src/models/<model>.ts`. Game data queries always filter out removed rows with `active` (`removedAt: null`). |
| Strong params + validations | Zod in `src/validators/<resource>.ts`, one schema per resource and action. Invalid input becomes a message in Portuguese (it is shown in the UI), never a 500 error. |
| Migrations | `prisma migrate`. Never edit a migration that was already applied; create a new one. SQL that Prisma cannot express (such as a partial index) goes in the migration itself, with a comment. |
| `db/seeds.rb` | Seeders for dev and test only. Game data comes from `npm run game-data:import`. |
| Rake tasks | Scripts in `scripts/`, run with `tsx` through `npm run`. |
| Partials and layouts | App Router layouts and React components with Chakra in `src/components/<area>/`. A client component (`'use client'`) only where there is interaction or Chakra; the page fetches the data and passes plain data. |
| Model and request specs | Vitest: `tests/unit/` without a database and `tests/integration/` with the test Postgres (wiped on each test), with fixtures in `tests/fixtures/`. Test the services and models that the actions call. |
| Names | Tables plural in snake_case (`@@map`), models singular in PascalCase, fields in camelCase (`@map` to snake_case), files in snake_case. Code in English, interface in Portuguese (pt-BR). Item names stay as they come from the game, in English. |

**Login (the app is public on the internet):**

- `src/proxy.ts` sends anyone without a session to `/login`, and answers 401 on `/api` routes. It is only the first barrier.
- **Every page, action and route handler checks again:**
  - pages and actions use `requireUser()`;
  - route handlers use `userFromRequest(request)`;
  - both are in `src/lib/session.ts`.
- Only `/login`, `/signup` and `/api/cron/*` are open. The cron has its own key, `CRON_SECRET`.
- Sign-up at `/signup` is open, with a password of at least 8 characters and at most 5 new accounts per IP per day (`src/services/auth/signup.ts`). The "Nick do seu personagem" field is optional: when filled in, the app checks it on BitJita after the per-IP limit and before creating the account; if BitJita does not find the nick or is down, the account is not created and the form says why. Each attempt with a failing nick counts toward the per-IP limit like an account (`signup_nick_failures`, decided 2026-11-25), so made-up nicks cannot query BitJita without limit. `npm run users:create` still exists.
- Passwords use scrypt (`src/services/auth/password.ts`). After 10 wrong attempts in a row, the e-mail is locked for 15 minutes.

**Accounts (decided 2026-11-24):**

- **Plans:** each plan belongs to whoever created it (`created_by_id`). The owner shares it with their groups: whoever receives it sees and edits it, only the owner deletes it. Every plan query goes through `findPlanFor`, `canEditPlan` or `listPlans(userId)`.
- **Groups (decided 2026-11-25, `src/models/group.ts`):**
  - each account creates up to 5 groups and can be in as many groups of other accounts as it wants; each group has up to 50 people, counting pending invites;
  - only the creator invites and removes people. The invite is a link (`/invites/[token]`) that the owner copies and sends; whoever opens it accepts or declines, and login and sign-up return to it (`next`). The app neither sends nor confirms e-mail: so the invite only shows on the Account page (`/account`) of an account that already had that e-mail when invited, and registering the invited e-mail later grants nothing;
  - on a plan, the "Compartilhar com o grupo" menu has, per group, "Todos do grupo" (`plan_group_shares`, also applies to whoever joins later) and people one by one (`plan_shares`, only with people in a group with the owner);
  - "share with the group automatically" is per account and group (`group_members.auto_share_plans`): a new plan is born with "Todos do grupo";
  - whoever leaves or is removed from a group stops seeing the group's plans, and the group stops seeing theirs. One-to-one sharing between two people only ends when they have no group in common. E-mail shares from before groups remain, and the owner removes them on the plan.
- **Character (decided 2026-11-25, `src/models/game_player.ts`):** each account has one, its own (`users.game_player_id`, "Meu personagem" page at `/game_player`). A character exists once and is read once, even if two accounts say it is theirs. With no account left, it is deleted.
  - An account without a character sees a ⚠️ notice in the menu's Inventory tab and in the inventory row of the calculator and the plan, with a link to Meu personagem (`NoCharacterNotice`).
  - Before, each account followed up to 5 (`user_game_players`). Whoever followed 1 left the migration with it; whoever followed 2 or more and did not choose types the nick, guided by the notice (decided 2026-11-25). That table, the `plans.use_inventory` column and the characters with no account were removed in the `legacy_player_cleanup` migration (issue #17).
- **Inventory (decided 2026-11-25, `src/services/inventory/scope.ts`):** always on; the typed "already have" wins.
  - outside a plan (quick calculator, Inventory page, an item's "Você tem"): only the account's character;
  - in a plan: my character and the plan's people's characters (the owner and whoever received it, one by one or "Todos do grupo"), each character once;
  - "Usar apenas meu inventário" leaves only mine. Each person sets it for themselves, per plan (`plan_user_settings`), and it does not change what others see.
- **Claim chests (decided 2026-11-26, `src/models/counted_claim.ts`):** off by default. On "Meu personagem", each account ticks the claims of its character whose chests count (`counted_claims`); the server refuses any other claim.
  - a counted claim comes along with its account's character: outside a plan only mine; in a plan also the plan's people's, each claim once; "Usar apenas meu inventário" leaves only mine;
  - the sync reads only counted claims, and a claim stops counting when the character leaves it. Chests of a claim nobody counts leave the database;
  - whole claims only: BitJita does not say which chests a member can open (issue #25).
- **Recipes (decided 2026-11-25, `src/models/user_recipe_choice.ts`):**
  - in the Steps, an item with 2 or more recipes has "Trocar receita" (`src/components/calculator/recipe_picker.tsx`), recipes only; "Tratar como matéria-prima" stays in the Production tree;
  - choosing a recipe (in the Steps or the tree) changes the plan and saves it as the account's default (`user_recipe_choices`), also on a shared plan;
  - a new plan is born with its creator's defaults and then keeps its own choices: changing the default changes no plan. The quick calculator uses the defaults where the URL did not choose.

Details that already cost time:

- **Chakra on the App Router:** Emotion's styles go to the `<head>` through `EmotionRegistry` (`src/components/ui/emotion_registry.tsx`); without it, hydration fails. The light and dark theme is a class on `<html>` set by a `beforeInteractive` script (`src/components/ui/color_mode.ts`), without `next-themes`.
- **The Prisma client is generated** in `src/generated/prisma` (outside git) and imported from `@/generated/prisma/client.ts`. Use `db` from `src/lib/db.ts`, which only connects on first use.
- **Dates:** Vercel runs in UTC. Format with `src/lib/format.ts`, which uses the `America/Sao_Paulo` time zone.
- **Item icons:** the name comes from the game data (`items.icon_asset_name`) and the image from BitJita; only `src/lib/item_icon.ts` knows the address. Some icons do not exist there: `ItemIcon` hides them, including those that fail before hydration.
- **Text search:** Postgres is case-sensitive in `LIKE`. Use `ILIKE` (or `mode: 'insensitive'`) with the escape of `%` and `_` (`namesMatch` and `containsWord` in `src/lib/search.ts`).
- **Inventory sync:** per character, by `last_attempt_at`, up to 20 at a time (`MAX_PLAYERS_PER_SYNC`), least recently attempted first. On demand (a page that shows the inventory calls `POST /api/inventory/sync` with `onlyIfStale`, which reads the page's characters not attempted in the last minute; on a plan, with `planId`, the plan's), by the button (the same route) and by a daily cron (`/api/cron/inventory-sync`, with `CRON_SECRET`: characters not read in the last hour). Never a timer. The lock between instances is the partial index `sync_runs_one_running`: a second `running` raises P2002.
- **`prisma dev`:** if the local database starts closing connections ("Server has closed the connection"), stop it and start it again (`npx prisma dev stop bitcraft-dev`, then `npm run db:dev`). The data stays on disk.

## Free plan limits (non-negotiable)

- **Neon:** the free plan caps compute hours, storage and transfer per month (exact numbers in the owner's private notes). When a limit is exceeded, the database is suspended until the next cycle and the app goes down. Therefore:
  - no timer, polling or frequent cron that wakes the database (it sleeps after 5 idle minutes);
  - the calculator's recipe graph comes compressed from `recipe_graph_snapshots`, not from the tables;
  - queries that do not need large columns use `select`.
- **Vercel Hobby:** no persistent disk, cron at most once a day and functions of up to 300 s. The game data import never runs on Vercel: in production it runs through the manual "Importar dados do jogo" GitHub Actions workflow (`.github/workflows/game-data-import.yml`).
- **Previews:** each Vercel preview has its own Neon branch and goes straight into a test account (`src/lib/preview.ts`, `scripts/preview_prepare.ts`). Only with `VERCEL_ENV=preview`: in production and dev, `/preview_session` returns 404.
- **Deploy:** production only changes when a release is published on GitHub (`.github/workflows/release.yml`: tests, `prisma migrate deploy` on Neon and `vercel deploy --prod`). A push to `main` does not publish (`vercel.json`).

## Game rules (non-negotiable)

- No modifying the client, macros, gameplay automation or reading the game's memory.
- The game sync only reads public data and never calls reducers.
- **Never connect to the game servers (SpacetimeDB) with a player's token.** The connection counts as a new login and kicks that person's game session (tested 2026-11-21). Also never store a player token: sharing a token is "account sharing" and gets a ban.
- The inventory source is BitJita's public API (no token). An official source only with a Clockwork Labs Developer Program token. The old plan is in git history (`docs/design/2026-11-21-inventario.md`, before it was removed).

## Commands

```bash
npm run dev                  # development server at http://localhost:3100
npm test                     # all tests (unit and integration)
npm run test:unit            # only the ones without a database
npm run typecheck
npm run lint
npx prisma migrate dev       # creates and applies migrations on the dev database
npm run game-data:import     # imports game data into the dev database (latest BitCraft_GameData commit)
npm run users:create -- --email=you@example.com --name="Name"   # creates an account (the password is asked for)
npm run inventory:sync       # reads the inventories from BitJita now (same as the button)
npm run db:seed              # local only: the development user (see prisma/seed.ts)
```

**Outside the cloud (plan B):** without Docker, the local Postgres is `prisma dev`. Run `npm run db:dev` and `npm run db:test`, each in a terminal that stays open, with the URLs from `.env.example`. `prisma dev` only respects the `.env` ports when running in the foreground (`--detach` picks other ones).
