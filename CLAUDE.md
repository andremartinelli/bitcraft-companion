# BitCraft Companion

Companion app para o BitCraft Online 1.0, usado por duas pessoas. Serve para consultar receitas e itens, calcular custos (calculadora e planos) e acompanhar o inventário do grupo, lido da API pública da BitJita. Roda de graça na Vercel, com o banco no Neon (Postgres).

- Design aprovado: `docs/design/2026-11-24-vercel.md`. Os anteriores (`2026-11-21-*`) descrevem o app Adonis.
- Protótipo de referência (visual e comportamento): `docs/reference/bitcraft-receitas.html`.
- **Transição:** o app Adonis antigo está em `legacy/`, só para consulta durante o port, e é o que ainda roda no PC a partir do `main`. Ele não entra no build, no lint nem no typecheck. Ao portar uma área, leia o código dela em `legacy/` e mantenha as regras e os testes. `legacy/` sai no merge para o `main`.

## Stack

Next.js 16 (App Router, Turbopack) com TypeScript, Prisma 7 sobre Postgres (`@prisma/adapter-pg`), Chakra UI 3, Zod para validação e Vitest para testes.

## Convenções (Rails → Next)

O projeto segue as convenções do Rails. Na dúvida, faça como o Rails faria.

| Rails | Aqui |
|---|---|
| `resources` RESTful | Pastas em `src/app/(app)/` com URLs de recurso (`/plans`, `/plans/[id]`, `/recipes`, `/items/[id]`, `/game_players`). Mutações em server actions, num `actions.ts` por recurso, com os nomes das ações do Rails (`createPlan`, `updatePlan`, `destroyPlan`). Route handlers (`src/app/api/`) só para o que não é ação de formulário: busca enquanto se digita e o cron. |
| Controllers magros | Páginas (server components) e actions só leem a entrada, validam, chamam e renderizam ou redirecionam. Regras ficam em `src/models/` ou `src/services/`. |
| Service objects / POROs | `src/services/<area>/<nome>.ts`, uma classe ou um módulo por caso de uso. |
| Models | O Prisma não tem classes: as consultas e regras de cada tabela ficam em `src/models/<model>.ts`. Os dados do jogo sempre filtram os removidos com `active` (`removedAt: null`). |
| Strong params + validations | Zod em `src/validators/<recurso>.ts`, um schema por recurso e ação. Entrada inválida vira mensagem em português, nunca erro 500. |
| Migrations | `prisma migrate`. Nunca editar uma migration já aplicada; criar uma nova. O SQL que o Prisma não expressa (como índice parcial) vai na própria migration, com um comentário. |
| `db/seeds.rb` | Seeders só para dev e teste. Os dados do jogo vêm de `npm run game-data:import`. |
| Rake tasks | Scripts em `scripts/`, rodados com `tsx` pelos `npm run`. |
| Partials e layouts | Layouts do App Router e componentes React com Chakra em `src/components/<area>/`. Componente de cliente (`'use client'`) só onde há interação ou Chakra; a página busca os dados e passa dados simples. |
| Model e request specs | Vitest: `tests/unit/` sem banco e `tests/integration/` com o Postgres de teste (zerado a cada teste), com fixtures em `tests/fixtures/`. Teste os services e models que as actions chamam. |
| Nomes | Tabelas no plural em snake_case (`@@map`), models no singular em PascalCase, campos em camelCase (`@map` para snake_case), arquivos em snake_case. Código em inglês, interface em português (pt-BR). Os nomes dos itens ficam como vêm do jogo, em inglês. |

**Login (o app é público na internet):**

- O `src/proxy.ts` manda para `/login` quem não tem sessão, e responde 401 nas rotas `/api`. Ele é só a primeira barreira.
- **Toda página, action e route handler confere de novo:**
  - páginas e actions usam `requireUser()`;
  - route handlers usam `userFromRequest(request)`;
  - os dois estão em `src/lib/session.ts`.
- Só `/login` e `/api/cron/*` são abertos. O cron tem a própria chave, `CRON_SECRET`.
- Não existe cadastro pelo site: as contas vêm de `npm run users:create`.
- Senhas usam scrypt (`src/services/auth/password.ts`). Depois de 10 erros seguidos, o e-mail fica bloqueado por 15 minutos.

