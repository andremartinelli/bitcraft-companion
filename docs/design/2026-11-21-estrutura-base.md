# BitCraft Companion: estrutura base

Data: 2026-11-21 · Status: rascunho para aprovação

## Intenção

Um companion app para o BitCraft Online (versão 1.0), usado pelo Vitor e por um amigo. Ele serve para consultar receitas e fazer contas de planejamento, como "quantos recursos precisamos para subir nossas ferramentas de T1 para T2", levando em conta o que eles já têm.

Esta rodada entrega a **estrutura base**: um app funcionando ponta a ponta, onde as próximas funcionalidades entram sem precisar refazer nada. O Vitor programa em Ruby on Rails há bastante tempo e quer as mesmas convenções e boas práticas, mesmo o projeto sendo em JS/TS.

## Objetivos desta rodada

1. App **AdonisJS 7** (TypeScript) com **SQLite**, criado a partir do starter kit web oficial.
2. **Login com sessão** para dois usuários, sem cadastro aberto. As contas são criadas por um comando `ace`.
3. **Importação dos dados estáticos do jogo** por um comando `ace` que pode ser rodado de novo a cada patch.
4. **Esqueleto navegável**, só leitura: uma lista de receitas com busca e filtros e uma página de item ("como obter" e "usado em"). Serve para provar que o modelo de dados, as rotas, as views e os testes funcionam juntos.
5. **Convenções do Rails** documentadas e aplicadas (ver seção própria).
6. **Acesso pelo outro PC via Tailscale**: o servidor precisa aceitar conexões vindas da rede, não só do `localhost`.

## Fora do escopo desta rodada (planejado para depois)

O modelo de dados desta rodada precisa deixar espaço para estas funcionalidades, mas elas não serão construídas agora:

- **Calculadora de custo**: a árvore de produção até a matéria-prima, com troca de receita por etapa e esforço total por skill. A lógica de referência já existe no protótipo `bitcraft-receitas.html` (função `expand`).
- **Inventário lançado à mão**, e depois a conta de "o que falta" usando esse inventário.
- **Sync automático** do inventário com o jogo, via SDK TypeScript do SpacetimeDB e o token do próprio jogador.
- Publicação na web.

## Anti-objetivos

O projeto fracassa, mesmo funcionando, se fizer qualquer uma destas coisas:

- **Violar as regras do jogo.** Nada de modificar o cliente, macros, automação de jogabilidade, ler a memória do jogo, ou compartilhar o token de um jogador com outra pessoa (conta como "account sharing" e dá ban). Integração com o jogo só por leitura de dados, cada jogador com o próprio token.
- **Virar uma SPA pesada**, ou adicionar um build de frontend que o projeto não precisa.
- **Ter mais arquitetura do que um app de duas pessoas pede**: microserviços, filas, cache distribuído.

## Restrições

