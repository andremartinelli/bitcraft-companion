# BitCraft Companion

Companion app para o BitCraft Online 1.0: consulta de receitas e itens, calculadora de custo, planos e o inventário do grupo. Roda de graça na Vercel, com o banco no Neon.

Stack: Next.js, Prisma, Postgres e Chakra UI. As convenções do projeto (no estilo Rails) estão no [CLAUDE.md](CLAUDE.md), e o desenho em [docs/design/2026-11-24-vercel.md](docs/design/2026-11-24-vercel.md).

> **Em transição.** Esta versão está sendo portada do app AdonisJS, que fica em [`legacy/`](legacy/README.md) até o fim do port e continua sendo o que roda no PC a partir do `main`. Áreas já portadas: nenhuma ainda (o esqueleto sobe, com o menu e as páginas vazias).

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
npm run dev                   # http://localhost:3100
```

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
