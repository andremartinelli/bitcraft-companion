# BitCraft Companion: inventários do jogo

Data: 2026-11-21 · Status: plano aprovado, **ainda não implementado**

## Intenção

Trazer para o app **o que o Vitor e o amigo têm de verdade no jogo**, para:

1. **preencher o "já tenho"** da calculadora e dos planos;
2. ter uma **página de inventário**, com busca e com o que há em cada local;
3. **somar o estoque do grupo**, como se fosse um estoque só.

### Decisões tomadas

- **Inventários:** todos.
  - Pessoal: mochila, cinto e carteira.
  - Baús e armazéns da claim.
  - Banco, Settlement Stash e casa.
  - Veículos e carga.
- **Sincronização:** pelo botão "Sincronizar agora" **e** automática, de tempos em tempos.
- **Fonte:** a **API pública da BitJita**, sem token.
  - Uma fonte oficial só entra no futuro, e só com um **token do Developer Program** da Clockwork Labs.

## O que a fase 0 mostrou (21/11/2026)

- **O login por código de e-mail funciona no 1.0:**
  1. `POST https://api.bitcraftonline.com/authentication/request-access-code?email=…`
  2. `POST …/authenticate?email=…&accessCode=…` devolve um JWT com `hex_identity`, `sub`, `iss`, `aud`, `iat` e `exp`.
- **O servidor do jogo mudou no 1.0:** agora é `bitcraft-release.spacetimedb.com`, com os bancos `idc-global` e `idc-N`.
  - O HTTP `/sql` é **bloqueado**: 403 vindo do nginx.
  - O `/schema` responde normalmente (200).
  - O websocket aceita a conexão (`v1.json`, `v1.bsatn` e `v2.bsatn`), mas o `idc-global` fecha em seguida, sem mandar nada.
- **Conectar com o token de um jogador derruba o jogo dessa pessoa.** A conexão conta como um novo login, e o cliente mostra "Logged in elsewhere".
  - **Por isso o app nunca usa nem guarda token de jogador.** O código da fase 0 foi removido no commit `563e813`, e a tabela `game_credentials` foi apagada por migration.
  - Essa regra está no `CLAUDE.md`.
- **Como as outras ferramentas fazem:** BitJita e bitcraftsync leem os dados públicos com token de desenvolvedor e não guardam token de jogador.

## Fonte: API da BitJita

O site é `https://bitjita.com`, sem autenticação. Os limites e condições:
- **Limite:** 250 requisições por minuto.
- **Identificação:** pedem um `User-Agent` ou `x-app-identifier`. Vamos mandar `bitcraft-companion`.
- **Condições formais:** nenhuma publicada. O serviço é mantido por uma pessoa, sem ligação com a Clockwork Labs.
- **Atualização dos dados:** a documentação não diz quão atuais os dados são.

Os endpoints abaixo foram conferidos em chamadas reais em 21/11/2026, além da documentação em `bitjita.com/docs/api`.

| Uso | Endpoint | Formato relevante |
|---|---|---|
| Achar o jogador pelo nick | `GET /api/players?q=<nick>` | `{ players: [{ entityId, username, signedIn, … }], total }`. O `entityId` é uma string de 18 dígitos. Comparar `username` sem diferenciar maiúsculas para achar o nome exato. |
| Dados e claims do jogador | `GET /api/players/{id}` | `{ player: { entityId, username, regionId, claims: [{ entityId, name, regionId, regionName, … }], … } }` |
| Inventários do jogador | `GET /api/players/{id}/inventories` | `{ inventories: [...], items, cargos, availableRegions }`. Cada inventário: `entityId`, `ownerEntityId`, `playerOwnerEntityId`, `inventoryIndex`, `cargoIndex`, `inventoryName` (Inventory, Toolbelt, Wallet), `buildingName` (Settlement Stash, banco…), `claimEntityId`, `claimName`, `regionId` e `pockets: [{ locked, volume, contents: { itemId, itemType, quantity } }]`. **`itemType` é numérico: `0` = item, `1` = cargo.** |
| Baús da claim | `GET /api/claims/{id}/inventories` | `{ buildings: [{ entityId, buildingDescriptionId, buildingName, buildingNickname, inventory: [{ locked, volume, contents: { item_id, item_type, quantity } }] }], items, cargos }`. **Aqui os campos estão em snake_case e `item_type` é texto: `"item"` ou `"cargo"`.** |
| Casa | `GET /api/players/{id}/housing`, e depois `GET /api/players/{id}/housing/{houseId}` | Uma lista de casas (`buildingEntityId`, `buildingName`, `claimName`, …). O detalhe traz `inventories: [{ entityId, inventory, buildingName, buildingNickname }]`. **Sem casa, a resposta é 404 com `{ error }`.** |

