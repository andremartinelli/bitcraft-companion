# BitCraft Companion

Companion app para o BitCraft Online 1.0, com cadastro aberto. Serve para consultar receitas e itens, calcular custos (calculadora e planos) e acompanhar o inventário dos personagens que cada conta segue, lido da API pública da BitJita. Roda de graça na Vercel, com o banco no Neon (Postgres).

- Design aprovado: `docs/design/2026-11-24-vercel.md`. Os anteriores (`2026-11-21-*`) descrevem o app Adonis.
- Protótipo de referência (visual e comportamento): `docs/reference/bitcraft-receitas.html`.
- **Histórico:** o app Adonis antigo foi portado e saiu do repositório no merge para o `main` (24/11/2026). Para consultá-lo, veja o histórico do git antes desse merge (pasta `legacy/` no branch `claude/fork-vercel-e03995`, ou o `main` até o commit `c4a56b3`).

## Sessões do Claude Code na nuvem

O desenvolvimento roda em sessões do Claude Code na nuvem (claude.ai/code), num ambiente só deste repositório.

- **Ao abrir a sessão,** o hook SessionStart (`.claude/settings.json` → `scripts/workspace/session-start.sh`) primeiro confere o branch. Uma sessão aberta num branch que o cache do ambiente já guarda pode começar no commit do cache, e não no último push. Se a árvore estiver sem mudanças e o branch só estiver atrás do GitHub, o hook o avança (`git merge --ff-only`) e diz isso no resumo. Se o branch tiver mudanças ou tiver divergido, o hook só avisa. Depois ele roda `scripts/workspace/cloud-start.sh`:
  - liga o Docker e um Postgres 17 em `127.0.0.1:54320`, com os bancos `bitcraft_dev` (o app) e `bitcraft_test` (os testes de integração);
  - roda `npm ci` se o `package-lock.json` mudou, gera o cliente do Prisma e aplica as migrations do branch nos dois bancos.

  A última linha do log (`.workspace/cloud-start.log`) é o resumo. Se o hook avisar que falhou, leia o log antes de rodar o app ou os testes.
- **O cache do ambiente** é montado por `scripts/workspace/cloud-setup.sh`: Node e Postgres nas versões da CI, `.env` só com valores locais, dependências, migrations, dados do jogo no `bitcraft_dev` e o usuário do `db:seed`. O cache guarda arquivos, não processos; por isso o hook liga tudo de novo em cada sessão.
- **Node:** a imagem da nuvem só traz alguns Node em `/opt/nodeNN`. Quando o da CI não está entre eles, a receita o baixa do `nodejs.org` (conferido pelo `SHASUMS256.txt`) para `/opt/nodeNN`. Se o download falhar, ela usa o mais novo da imagem e avisa no resumo.
- **Sessão com vários repositórios não roda hooks.** Rode `bash scripts/workspace/cloud-start.sh` à mão antes do app ou dos testes de integração.
- **Login no app de dev:** `dev@example.com` / `dev-password-local` (`prisma/seed.ts`).
- **Nada da nuvem chega à produção.** O `.env` aponta só para o Postgres local, e os scripts recusam outra URL. Não há segredo de produção na nuvem: as releases (deploy e migrations no Neon) e a importação dos dados do jogo no Neon rodam pelos workflows do GitHub Actions, disparados pelo dono do repositório.
- **Rede:** os testes usam fixtures e não precisam de rede.
  - O proxy do GitHub da sessão só deixa a `api.github.com` ler os repositórios anexados à sessão. A importação normal pede o commit do BitCraft_GameData a essa API e recebe 403. Por isso a receita baixa as mesmas tabelas da ponta do branch pelo `raw.githubusercontent.com` e importa da pasta (`--path`).
  - O inventário do app de dev lê o `bitjita.com`, que precisa estar liberado na rede do ambiente. Sem ele, as páginas abrem, mas o sync falha.