- Roda numa máquina Windows 11 com Node 26 instalado. O outro jogador acessa pelo navegador, via Tailscale.
- O banco é um arquivo SQLite local nessa máquina. Nunca colocar esse arquivo numa pasta sincronizada (Drive, OneDrive): a sincronização corrompe o banco.
- Os dados do jogo vêm do repositório da comunidade [BitCraftToolBox/BitCraft_GameData](https://github.com/BitCraftToolBox/BitCraft_GameData), branch `cereal/cs`, pasta `static/`. Ele é atualizado a cada patch (o último em 2026-11-19).
- Os nomes no jogo estão só em inglês. A interface do app fica em português; os nomes dos itens ficam como vêm do jogo.

## Abordagens consideradas

**Framework.** A escolha foi o **AdonisJS**: é o framework Node mais próximo do Rails, com ORM no estilo Active Record (Lucid), migrations, seeders, CLI com geradores, validação, autenticação e testes. É maduro: existe desde 2015, a versão atual é a 7.7, tem cerca de 310 mil downloads por semana e manutenção ativa. A outra opção era montar Express ou Fastify com um ORM avulso, e foi descartada porque todas as convenções ficariam por nossa conta.

**Compartilhamento entre os dois jogadores.** A escolha foi **um app e um banco, numa máquina, acessados pelo Tailscale**: não exige código a mais e o caminho para a web continua curto. As opções descartadas:
- Cada um com sua cópia do app e um banco Turso na nuvem: adiciona um serviço externo sem necessidade.
- Cada um com seu banco e troca de arquivos JSON pelo Drive: exige escrever lógica de mesclagem, que costuma dar defeitos chatos.
- O SQLite numa pasta do Drive: corrompe o banco.

**Interface.** A escolha foi **HTML gerado no servidor com templates Edge e htmx**, o equivalente ao Rails com Hotwire: as interações atualizam só pedaços da página, e as contas ficam em services no backend. A opção descartada foi Inertia com React, que traz dois mundos e mais JS sem necessidade. Uma API separada com SPA também foi descartada, porque contraria o modelo de monolito.

## Decisões de como construir

### Convenções do Rails aplicadas ao Adonis

| Rails | Neste projeto |
|---|---|
| Rotas `resources` RESTful | `router.resource()` com as sete ações padrão. Rotas fora desse padrão só quando houver motivo. |
| Controllers magros, models com regra de domínio | Controllers só recebem, validam, chamam e renderizam. Regras ficam nos models (Lucid) ou em services. |
| Service objects / POROs | `app/services/`, uma classe por caso de uso (por exemplo `GameData::Importer` vira `app/services/game_data/importer.ts`). |
| Strong params + validations | Validators VineJS em `app/validators/`, um por recurso e ação. |
| Migrations versionadas, `schema.rb` | Migrations do Lucid. Nunca editar uma migration que já foi aplicada; criar uma nova. |
| `db/seeds.rb` | Seeders do Lucid, só para dados de desenvolvimento e teste. Os dados do jogo vêm do comando de importação, não de seeder. |
| Rake tasks | Comandos `ace` em `commands/`, como `node ace bitcraft:import` e `node ace users:create`. |
| Partials e layouts | Componentes e layouts Edge. As respostas htmx renderizam partials. |
| Model specs e request specs | Japa: testes unitários para services e models, testes funcionais para rotas e controllers, com factories. |
| Convenção acima de configuração | Nomes no padrão do Adonis: tabelas no plural em snake_case, models no singular em PascalCase. Inglês no código, português na interface. |

Essas convenções vão para um `CONVENTIONS.md` (ou para o `CLAUDE.md`) na raiz, para servir de guia daqui em diante.

### Modelo de dados dos dados do jogo

São tabelas só de leitura, preenchidas pelo importador. Os IDs do jogo ficam guardados como `game_id`.

- **`items`**: itens e cargos juntos, com `kind` (`item` ou `cargo`) e `game_id`, únicos pelo par `(kind, game_id)`. Isso é necessário porque os IDs de item e de cargo se repetem entre as duas tabelas do jogo. Campos: `name`, `description`, `tier`, `tag`, `rarity`, `item_list_id` (quando o item é uma "saída aleatória").
  - Existem vários itens com o mesmo nome e raridades diferentes. Por exemplo, há 12 entradas "Celestium Shortsword". A interface sempre mostra a raridade junto do nome.
- **`item_lists`** e **`item_list_possibilities`** (com `probability`) e **`item_list_possibility_items`** (`item_id`, `quantity`): as saídas com chance, como "Rough Wood Log Output".
- **`recipes`**: receitas de craft e de construção juntas, com `kind` (`crafting` ou `construction`) e o `game_id` original. Campos:
  - `name`, com os placeholders já resolvidos: `{0}` vira o primeiro item produzido, `{1}` vira o primeiro ingrediente.
  - `verb`, a primeira palavra do nome (Craft, Scrap, Cook…).
  - `actions_required` (esforço), `time_per_action`, `stamina_per_action`.
  - `skill_id` e `skill_level`, `tool_type_id` e `tool_tier`, `building_type_id` e `building_tier`.
  - `is_passive`, `hidden_without_knowledge`.
  - Para construção: o nome do prédio, `shards` e `paving_tier`.
- **`recipe_inputs`** (`recipe_id`, `item_id`, `quantity`) e **`recipe_outputs`** (`recipe_id`, `item_id`, `quantity`). Quando a saída é uma lista aleatória, `item_id` aponta para o item da lista.
- **`skills`**, **`tool_types`**, **`building_types`**: tabelas de lookup.
- **`game_data_imports`**: um registro por importação, com o commit e a data da fonte, as contagens e quando rodou. Serve para mostrar no app de quando são os dados.

**Importar tudo** (decisão minha): o importador carrega todos os itens de `item_desc` e de `cargo_desc`, e não só os que aparecem em receitas. Assim o inventário futuro consegue guardar qualquer item, e todo item tem página. Números de referência da importação de 2026-11-19:

| Dado | Quantidade |
|---|---|
| Itens | 8.645 |
| Cargos | 677 |
| Itens usados em receitas | 6.932 |
| Listas aleatórias (em `item_list_desc`) | 2.538 |
| Receitas de craft | 7.921 |
| Receitas de construção | 876 |

**Uma exigência de cada por receita** (decisão minha, conferida nos dados de 2026-11-19):
- Toda receita de craft tem exatamente 1 skill e 1 estação, e 0 ou 1 ferramenta.
- Toda receita de construção tem exatamente 1 skill e 0 ou 1 ferramenta.

Por isso as exigências ficam como colunas simples em `recipes`, e a de ferramenta pode ser nula. Se um patch trouxer uma receita com mais de uma exigência do mesmo tipo, o importador **para com erro** e diz qual receita é. Ele não descarta dados em silêncio. Nesse caso cria-se uma migration que leva as exigências para uma tabela própria.

**Dados que somem do jogo** (decisão minha): itens, receitas e listas nunca são apagados. Eles ganham um `removed_at` quando somem da fonte, e voltam a `null` se reaparecerem. As telas e as consultas padrão filtram os removidos (escopo `active` no model). Isso protege o inventário e os planos futuros, que vão apontar para `items.id` e `recipes.id`.
- Os IDs do jogo são tratados como estáveis entre patches.
- Se um `game_id` já existente vier com um nome diferente, o importador atualiza o nome e lista essa mudança no resumo da importação, para dar para ver se um ID foi reaproveitado para outra coisa.

### Dados dos usuários

- **`users`**: `full_name`, `email`, `password`. Só via `node ace users:create`; não existe tela de cadastro.
- O inventário é uma funcionalidade da próxima rodada. Quando entrar, cada lançamento vai registrar `source` (`manual` ou `sync`) e quem lançou, para o sync automático ser só mais uma origem.

### Importador (`node ace bitcraft:import`)

- **De onde vem:** baixa os JSONs de `static/` do repositório da comunidade, num commit definido (o mais recente do branch, se nenhum for informado), ou lê de uma pasta local via `--path`.
- **Idempotente:** roda numa transação e faz upsert por `game_id`. Rodar duas vezes seguidas dá o mesmo resultado. O que sumiu da fonte ganha `removed_at`, conforme a regra acima.
- **Registro:** grava uma linha em `game_data_imports` a cada execução.
- **Tabelas lidas:** `item_desc`, `cargo_desc`, `item_list_desc`, `crafting_recipe_desc`, `construction_recipe_desc`, `building_desc`, `building_type_desc`, `skill_desc`, `tool_type_desc`.

### Esqueleto navegável

- **`GET /recipes`**: lista com busca por nome de receita, produto ou ingrediente, e filtros por skill, estação, tier e tipo. Por padrão esconde as receitas de desmontar, recriar e embalar (Scrap, Recraft, Unpack, Package, Pack, Reforge, Salvage, Revert). Tem paginação. A busca e os filtros atualizam a lista via htmx, sem recarregar a página.
- **`GET /items/:id`**: dados do item, receitas que o produzem (incluindo as que o produzem via lista aleatória, com a chance) e receitas que o usam.
- **Login e logout**, e tudo exige login.
- O protótipo `bitcraft-receitas.html` serve de referência visual e de comportamento, não de código a portar.

### Rede e execução

- Uma variável `HOST` no `.env` controla em qual endereço o servidor escuta. Para aceitar acesso pelo Tailscale, ela fica em `0.0.0.0`.
- **Dois jeitos de rodar** (decisão minha), porque o amigo usa o app de verdade:
  - **Para desenvolver:** `node ace serve --hmr`.
  - **Para jogar:** um script que faz o build de produção e inicia o servidor, com `NODE_ENV=production` e um `APP_KEY` próprio no `.env`. Ele é iniciado à mão quando forem jogar. Iniciar sozinho com o Windows fica fora desta rodada.
- O cookie de sessão não pode exigir HTTPS, porque o acesso pelo Tailscale é HTTP puro. Isso é controlado por uma variável no `.env`, para virar `secure` quando o app for para a web.
- O README explica como rodar nos dois modos, como criar os dois usuários, como importar os dados e como o amigo acessa pelo Tailscale.
- O arquivo SQLite fica numa pasta ignorada pelo git, dentro do projeto.

## Deixado para quem for construir

- Os detalhes de estrutura do starter kit do Adonis 7 e as versões exatas dos pacotes.
- **CSS:** Tailwind ou CSS simples, desde que leve.
- **Instalação do htmx:** por pacote via Vite ou por um arquivo copiado.
- Como baixar os arquivos do GitHub no importador.
- O desenho exato dos índices, incluindo a busca por texto (LIKE, ou FTS5 do SQLite se o LIKE ficar lento).
- **A pasta não está vazia:** já tem `docs/` e os arquivos copiados desta sessão (o protótipo HTML e os CSVs). O gerador do Adonis pode reclamar disso. Uma saída é gerar o app numa pasta temporária e mover para cá. Os arquivos da sessão podem ir para `docs/reference/`.
- Iniciar o repositório git e fazer o commit inicial.