Observações:
- **Espaços vazios não aparecem** nas listas de pockets e slots. Só vêm os ocupados.
- **Inventário sem nome:** um dos inventários do jogador veio sem `inventoryName` nem `buildingName`, com `ownerEntityId` diferente do jogador e `inventoryIndex` 0. Pelo código do servidor, deve ser o banco (o dono é o prédio do banco). O nome exibido será "Banco".
- **Itens:** os ids casam com os nossos `items (kind, game_id)`. Os nomes vêm do nosso banco, que já tem os dados estáticos, e não dos arrays `items` e `cargos` da BitJita.
- **Regiões:** a numeração (`regionId`) é a da BitJita: um personagem de vocês aparece na região 14 e a busca de claims aceita de 1 a 9. Só serve para mostrar, não para conectar.

## Modelo de dados (dados do usuário)

**`game_players`:** os personagens acompanhados.
- `username`: o nick no jogo.
- `entity_id`: string.
- `region_id`.
- `user_id`: pode ser nulo; liga o personagem a uma conta do app.
- `last_synced_at` e `last_error`.

**`inventory_containers`:** cada local onde há itens.
- `kind`: `personal`, `toolbelt`, `wallet`, `bank`, `stash`, `housing`, `claim` ou `deployable`.
- `game_entity_id`: o `entityId` do inventário ou do prédio. Unique em `(kind, game_entity_id)`.
- `game_player_id`: nulo nos baús de claim, que são compartilhados pelo grupo.
- `claim_entity_id` e `claim_name`.
- `name`: "Mochila", "Cinto", "Carteira", "Banco", o `buildingNickname` ou `buildingName`, ou o nome do veículo.
- `last_seen_at`.

**`inventory_entries`:** o que há em cada local.
- `container_id`.
- `item_id`: aponta para `items`.
- `quantity`.
- `source`: `sync` agora, `manual` no futuro.
- `synced_at`.
- Unique em `(container_id, item_id, source)`. Pockets com o mesmo item são somados.

**`sync_runs`:** o histórico das sincronizações.
- `trigger`: `manual` ou `schedule`.
- `source`: `bitjita`.
- `status`: `running`, `ok`, `partial` ou `failed`.
- `message`, `counts` (JSON), `started_at` e `finished_at`.

### Como classificar cada inventário vindo de `/inventories`

| Condição | `kind` |
|---|---|
| `inventoryName` é "Inventory" | `personal` |
| `inventoryName` é "Toolbelt" | `toolbelt` |
| `inventoryName` é "Wallet" | `wallet` |
| `buildingName` contém "Stash" | `stash` |
| Tem `inventoryName` de veículo, ou o dono não é o jogador mas o inventário tem nome próprio (como "<Nick>'s Cart (II)") | `deployable` |
| Sem nome e com dono diferente do jogador | `bank` |

**Validar essa tabela na implementação** contra a resposta real. Na dúvida, o inventário vira `other`, com o nome que vier.

## Sincronização (`app/services/game_sync/`)

- **`bitjita_client.ts`:**
  - usa o `fetch` nativo com `User-Agent: bitcraft-companion` e timeout de 15 segundos;
  - espaça as chamadas para ficar bem abaixo das 250 por minuto (no máximo 2 por segundo);
  - erros com tipos próprios: `NotFoundError` (404), `RateLimitedError` (429) e `UpstreamError`.
- **`inventory_source.ts`:** a interface `InventorySource { fetchPlayer(entityId): Promise<PlayerSnapshot>; fetchClaim(claimId): Promise<ClaimSnapshot> }`, com uma implementação BitJita.
  - Um snapshot é uma lista de `{ kind, gameEntityId, name, claim?, items: { kind: 'item'|'cargo', gameId, quantity }[] }`.
  - A interface deixa espaço para uma futura fonte oficial com token de desenvolvedor.
- **`inventory_sync.ts`, a classe `InventorySync.run(trigger)`:**
  1. Para cada `game_player`: busca os inventários pessoais e de banco, a casa (um 404 significa "sem casa") e a lista de claims.
  2. Para cada claim **distinta** entre os jogadores: busca os baús uma vez só, porque são compartilhados.
  3. Converte os itens para os nossos `items.id` pelo par (`kind`, `game_id`). Os desconhecidos são contados e o resumo sugere rodar `node ace bitcraft:import`.
  4. Substitui o snapshot numa transação, **por jogador e por claim**. Se uma chamada falhar, os dados anteriores daquele jogador ou daquela claim são mantidos.
  5. Registra o `sync_run`: `ok`, `partial` se algum jogador ou claim falhou, ou `failed`.
  - Só roda **uma sincronização por vez**: uma trava em memória, mais o `sync_run` com status `running`. Uma segunda chamada responde "já sincronizando".
