# BitCraft Companion

[English](README.md) · **Português**

Companion app para o BitCraft Online 1.0: consulta de receitas e itens, calculadora de custo, planos e o inventário do seu personagem e das pessoas dos seus planos. Roda de graça na Vercel, com o banco no Neon.

Stack: Next.js, Prisma, Postgres e Chakra UI. As convenções do projeto (no estilo Rails) estão no [CLAUDE.md](CLAUDE.md), e o desenho em [docs/design/2026-11-24-vercel.md](docs/design/2026-11-24-vercel.md) (em inglês). A interface do app é em português; o código e a documentação técnica são em inglês.

Produção muda a cada release publicada no GitHub: o workflow roda os testes, as migrations no Neon e o deploy na Vercel. Os passos de deploy ficam fora deste repositório. Esta versão substituiu o app AdonisJS que rodava no PC; ele ficou no histórico do git, antes do merge de 24/11/2026.

## Requisitos

- Node.js 24 ou mais novo
- Git

## Desenvolvimento nas sessões do Claude Code na nuvem

O projeto é desenvolvido em sessões do Claude Code na nuvem (claude.ai/code). O ambiente roda `scripts/workspace/cloud-setup.sh` uma vez (Node e Postgres nas versões da CI, `.env` só com valores locais, dependências, migrations, dados do jogo e um usuário de desenvolvimento), e cada sessão liga o Postgres sozinha pelo hook de início (`scripts/workspace/cloud-start.sh`). Depois é só `npm test` ou `npm run dev`. Os detalhes estão no [CLAUDE.md](CLAUDE.md).

## Instalação local (sem a nuvem)

```bash
npm install
cp .env.example .env          # e preencha SESSION_SECRET e CRON_SECRET
```

O Postgres local roda com o `prisma dev`, sem instalar serviço nem Docker. Abra dois terminais e deixe-os abertos:

```bash
npm run db:dev                # banco de dev, porta 51214
npm run db:test               # banco dos testes, porta 51224
```

Depois, noutro terminal:

```bash
npx prisma migrate dev        # cria as tabelas no banco de dev
npx prisma migrate deploy     # e no de testes, com DATABASE_URL_UNPOOLED apontando para a porta 51224
npm run game-data:import      # dados do jogo (uns 15 s); rode de novo a cada patch
npm run dev                   # http://localhost:3100
```

