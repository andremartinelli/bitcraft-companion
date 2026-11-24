# BitCraft Companion

Companion app para o BitCraft Online 1.0: consulta de receitas e itens, calculadora de custo, planos e o inventário dos seus personagens. Roda de graça na Vercel, com o banco no Neon.

Stack: Next.js, Prisma, Postgres e Chakra UI. As convenções do projeto (no estilo Rails) estão no [CLAUDE.md](CLAUDE.md), e o desenho em [docs/design/2026-11-24-vercel.md](docs/design/2026-11-24-vercel.md).

> **Em transição.** Esta versão está sendo portada do app AdonisJS, que fica em [`legacy/`](legacy/README.md) até o fim do port e continua sendo o que roda no PC a partir do `main`. Todas as áreas já foram portadas: a importação dos dados do jogo, as receitas, os itens, o login, a calculadora, os planos e o inventário com os personagens. Falta o deploy na Vercel e no Neon: o passo a passo está em [docs/deploy.md](docs/deploy.md).

## Requisitos

- Node.js 24 ou mais novo
- Git

## Instalação (desenvolvimento)

```bash
npm install
cp .env.example .env          # e preencha SESSION_SECRET e CRON_SECRET
```

O Postgres local roda com o `prisma dev`, sem instalar serviço no Windows. Abra dois terminais e deixe-os abertos:

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

O `game-data:import` baixa os dados do repositório da comunidade [BitCraftToolBox/BitCraft_GameData](https://github.com/BitCraftToolBox/BitCraft_GameData) e grava no banco de `DATABASE_URL_UNPOOLED` (no Neon, a URL direta). Ele roda do PC, nunca na Vercel:
- o que é novo entra;
- o que saiu do jogo é marcado como removido (nada é apagado);
- itens renomeados aparecem no resumo.

Opções: `-- --commit=<sha>` importa um commit específico, e `-- --path=<pasta>` lê os JSONs de uma pasta local.

## Contas

O app fica público na internet e **sempre pede login**. Qualquer pessoa cria uma conta em `/signup`, com senha de no mínimo 8 caracteres. Para segurar os planos grátis, cada IP cria no máximo 5 contas por dia. Também dá para criar uma conta pela linha de comando:

```bash
npm run users:create -- --email=voce@exemplo.com --name="Seu nome"
```

Para desenvolver, `npm run db:seed` cria um usuário de teste. O e-mail e a senha estão em `prisma/seed.ts`, e o seed se recusa a rodar fora de um banco local.

Depois de 10 senhas erradas seguidas para o mesmo e-mail, ele fica bloqueado por 15 minutos, mesmo com a senha certa. A sessão vale 30 dias, e "Sair" a encerra neste navegador.

Cada conta tem os seus planos. O dono de um plano pode compartilhá-lo com outra conta pelo e-mail: ela vê e edita, e só o dono apaga. Quem recebeu pode sair do plano.

## Inventário

Os inventários vêm da API pública da [BitJita](https://bitjita.com), sem token de jogador. Cada conta adiciona, em **Personagens** (`/game_players`), até 5 personagens cujo inventário quer ver; o nick é conferido na BitJita antes de ser salvo. Um personagem seguido por duas contas é lido uma vez só. O inventário, o "já tenho" da calculadora e o "Você tem" de cada item são os dos personagens da conta.

O app lê a BitJita de três jeitos, e nunca por um timer (o banco do Neon dorme quando ninguém usa o app):

- **Ao abrir uma página** que mostra o inventário (o inventário, a calculadora e os planos): os personagens da conta que não foram lidos há mais de `INVENTORY_STALE_MINUTES` minutos (1, como o app antigo) são lidos de novo, com a página já aberta.
- **"Sincronizar agora"**, nas mesmas páginas, para os personagens da conta. Do PC, `npm run inventory:sync` lê todos.
- **Um cron diário** da Vercel (`vercel.json`, às 6h de Brasília) chama `/api/cron/inventory-sync` com a chave `CRON_SECRET` e lê até 20 personagens que ninguém olhou na última hora.

Só um sync roda por vez. Se a BitJita falhar, os dados anteriores ficam, e a página diz quem não foi lido.

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
