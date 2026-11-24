# BitCraft Companion

Companion app para o BitCraft Online 1.0: consulta de receitas e itens, calculadora de custo, planos e o inventário do grupo. Ele roda numa máquina Windows e a outra pessoa acessa pelo navegador, via Tailscale.

Stack: AdonisJS 7, SQLite, Edge e htmx. As convenções do projeto (no estilo Rails) estão no [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 24 ou mais novo
- Git

## Instalação

```bash
npm install
cp .env.example .env
node ace generate:key
node ace migration:run
node ace bitcraft:import
```

O `bitcraft:import` baixa os dados do jogo do repositório da comunidade [BitCraftToolBox/BitCraft_GameData](https://github.com/BitCraftToolBox/BitCraft_GameData) e leva uns 10 segundos. Rode de novo a cada patch do jogo:
- o que é novo entra;
- o que saiu do jogo é marcado como removido (nada é apagado);
- itens renomeados aparecem no resumo.

Opções:
- `--commit=<sha>` importa um commit específico do repositório de dados.
- `--path=<pasta>` lê os JSONs de uma pasta local, em vez do GitHub.

## Contas

Por enquanto o app **não pede login**: quem alcança o servidor (a rede local ou o Tailscale) usa o app direto. Para voltar a pedir login, ponha `LOGIN_REQUIRED=true` no `.env` (ou no `.env.production`) e reinicie o servidor.

Com o login ligado, não existe cadastro pelo site. Crie as duas contas pela linha de comando. Quando `--password` não é passado, a senha é pedida de forma oculta.

```bash
node ace users:create --email=voce@exemplo.com --name="Seu nome"
```

Para desenvolvimento, `node ace db:seed` cria o usuário `dev@example.com` com senha `dev-password`. Esse seeder só roda em `NODE_ENV=development`.

## Inventário

O app lê os inventários dos personagens na API pública da [BitJita](https://bitjita.com), sem senha nem token do jogo.

1. Em **Inventário → Personagens**, adicione cada personagem pelo nick exato do jogo. O nick é conferido na BitJita antes de salvar.
2. Clique em **Sincronizar agora**. Enquanto o servidor estiver rodando, ele também sincroniza sozinho a cada minuto (umas 8 chamadas à BitJita, bem abaixo do limite de 250 por minuto). A variável `INVENTORY_SYNC_MINUTES` muda o intervalo, e `0` desliga. O histórico de sincronizações guarda só os últimos 7 dias.
3. Pela linha de comando: `node ace inventory:sync`.

A BitJita é mantida pela comunidade e não diz quão atuais são os dados. Se ela estiver fora do ar, o app mantém os dados da última sincronização que funcionou. Se aparecer o aviso de itens desconhecidos, rode `node ace bitcraft:import`.

## Desenvolvimento

```bash
npm run dev          # http://localhost:3333
npm test
npm run typecheck
npm run lint
```

Os tipos de rotas e controllers em `.adonisjs/server/` são gerados pelo `npm run dev`. Depois de mexer em `start/routes.ts`, suba o dev uma vez antes de rodar o `typecheck`.

## Rodar em produção

É o modo de uso do dia a dia: o app compilado, com o banco de vocês em `storage/` e acessível pelo Tailscale. Deixe-o rodando enquanto quiserem consultar o app.

1. Copie `.env.production.example` para `.env.production`.
2. Preencha o `APP_KEY` com a saída de `node ace generate:key --show`.
3. Confira o `DB_DATABASE`: ele é um caminho absoluto dentro de `storage/`, fora da pasta `build/`, que é apagada a cada build.
4. Inicie o servidor no PowerShell:

   ```powershell
   .\scripts\start-production.ps1 -Import   # na primeira vez: build, migrations, dados do jogo e servidor
   .\scripts\start-production.ps1           # nas próximas vezes
   .\scripts\start-production.ps1 -NoBuild  # só reinicia o último build, sem refazer nada
   ```

5. Crie as contas no banco de produção, a partir da pasta `build/`:

   ```powershell
   cd build
   node ace users:create --email=voce@exemplo.com
   ```

O banco de produção é separado do banco de desenvolvimento (`tmp/db.sqlite3`).

**Não coloque nenhum arquivo `.sqlite3` numa pasta sincronizada** (Drive, OneDrive, Dropbox). A sincronização corrompe o banco.

## Acesso pelo Tailscale

1. Instale o [Tailscale](https://tailscale.com) nas duas máquinas e entre na mesma conta ou tailnet.
2. Na máquina que roda o app, veja o IP dela com `tailscale ip -4`. É algo como `100.x.y.z`.
3. Com o `start-production.ps1` rodando, a outra pessoa abre `http://100.x.y.z:3333`.

Na primeira vez, o Windows pode pedir para liberar o Node.js no firewall. Permita só em redes privadas. Se o pedido não aparecer e o acesso não funcionar, libere a porta 3333 para a interface do Tailscale nas configurações do Firewall do Windows.

## Regras do jogo

O app só lê dados. Ele não modifica o cliente do jogo nem automatiza nada. Os inventários vêm da API pública da BitJita: o app nunca conecta nos servidores do jogo com o token de um jogador (isso derruba a sessão do jogo da pessoa) e não guarda token de ninguém. Compartilhar o token de um jogador é "account sharing" e dá ban.