- **Docs do Next:** a versão instalada traz a documentação em `node_modules/next/dist/docs/`. Consulte lá em vez de confiar na memória. O `agentRules: false` do `next.config.ts` impede o `next dev` de gerar um `AGENTS.md` com esse mesmo aviso a cada execução.
- **Pull requests:** trabalhe num branch e abra o PR; o merge e as releases são do dono do repositório. A CI (`.github/workflows/ci.yml`) roda typecheck, lint e testes em cada PR.

## Grafo do código (graphify)

O [graphify](https://github.com/safishamsi/graphify) monta em `graphify-out/` (fora do git) um grafo do código: quem chama quem e quais arquivos andam juntos.

- **Na nuvem,** o `cloud-start.sh` instala a versão fixada em `scripts/workspace/lib.sh` (`GRAPHIFY_VERSION`) e refaz o grafo do branch a cada sessão, só com a árvore sintática: sem IA e em uns 4 s. Fora da nuvem: `uv tool install graphifyy==<versão>` e `graphify update .`.
- **Antes do primeiro grep ou leitura de arquivo** numa pergunta sobre o código:
  - rode `graphify query "<pergunta>"`;
  - para a ligação entre duas coisas, `graphify path "<A>" "<B>"`;
  - para um conceito, `graphify explain "<X>"`.
  Leia só as linhas que o grafo apontou, e repita esta regra no pedido de todo subagente que explore o código. Os hooks `PreToolUse` do `.claude/settings.json` lembram disso (`scripts/workspace/graphify-hook.sh`, que não faz nada onde o graphify não está instalado).
- `graphify-out/GRAPH_REPORT.md` só para uma visão geral da arquitetura.
- **Depois de mudar código,** rode `graphify update .`.
- O grafo de cada sessão não lê os `.md` com IA. `/graphify .` faz a leitura completa com subagentes e gasta o plano: só quando o dono pedir.
- **Trocar de versão:** leia o changelog e os hooks da nova, mude o `GRAPHIFY_VERSION` e prove numa sessão nova.

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
- Só `/login`, `/signup` e `/api/cron/*` são abertos. O cron tem a própria chave, `CRON_SECRET`.
- O cadastro em `/signup` é aberto, com senha de no mínimo 8 caracteres e no máximo 5 contas novas por IP por dia (`src/services/auth/signup.ts`). `npm run users:create` continua existindo.
- Senhas usam scrypt (`src/services/auth/password.ts`). Depois de 10 erros seguidos, o e-mail fica bloqueado por 15 minutos.

**Contas (decidido em 24/11/2026):**

- **Planos:** cada plano é de quem o criou (`created_by_id`). O dono compartilha por e-mail (`plan_shares`): quem recebe vê e edita, só o dono apaga. Toda consulta de plano passa por `findPlanFor`, `canEditPlan` ou `listPlans(userId)`.
- **Personagens:** cada conta segue até 5 (`user_game_players`). Um personagem existe uma vez só, e é lido uma vez, mesmo seguido por várias contas. Ninguém mais seguindo, ele é apagado.
- **Inventário:** o estoque, o "já tenho" da calculadora e o "Você tem" do item são sempre os dos personagens da conta que está vendo, inclusive num plano compartilhado.

Detalhes que já custaram tempo:

- **Chakra no App Router:** os estilos do Emotion vão para o `<head>` pelo `EmotionRegistry` (`src/components/ui/emotion_registry.tsx`); sem ele, a hidratação falha. O tema claro e escuro é uma classe no `<html>` posta por um script `beforeInteractive` (`src/components/ui/color_mode.ts`), sem `next-themes`.
- **O cliente do Prisma é gerado** em `src/generated/prisma` (fora do git) e importado de `@/generated/prisma/client.ts`. Use `db` de `src/lib/db.ts`, que só conecta no primeiro uso.
- **Datas:** a Vercel roda em UTC. Formate com `src/lib/format.ts`, que usa o fuso `America/Sao_Paulo`.
- **Busca de texto:** o Postgres diferencia maiúsculas no `LIKE`. Use `ILIKE` (ou `mode: 'insensitive'`) com o escape de `%` e `_` (`namesMatch` e `containsWord` em `src/lib/search.ts`).
- **Sync do inventário:** por personagem, pelo `last_attempt_at`. Sob demanda (uma página que mostra o inventário chama a action `syncIfStale`, que lê os personagens da conta não tentados no último minuto), pelo botão (`syncNow`, os da conta) e por um cron diário (`/api/cron/inventory-sync`, com `CRON_SECRET`: até 20 personagens não lidos na última hora). Nunca um timer. A trava entre instâncias é o índice parcial `sync_runs_one_running`: um segundo `running` dá P2002.
- **`prisma dev`:** se o banco local passar a fechar as conexões ("Server has closed the connection"), pare e suba de novo (`npx prisma dev stop bitcraft-dev`, depois `npm run db:dev`). Os dados ficam no disco.

## Limites do plano grátis (não negociáveis)

- **Neon:** 100 CU-horas de compute, 1 GB e 5 GB de transferência por mês. Ao estourar um limite, o banco fica suspenso até o próximo ciclo e o app sai do ar. Por isso:
  - nada de timer, polling ou cron frequente que acorde o banco (ele dorme depois de 5 minutos parado);
  - o grafo de receitas da calculadora vem comprimido de `recipe_graph_snapshots`, e não das tabelas;
  - consultas que não precisam de colunas grandes usam `select`.
- **Vercel Hobby:** sem disco persistente, cron no máximo uma vez por dia e funções de até 300 s. A importação dos dados do jogo nunca roda na Vercel: em produção, ela roda pelo workflow manual "Importar dados do jogo" do GitHub Actions (`.github/workflows/game-data-import.yml`).
- **Deploy:** produção só muda quando uma release é publicada no GitHub (`.github/workflows/release.yml`: testes, `prisma migrate deploy` no Neon e `vercel deploy --prod`). Push no `main` não publica (`vercel.json`). Passo a passo em `docs/deploy.md`.

## Regras do jogo (não negociáveis)

- Nada de modificar o cliente, macros, automação de jogabilidade ou ler a memória do jogo.
- O sync com o jogo só lê dados públicos e nunca chama reducers.
- **Nunca conectar nos servidores do jogo (SpacetimeDB) com o token de um jogador.** A conexão conta como um novo login e derruba a sessão do jogo dessa pessoa (testado em 21/11/2026). Também não guardar token de jogador: compartilhar token é "account sharing" e dá ban.
- A fonte dos inventários é a API pública da BitJita (sem token). Uma fonte oficial só com token do Developer Program da Clockwork Labs. Plano: `docs/design/2026-11-21-inventario.md`.

## Comandos

```bash
npm run dev                  # servidor de desenvolvimento em http://localhost:3100
npm test                     # todos os testes (unit e integration)
npm run test:unit            # só os sem banco
npm run typecheck
npm run lint
npx prisma migrate dev       # cria e aplica migrations no banco de dev
npm run game-data:import     # importa os dados do jogo no banco de dev (último commit do BitCraft_GameData)
npm run users:create -- --email=voce@exemplo.com --name="Nome"   # cria uma conta (a senha é pedida)
npm run inventory:sync       # lê os inventários na BitJita agora (o mesmo do botão)
npm run db:seed              # só local: o usuário de desenvolvimento (veja prisma/seed.ts)
```

**Fora da nuvem (plano B):** sem Docker, o Postgres local é o `prisma dev`. Rode `npm run db:dev` e `npm run db:test`, cada um num terminal que fica aberto, com as URLs do `.env.example`. O `prisma dev` só respeita as portas do `.env` rodando em primeiro plano (`--detach` escolhe outras).
