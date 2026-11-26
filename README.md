# BitCraft Companion

**English** · [Português](README.pt-BR.md)

A companion app for BitCraft Online 1.0: look up recipes and items, calculate costs, keep plans, and see the inventory of your character and of the people in your plans. It runs for free on Vercel, with the database on Neon.

Stack: Next.js, Prisma, Postgres and Chakra UI. The project's conventions (Rails style) are in [CLAUDE.md](CLAUDE.md), and the design in [docs/design/2026-11-24-vercel.md](docs/design/2026-11-24-vercel.md). The app's interface is in Portuguese (pt-BR); code and documentation are in English.

Production changes with each release published on GitHub: the workflow runs the tests, the migrations on Neon and the deploy to Vercel. The deploy steps are kept outside this repository. This version replaced the AdonisJS app that ran on a PC; it stays in the git history, before the merge of 24/11/2026.

## Requirements

- Node.js 24 or newer
- Git

## Development in Claude Code cloud sessions

The project is developed in Claude Code cloud sessions (claude.ai/code). The environment runs `scripts/workspace/cloud-setup.sh` once (Node and Postgres in the CI versions, a `.env` with local values only, dependencies, migrations, game data and a development user), and each session starts Postgres on its own through the start hook (`scripts/workspace/cloud-start.sh`). Then just `npm test` or `npm run dev`. The details are in [CLAUDE.md](CLAUDE.md).

## Local setup (without the cloud)

```bash
npm install
cp .env.example .env          # and fill in SESSION_SECRET and CRON_SECRET
```

Local Postgres runs with `prisma dev`, without installing a service or Docker. Open two terminals and leave them open:

```bash
npm run db:dev                # dev database, port 51214
npm run db:test               # test database, port 51224
```

Then, in another terminal:

```bash
npx prisma migrate dev        # creates the tables in the dev database
npx prisma migrate deploy     # and in the test one, with DATABASE_URL_UNPOOLED pointing to port 51224
npm run game-data:import      # game data (about 15 s); run it again on every patch
npm run dev                   # http://localhost:3100
```