- **Agendamento:**
  - `start/scheduler.ts` só é carregado no servidor web, não nos comandos `ace` nem nos testes.
  - A variável `INVENTORY_SYNC_MINUTES` define o intervalo. O padrão é 15, e 0 desliga.
  - Ela entra em `start/env.ts` e nos `.env*.example`.
- **Comando:** `node ace inventory:sync`, para rodar à mão ou para diagnóstico.

## Telas

- **`/inventory` (`InventoryController.index`):**
  - **No topo:** a última sincronização (quando, o status e a fonte "BitJita"), o botão **"Sincronizar agora"** (`POST /inventory/sync`, que redesenha o painel com htmx) e os avisos, como "Fulano: não foi possível ler" ou "N itens desconhecidos: rode `bitcraft:import`".
  - **Abas:**
    - **Grupo:** a soma de tudo por item.
    - **Por jogador.**
    - **Por local:** cada baú, o banco, a carroça…
  - **Busca:** por item; os chips abrem a página do item.
- **`/game_players`** (resource: `index`, `store`, `destroy`): adicionar personagens pelo nick, que é confirmado na BitJita antes de salvar, e removê-los. Mostra a região e a claim de cada um.
- **Página do item:** uma linha "Vocês têm: N", com o detalhe de onde está.
- **Menu:** um item "Inventário".

## Integração com a calculadora e os planos

- **A opção "Usar inventário do grupo":**
  - aparece na calculadora e nos planos;
  - vem ligada quando existe uma sincronização;
  - nos planos fica salva numa coluna nova, `plans.use_inventory`, criada por migration.
- **Regra do "já tenho":** o valor digitado à mão tem prioridade. Sem ele, vale o total do grupo no inventário.
  - O controller monta o `owned` já mesclado, e o `production_planner` continua sendo uma função pura.
  - Cada nó indica de onde veio o valor (`manual` ou `inventory`). A árvore mostra "usando N do inventário" ou "usando N que vocês informaram".
- **Pontos de mudança:**
  - `CalculatorState` em `app/services/calculator/production_planner.ts`;
  - `presenter.ts`;
  - `calculator_controller.ts` e `plans_controller.ts`;
  - `components/calculator/node.edge`.

## Pontos de atenção (cada um com um teste)

1. **A BitJita fora do ar, ou respondendo 429:** a sincronização fica `failed` ou `partial`, os dados anteriores são mantidos e a tela mostra quando foi a última sincronização bem-sucedida.
2. **Item que não existe nos dados estáticos** (veio de um patch novo): ele é ignorado, contado, e o resumo sugere rodar a importação.
3. **Duas sincronizações ao mesmo tempo** (o botão e o agendamento): a segunda não roda.
4. **A mesma claim para os dois jogadores:** os baús são buscados uma vez e não são contados em dobro na soma do grupo.
5. **Os dois formatos da BitJita:** `itemId`/`itemType` (0 e 1) no inventário do jogador e `item_id`/`item_type` ("item" e "cargo") na claim. Os testes usam fixtures gravadas a partir de respostas reais, com os ids trocados.

## Verificação

- **Testes unitários:** o cliente e a fonte BitJita, usando as fixtures e um `fetch` falso; a sincronização (snapshot, itens desconhecidos, trava, falha parcial preservando os dados, claim compartilhada); a mescla do "já tenho".
- **Testes funcionais:** `/inventory` (abas e htmx), `POST /inventory/sync` com uma fonte falsa injetada pelo container do Adonis, `/game_players`, e a calculadora com "Usar inventário".
- **Com dados reais:** cadastrar os dois personagens, sincronizar e conferir alguns itens contra o jogo. Abrir o plano "Ferramentas T2" com o inventário ligado e ver o custo cair.

## Etapas de implementação

Cada etapa termina com commit e push na `main`.
1. Fonte BitJita, migrations, `InventorySync` e `inventory:sync`, com os testes.
2. As telas `/inventory` e `/game_players`, o botão de sincronizar e o agendamento.
3. "Usar inventário do grupo" na calculadora e nos planos.

## Fora do escopo

- Qualquer escrita no jogo, e qualquer conexão com os servidores do jogo usando token de jogador.
- Um inventário lançado à mão, separado do "já tenho". A coluna `source = 'manual'` deixa o caminho preparado.
- Uma fonte oficial com token do Developer Program. Fica para quando vocês tiverem o token: a interface `InventorySource` já prevê.