O `game-data:import` baixa os dados do repositório da comunidade [BitCraftToolBox/BitCraft_GameData](https://github.com/BitCraftToolBox/BitCraft_GameData) e grava no banco de `DATABASE_URL_UNPOOLED`. Em produção, ele roda pelo workflow manual "Importar dados do jogo" do GitHub Actions, contra o Neon, e nunca na Vercel (veja `.github/workflows/game-data-import.yml`):
- o que é novo entra;
- o que saiu do jogo é marcado como removido (nada é apagado);
- itens renomeados aparecem no resumo.

Opções: `-- --commit=<sha>` importa um commit específico, e `-- --path=<pasta>` lê os JSONs de uma pasta local.

## Contas

O app fica público na internet e **sempre pede login**. Qualquer pessoa cria uma conta em `/signup`, com senha de no mínimo 8 caracteres. Para segurar os planos grátis, cada IP cria no máximo 5 contas por dia. O nick do personagem é opcional no cadastro: preenchido, o app o confere na BitJita antes de criar a conta, e a conta já nasce com ele. Se a BitJita não achar o nick ou estiver fora do ar, a conta não é criada e o formulário diz por quê; dá para apagar o campo e seguir. Cada tentativa com nick que falha conta no limite de 5 por IP por dia, como uma conta. Também dá para criar uma conta pela linha de comando:

```bash
npm run users:create -- --email=voce@exemplo.com --name="Seu nome"
```

Para desenvolver, `npm run db:seed` cria um usuário de teste. O e-mail e a senha estão em `prisma/seed.ts`, e o seed se recusa a rodar fora de um banco local.

Depois de 10 senhas erradas seguidas para o mesmo e-mail, ele fica bloqueado por 15 minutos, mesmo com a senha certa. A sessão vale 30 dias, e "Sair" a encerra neste navegador.

Cada conta tem os seus planos. Para planos em conjunto, uma conta cria um grupo em **Conta** e manda o link do convite às outras. O dono de um plano o compartilha com o grupo inteiro ("Todos do grupo") ou com pessoas do grupo, uma a uma: quem recebe vê e edita, e só o dono apaga.

## Inventário

Os inventários vêm da API pública da [BitJita](https://bitjita.com), sem token de jogador. Cada conta tem um personagem, informado no cadastro ou em **Meu personagem** (`/game_player`); o nick é conferido na BitJita antes de ser salvo. Um personagem de duas contas é lido uma vez só. Conta sem personagem vê um aviso ⚠️ na aba Inventário e na calculadora, com o link para Meu personagem. O inventário, a calculadora rápida e o "Você tem" de cada item usam o personagem da conta. Um plano usa também os personagens das pessoas do plano (o dono e quem o recebeu), cada um uma vez; "Usar apenas meu inventário" deixa só o seu. O "já tenho" digitado vale mais que o inventário.

Os baús de uma claim só contam quando você marca a claim em **Meu personagem** (desmarcada no começo, e sempre a claim inteira: a BitJita não diz quais baús cada membro consegue abrir). A claim marcada acompanha o seu personagem: num plano, contam também as claims marcadas pelas pessoas do plano, cada uma uma vez, e o menu **Claims** do plano deixa cada pessoa tirar algumas só para si. A sincronização lê só as claims marcadas.

O app lê a BitJita de três jeitos, e nunca por um timer (o banco do Neon dorme quando ninguém usa o app):

- **Ao abrir uma página** que mostra o inventário (o inventário, a calculadora e os planos): os personagens da página que não foram lidos há mais de `INVENTORY_STALE_MINUTES` minutos (1, como o app antigo) são lidos de novo, com a página já aberta. Até 15 por vez, os mais antigos primeiro.
- **"Sincronizar agora"**, nas mesmas páginas, para os personagens da página (até 15). Do PC, `npm run inventory:sync` lê todos.
- **Um cron diário** da Vercel (`vercel.json`, às 6h de Brasília) chama `/api/cron/inventory-sync` com a chave `CRON_SECRET` e lê até 15 personagens que ninguém olhou na última hora.

Só um sync roda por vez. Se a BitJita falhar, os dados anteriores ficam, e a página diz quem não foi lido.

## Tasks

A página **Tasks** (`/tasks`) mostra as tasks dos viajantes (não as quests). Em cima, as tasks que o seu personagem tem agora, lidas da BitJita junto com o inventário. Embaixo, todas as tasks do seu tier em cada viajante, dos dados do jogo: o tier vem do seu nível na habilidade do viajante (nível 20 → T2 ... 100 → T10, abaixo de 20 → T1). Às vezes os viajantes também dão tasks de um ou dois tiers abaixo. Cada item mostra quanto você tem (o seu personagem e as claims marcadas) e quanto falta.

## Testes

```bash
npm test                      # unit (sem banco) e integration (Postgres de testes)
npm run test:unit
npm run typecheck
npm run lint
```

Os testes de integração apagam tudo do banco de testes antes de cada teste. Eles se recusam a rodar se `TEST_DATABASE_URL` não estiver definida ou for o banco de dev.

## Regras do jogo

O app só lê dados. Ele não modifica o cliente do jogo nem automatiza nada. Os inventários vêm da API pública da BitJita: o app nunca conecta nos servidores do jogo com o token de um jogador (isso derruba a sessão do jogo da pessoa) e não guarda token de ninguém. Compartilhar o token de um jogador é "account sharing" e dá ban.
