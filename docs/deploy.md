# Deploy na Vercel e no Neon

O passo a passo para pôr a versão nova no ar, de graça: o app na Vercel (plano Hobby) e o banco no Neon (plano Free), os dois em São Paulo. O desenho está em [design/2026-11-24-vercel.md](design/2026-11-24-vercel.md).

As contas, as chaves e as senhas são suas. Os passos marcados com **Você** são feitos por você. Os marcados com **Claude** só acontecem com o seu OK, passo a passo.

O app antigo não tem planos nem personagens salvos (conferido em 24/11/2026), então não há dados para levar do SQLite. A versão nova começa vazia: os dados do jogo vêm da importação, e as contas, do `users:create`.

## 1. Código no GitHub (feito)

O repositório passou do Vitor para a sua conta em 24/11/2026: [andremartinelli/bitcraft-companion](https://github.com/andremartinelli/bitcraft-companion). O branch `claude/fork-vercel-e03995` já está nele. O PR para o `main` fica como rascunho e só é juntado no passo 8.

## 2. Projeto na Vercel (feito)

O projeto `bitcraft-companion` foi criado na sua conta em 24/11/2026, ligado ao repositório e ainda sem deploy. A região das funções vem do `vercel.json` (`gru1`, São Paulo), e o Node é o 26.

- A cada push, a Vercel faz um deploy sozinha. O do branch de produção vai para o ar. Os dos outros branches viram previews, que só abrem para quem está logado na sua conta da Vercel.
- O branch de produção ainda é o `main`, que é o app antigo. Ele passa para `claude/fork-vercel-e03995` no passo 6, junto com o primeiro deploy, quando o banco e as variáveis já existirem. O cron diário só roda no deploy de produção.

## 3. Banco no Neon (Você)

O jeito mais curto é pela própria Vercel: no projeto, **Storage → Create Database → Neon**, plano **Free**, região **São Paulo (aws-sa-east-1)**. Assim a Vercel cadastra sozinha `DATABASE_URL` (com pooler) e `DATABASE_URL_UNPOOLED` (direta). Confira os dois nomes em **Settings → Environment Variables**.

Também dá para criar a conta direto em [neon.tech](https://neon.tech) e copiar as duas URLs para a Vercel à mão: a com `-pooler` no host é a `DATABASE_URL`, e a outra é a `DATABASE_URL_UNPOOLED`.

No console do Neon, deixe o compute fixo em **0,25 CU** (mínimo e máximo) e o "scale to zero" ligado (5 minutos). Isso segura o uso dentro das 100 CU-horas por mês do plano grátis.

## 4. Variáveis de ambiente na Vercel (Você)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | A URL do Neon **com pooler** (vem sozinha pelo Storage da Vercel) |
| `SESSION_SECRET` | Uma chave aleatória nova (comando abaixo). Assina o cookie de login |
| `CRON_SECRET` | Outra chave aleatória. A Vercel manda essa chave no cron diário |
| `INVENTORY_STALE_MINUTES` | `1` (o padrão, decidido em 24/11/2026). Veja "Frequência do inventário" abaixo |

Para gerar cada chave, rode no PowerShell, uma vez para cada:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Não reaproveite as chaves do `.env` local.

## 5. Tabelas, dados do jogo e contas (Você, do PC)

Os comandos rodam do seu PC contra o Neon, com a URL **direta** (sem pooler). No PowerShell, na pasta do projeto, com este branch:

```powershell
$env:DATABASE_URL_UNPOOLED = "cole aqui a URL direta do Neon"
```

```powershell
npx prisma migrate deploy
```

```powershell
npm run game-data:import
```

```powershell
npm run users:create -- --email=seu@email --name="André"
```

```powershell
Remove-Item Env:DATABASE_URL_UNPOOLED
```

- A variável vale só nesse terminal e tem prioridade sobre o `.env`. Por isso o último comando a apaga: os próximos comandos voltam a usar o banco local.
- O `users:create` pede a senha duas vezes, escondida (no mínimo 12 caracteres). Rode de novo para a conta do Vitor: ou ele mesmo digita a senha no seu PC, ou você escolhe uma e passa para ele. O app ainda não tem tela para trocar a senha.
- As migrations rodam do PC, e não no build da Vercel, para nenhum deploy de preview mexer no banco de produção.
- A cada patch do jogo, rode de novo a importação do mesmo jeito.

## 6. Deploy e conferência (Claude, com seu OK, e Você)

1. Em **Settings → Git → Production Branch**, o branch de produção passa para `claude/fork-vercel-e03995`, e sai o primeiro deploy de produção. As variáveis só valem para os deploys feitos depois delas: se alguma for trocada, é preciso um Redeploy.
2. Abra o endereço `bitcraft-companion.vercel.app` (ou o que a Vercel mostrar no projeto): ele deve pedir o login do app. Entre e confira Planos, Receitas, Calculadora e Inventário.
3. Em **Settings → Cron Jobs**, o `/api/cron/inventory-sync` deve aparecer, às 9h UTC (6h em Brasília). O botão **Run** roda na hora.

## 7. Personagens (Vocês)

Em **Inventário → Personagens**, adicione o personagem de cada um pelo nick exato. Ao abrir o inventário, a primeira sincronização com a BitJita começa sozinha.

## 8. Juntar no `main` (Claude, com seu OK)

Depois que o app estiver no ar e conferido:

- sai o `legacy/` (com o `start-production.ps1` e o que o README antigo diz sobre o Tailscale);
- o PR é juntado no `main`;
- em **Settings → Git → Production Branch**, volte para `main`.

O app antigo deixa de ser atualizado a partir daí.

## Frequência do inventário

O app antigo passou a sincronizar a cada minuto (24/11/2026), e a versão nova segue isso: `INVENTORY_STALE_MINUTES` é 1 por padrão. Como na Vercel não existe processo contínuo (e um timer manteria o banco do Neon sempre acordado), a sincronização acontece quando alguém abre uma página que mostra o inventário e o último sync tem mais de um minuto, além do botão e do cron diário.

Cada sync são umas 8 chamadas à BitJita e alguns segundos em segundo plano, com a página já aberta e o aviso "Sincronizando com a BitJita…". O banco já está acordado nessa hora, então o custo no Neon é pequeno. Para consultar a BitJita menos vezes, aumente o valor na Vercel (por exemplo, 15): não precisa mudar código.
