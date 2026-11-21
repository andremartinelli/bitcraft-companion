# BitCraft Companion

Companion app para o BitCraft Online 1.0, usado por duas pessoas. Serve para consultar receitas e itens; depois vão entrar a calculadora de custo, o inventário e o sync com o jogo. Roda numa máquina Windows, e a outra pessoa acessa pelo Tailscale.

- Design aprovado: `docs/design/2026-11-21-estrutura-base.md`
- Protótipo de referência (visual e comportamento): `docs/reference/bitcraft-receitas.html`

## Stack

AdonisJS 7 (kit `hypermedia`) com TypeScript, Lucid sobre SQLite (`better-sqlite3`), templates Edge com htmx e Alpine, VineJS para validação e Japa para testes.

## Convenções (Rails → Adonis)

O projeto segue as convenções do Rails. Na dúvida, faça como o Rails faria.

| Rails | Aqui |
|---|---|
| `resources` RESTful | `router.resource()` com as sete ações padrão. Rota fora do padrão só quando houver motivo. |
| Controllers magros | Controllers só recebem, validam, chamam e renderizam. Regras ficam nos models ou em `app/services/`. |
| Service objects / POROs | `app/services/<area>/<nome>.ts`, uma classe por caso de uso. |
| Strong params + validations | Validators VineJS em `app/validators/`, um por recurso e ação. |
| Migrations | Lucid. Nunca editar uma migration já aplicada; criar uma nova. `database/schema.ts` é gerado: não editar à mão. |
| Models | `class X extends XSchema` (schema gerado). Escopos com `scope()`; os dados do jogo usam o escopo `active` (`removed_at` nulo). |
| `db/seeds.rb` | Seeders só para dev e teste. Os dados do jogo vêm de `node ace bitcraft:import`. |
| Rake tasks | Comandos `ace` em `commands/`. |
| Partials e layouts | Componentes e layouts Edge. Respostas htmx (header `HX-Request`) renderizam só o partial. |
| Model e request specs | Japa: `tests/unit/` para services e models, `tests/functional/` para rotas, com fixtures em `tests/fixtures/`. |
| Nomes | Tabelas no plural em snake_case, models no singular em PascalCase, arquivos em snake_case. Código em inglês, interface em português (pt-BR). Os nomes dos itens ficam como vêm do jogo, em inglês. |

## Regras do jogo (não negociáveis)

- Nada de modificar o cliente, macros, automação de jogabilidade ou ler a memória do jogo.
- O sync com o jogo, quando entrar, só lê dados, e cada jogador usa o próprio token. Compartilhar token é "account sharing" e dá ban.

## Comandos

```bash
npm run dev                  # servidor de desenvolvimento (HMR)
npm test                     # todos os testes
node ace test unit           # só uma suíte
npm run typecheck
npm run lint
node ace migration:run
node ace bitcraft:import     # importa os dados do jogo (último commit do BitCraft_GameData)
node ace users:create        # cria um usuário (não existe cadastro aberto)
```

Os tipos de rotas e controllers em `.adonisjs/server/` são gerados pelo `npm run dev` (ou `node ace serve`). Depois de mexer em `start/routes.ts`, suba o dev uma vez antes do `typecheck`.

Para rodar em produção (para jogar), use `scripts/play.ps1`. Detalhes no README.