Detalhes que já custaram tempo:

- **Chakra no App Router:** os estilos do Emotion vão para o `<head>` pelo `EmotionRegistry` (`src/components/ui/emotion_registry.tsx`); sem ele, a hidratação falha. O tema claro e escuro é uma classe no `<html>` posta por um script `beforeInteractive` (`src/components/ui/color_mode.ts`), sem `next-themes`.
- **O cliente do Prisma é gerado** em `src/generated/prisma` (fora do git) e importado de `@/generated/prisma/client.ts`. Use `db` de `src/lib/db.ts`, que só conecta no primeiro uso.
- **Datas:** a Vercel roda em UTC. Formate com `src/lib/format.ts`, que usa o fuso `America/Sao_Paulo`.
- **Busca de texto:** o Postgres diferencia maiúsculas no `LIKE`. Use `ILIKE` (ou `mode: 'insensitive'`) com o escape de `%` e `_` (`namesMatch` e `containsWord` em `src/lib/search.ts`).
- **Sync do inventário:** sob demanda (uma página que mostra o inventário e o acha velho chama a action `syncIfStale`), pelo botão (`syncNow`) e por um cron diário (`/api/cron/inventory-sync`, com `CRON_SECRET`). Nunca um timer. A trava entre instâncias é o índice parcial `sync_runs_one_running`: um segundo `running` dá P2002.
- **`prisma dev`:** se o banco local passar a fechar as conexões ("Server has closed the connection"), pare e suba de novo (`npx prisma dev stop bitcraft-dev`, depois `npm run db:dev`). Os dados ficam no disco.

## Limites do plano grátis (não negociáveis)

- **Neon:** 100 CU-horas de compute, 1 GB e 5 GB de transferência por mês. Ao estourar um limite, o banco fica suspenso até o próximo ciclo e o app sai do ar. Por isso:
  - nada de timer, polling ou cron frequente que acorde o banco (ele dorme depois de 5 minutos parado);
  - o grafo de receitas da calculadora vem comprimido de `recipe_graph_snapshots`, e não das tabelas;
  - consultas que não precisam de colunas grandes usam `select`.
- **Vercel Hobby:** sem disco persistente, cron no máximo uma vez por dia e funções de até 300 s. A importação dos dados do jogo nunca roda na Vercel: é um script rodado do PC.

## Regras do jogo (não negociáveis)

- Nada de modificar o cliente, macros, automação de jogabilidade ou ler a memória do jogo.
- O sync com o jogo só lê dados públicos e nunca chama reducers.
- **Nunca conectar nos servidores do jogo (SpacetimeDB) com o token de um jogador.** A conexão conta como um novo login e derruba a sessão do jogo dessa pessoa (testado em 21/11/2026). Também não guardar token de jogador: compartilhar token é "account sharing" e dá ban.
- A fonte dos inventários é a API pública da BitJita (sem token). Uma fonte oficial só com token do Developer Program da Clockwork Labs. Plano: `docs/design/2026-11-21-inventario.md`.

## Comandos

O Node não está no PATH desta máquina: use `C:\Users\Andre\tools\node-v26.13.1-win-x64` (no Git Bash, `export PATH="/c/Users/Andre/tools/node-v26.13.1-win-x64:$PATH"`). As portas 3333 e 3000 são do app antigo.

```bash
npm run db:dev               # Postgres local de dev (prisma dev), num terminal; deixe aberto
npm run db:test              # Postgres local dos testes, noutro terminal
npm run dev                  # servidor de desenvolvimento em http://localhost:3100
npm test                     # todos os testes (unit e integration)
npm run test:unit            # só os sem banco
npm run typecheck
npm run lint
npx prisma migrate dev       # cria e aplica migrations no banco de dev
npm run game-data:import     # importa os dados do jogo (último commit do BitCraft_GameData)
npm run users:create -- --email=voce@exemplo.com --name="Nome"   # cria uma conta (a senha é pedida)
npm run inventory:sync       # lê os inventários na BitJita agora (o mesmo do botão)
npm run db:seed              # só local: o usuário de desenvolvimento (veja prisma/seed.ts)
```

O `prisma dev` só respeita as portas do `.env` rodando em primeiro plano (`--detach` escolhe outras).