`game-data:import` downloads the data from the community repository [BitCraftToolBox/BitCraft_GameData](https://github.com/BitCraftToolBox/BitCraft_GameData) and writes it to the `DATABASE_URL_UNPOOLED` database. In production it runs through the manual "Importar dados do jogo" GitHub Actions workflow, against Neon, and never on Vercel (see `.github/workflows/game-data-import.yml`):
- what is new comes in;
- what left the game is marked as removed (nothing is deleted);
- renamed items show up in the summary.

Options: `-- --commit=<sha>` imports a specific commit, and `-- --path=<folder>` reads the JSONs from a local folder.

## Accounts

The app is public on the internet and **always asks for a login**. Anyone can create an account at `/signup`, with a password of at least 8 characters. To stay within the free plans, each IP creates at most 5 accounts a day. The character's nick is optional on sign-up: when given, the app checks it on BitJita before creating the account, and the account starts with that character. If BitJita does not find the nick or is down, the account is not created and the form says why; the field can be cleared to go on. Each failed nick attempt counts toward the limit of 5 per IP per day, like an account. An account can also be created from the command line:

```bash
npm run users:create -- --email=you@example.com --name="Your name"
```

For development, `npm run db:seed` creates a test user. Its e-mail and password are in `prisma/seed.ts`, and the seed refuses to run outside a local database.

After 10 wrong passwords in a row for the same e-mail, it is locked for 15 minutes, even with the right password. A session lasts 30 days, and "Sair" ends it in that browser.

Each account has its own plans. For shared plans, an account creates a group in **Conta** and sends the invite link to the others. A plan's owner shares it with the whole group ("Todos do grupo") or with people of the group one by one: whoever receives it sees and edits it, and only the owner deletes it.

## Inventory

Inventories come from the public [BitJita](https://bitjita.com) API, without any player token. Each account has one character, given on sign-up or in **Meu personagem** (`/game_player`); the nick is checked on BitJita before it is saved. A character of two accounts is read only once. An account without a character sees a ⚠️ warning on the Inventário tab and in the calculator, with a link to Meu personagem. The inventory page, the quick calculator and each item's "Você tem" use the account's character. A plan also uses the characters of the plan's people (its owner and whoever received it), each once; "Usar apenas meu inventário" keeps only yours. The typed "já tenho" wins over the inventory.

Claim chests count only when you tick the claim on **Meu personagem** (off by default, whole claims only: BitJita does not say which chests a member can open). A ticked claim comes along with your character: in a plan, the claims ticked by the plan's people count too, each once, and the plan's **Claims** menu lets each person leave some out for themselves. The sync reads only ticked claims.

The app reads BitJita in three ways, and never on a timer (the Neon database sleeps when nobody uses the app):

- **When a page that shows the inventory opens** (the inventory, the calculator and the plans): the page's characters not read in the last `INVENTORY_STALE_MINUTES` minutes (1, like the old app) are read again, with the page already open. Up to 15 at a time, the oldest first.
- **"Sincronizar agora"**, on the same pages, for the page's characters (up to 15). From a PC, `npm run inventory:sync` reads all of them.
- **A daily Vercel cron** (`vercel.json`, at 6 a.m. Brasília time) calls `/api/cron/inventory-sync` with the `CRON_SECRET` key and reads up to 15 characters nobody looked at in the last hour.

Only one sync runs at a time. If BitJita fails, the previous data stays, and the page says who was not read.

## Tasks

The **Tasks** page (`/tasks`) lists the travelers' tasks (not quests). On top, the tasks your character has now, read from BitJita with the inventory. Below, every task of your tier with each traveler, from the game data: the tier is the one your quests unlocked with that traveler (for Heimlich, "The Best Ingredients (I)" unlocks T2, "(II)" T3 and so on; without them, T1). Ramparte has no tiers: each creature's tasks take its own quest, so his go by your level. Travelers sometimes give tasks of lower tiers, too. Each item shows how many you have (your character and ticked claims) and how many are missing.

## Tests

```bash
npm test                      # unit (no database) and integration (test Postgres)
npm run test:unit
npm run typecheck
npm run lint
```

The integration tests erase everything in the test database before each test. They refuse to run if `TEST_DATABASE_URL` is not set or is the dev database.

## Game rules

The app only reads data. It does not modify the game client or automate anything. Inventories come from BitJita's public API: the app never connects to the game servers with a player's token (that drops the player's game session) and stores nobody's token. Sharing a player's token is "account sharing" and gets you banned.

## Conventions (Rails → Next)

The project follows Rails conventions. When in doubt, do what Rails would do.

| Rails | Here |
|---|---|
| RESTful `resources` | Folders in `src/app/(app)/` with resource URLs (`/plans`, `/plans/[id]`, `/recipes`, `/items/[id]`, `/game_player`). Mutations in server actions, one `actions.ts` per resource, with Rails action names (`createPlan`, `updatePlan`, `destroyPlan`). Route handlers (`src/app/api/`) only for what is not a form action: search as you type, the cron and the BitJita sync. Next runs a tab's actions one at a time, so an action of several seconds holds the others and the page looks frozen. |
| Thin controllers | Pages (server components) and actions only read the input, validate, call and render or redirect. Rules live in `src/models/` or `src/services/`. |
| Service objects / POROs | `src/services/<area>/<name>.ts`, one class or module per use case. |
| Models | Prisma has no classes: each table's queries and rules live in `src/models/<model>.ts`. Game data always filters out removed rows with `active` (`removedAt: null`). |
| Strong params + validations | Zod in `src/validators/<resource>.ts`, one schema per resource and action. Invalid input becomes a message in Portuguese, never a 500 error. |
| Migrations | `prisma migrate`. Never edit a migration already applied; create a new one. SQL Prisma cannot express (like a partial index) goes in the migration itself, with a comment. |
| `db/seeds.rb` | Seeders for dev and test only. Game data comes from `npm run game-data:import`. |
| Rake tasks | Scripts in `scripts/`, run with `tsx` through `npm run`. |
| Partials and layouts | App Router layouts and React components with Chakra in `src/components/<area>/`. Client components (`'use client'`) only where there is interaction or Chakra; the page fetches the data and passes plain data. |
| Model and request specs | Vitest: `tests/unit/` without a database and `tests/integration/` with the test Postgres (reset for each test), with fixtures in `tests/fixtures/`. Test the services and models the actions call. |
| Names | Plural snake_case tables (`@@map`), singular PascalCase models, camelCase fields (`@map` to snake_case), snake_case files. Code in English, interface in Portuguese (pt-BR). Item names stay as they come from the game, in English. |
