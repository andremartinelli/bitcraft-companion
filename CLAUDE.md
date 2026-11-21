# BitCraft Companion

Companion app para o BitCraft Online 1.0, usado por duas pessoas. Serve para consultar receitas e itens, calcular custos (calculadora e planos) e acompanhar o inventário do grupo, lido da API pública da BitJita. Roda numa máquina Windows, e a outra pessoa acessa pelo Tailscale.

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
- O sync com o jogo só lê dados públicos e nunca chama reducers.
- **Nunca conectar nos servidores do jogo (SpacetimeDB) com o token de um jogador.** A conexão conta como um novo login e derruba a sessão do jogo dessa pessoa (testado em 21/11/2026). Também não guardar token de jogador: compartilhar token é "account sharing" e dá ban.
- A fonte dos inventários é a API pública da BitJita (sem token). Uma fonte oficial só com token do Developer Program da Clockwork Labs. Plano: `docs/design/2026-11-21-inventario.md`.

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
node ace inventory:sync      # lê os inventários na BitJita (o servidor web repete a cada INVENTORY_SYNC_MINUTES)
```

Os tipos de rotas e controllers em `.adonisjs/server/` são gerados pelo `npm run dev` (ou `node ace serve`). Depois de mexer em `start/routes.ts`, suba o dev uma vez antes do `typecheck`.

Para rodar em produção (o app que vocês usam de verdade, acessível pelo Tailscale), use `scripts/start-production.ps1`. Detalhes no README.
