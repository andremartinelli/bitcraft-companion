# Deploy na Vercel e no Neon

O passo a passo para pôr a versão nova no ar, de graça: o app na Vercel (plano Hobby) e o banco no Neon (plano Free), os dois em São Paulo. O desenho está em [design/2026-11-24-vercel.md](design/2026-11-24-vercel.md).

As contas, as chaves e as senhas são suas. Os passos marcados com **Você** são feitos por você. Os marcados com **Claude** só acontecem com o seu OK, passo a passo.

O app antigo não tem planos nem personagens salvos (conferido em 24/11/2026), então não há dados para levar do SQLite. A versão nova começa vazia: os dados do jogo vêm da importação, e as contas são criadas na página de cadastro (`/signup`).

## Como uma versão vai para o ar

**Produção só muda quando uma release é publicada no GitHub** (decidido em 24/11/2026). O workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) roda sozinho e:

1. roda o typecheck, o lint e todos os testes, com um Postgres só para eles;
2. se passarem, aplica as migrations no Neon (`prisma migrate deploy`);
3. publica em produção na Vercel (`vercel deploy --prod`).

Se os testes falharem, nada vai para o ar. Push no `main` não publica (o `vercel.json` desliga o deploy automático dele); push em outros branches gera um preview, que só abre para quem está logado na sua conta da Vercel. O mesmo workflow também roda à mão, em **Actions → Release → Run workflow**.

Para publicar uma versão: no GitHub, **Releases → Draft a new release**, crie uma tag nova (`v0.1.0`, `v0.2.0`…), escolha o branch e clique em **Publish release**. O andamento aparece em **Actions**.

## 1. Código no GitHub (feito)

O repositório passou do Vitor para a sua conta em 24/11/2026: [andremartinelli/bitcraft-companion](https://github.com/andremartinelli/bitcraft-companion). O branch `claude/fork-vercel-e03995` já está nele. O PR para o `main` fica como rascunho e só é juntado no passo 8.

## 2. Projeto na Vercel (feito)

O projeto `bitcraft-companion` foi criado na sua conta em 24/11/2026, ligado ao repositório. A região das funções vem do `vercel.json` (`gru1`, São Paulo), e o Node é o 26. O primeiro push virou um deploy de produção sem banco (`bitcraft-companion-six.vercel.app`); daqui em diante, produção só muda pelas releases.

## 3. Banco no Neon (feito)

Criado pela própria Vercel (**Storage → Neon**, plano Free, São Paulo), conectado só ao ambiente Production, com o prefixo `DATABASE`: a Vercel cadastrou `DATABASE_URL` (com pooler) e `DATABASE_URL_UNPOOLED` (direta), entre outras que o app não usa.

No console do Neon, deixe o compute fixo em **0,25 CU** (mínimo e máximo) e o "scale to zero" ligado (5 minutos). Isso segura o uso dentro das 100 CU-horas por mês do plano grátis.

## 4. Variáveis de ambiente na Vercel (feito)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | A URL do Neon **com pooler** (veio pelo Storage da Vercel) |
| `SESSION_SECRET` | Uma chave aleatória. Assina o cookie de login |
| `CRON_SECRET` | Outra chave aleatória. A Vercel manda essa chave no cron diário |
| `INVENTORY_STALE_MINUTES` | Opcional. Sem ela, 1 minuto. Veja "Frequência do inventário" abaixo |

Para gerar uma chave nova, rode no PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Não reaproveite as chaves do `.env` local. As variáveis só valem para os deploys feitos depois delas.

## 5. Segredos do GitHub para o workflow (Você)

No repositório, **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo | Valor |
|---|---|
| `VERCEL_TOKEN` | Um token novo da Vercel, em [vercel.com/account/settings/tokens](https://vercel.com/account/settings/tokens), com o escopo `andremartinellis-projects`. Dê um nome como "GitHub Actions bitcraft" e uma validade |
| `DATABASE_URL_UNPOOLED` | A URL **direta** do Neon (sem `-pooler` no host), a mesma da aba **.env.local** do banco na Vercel |

O id da conta e o do projeto da Vercel já estão no workflow; não são segredos.

## 6. Dados do jogo (Você, do PC)

A importação continua rodando do seu PC, contra o Neon, com a URL **direta**. No PowerShell, na pasta do projeto:

```powershell
$env:Path = "C:\Users\Andre\tools\node-v26.13.1-win-x64;$env:Path"
```

```powershell
$env:DATABASE_URL_UNPOOLED = "cole aqui a URL direta do Neon"
```

```powershell
npm.cmd run game-data:import
```

```powershell
Remove-Item Env:DATABASE_URL_UNPOOLED
```

- A importação precisa das tabelas: rode depois da primeira release, ou antes dela, rodando também `npx.cmd prisma migrate deploy` nesse terminal.
- A variável vale só nesse terminal e tem prioridade sobre o `.env`. Por isso o último comando a apaga: os próximos comandos voltam a usar o banco local.
- O `npm.cmd` e o `npx.cmd` evitam o bloqueio de scripts do PowerShell.
- A cada patch do jogo, rode de novo a importação do mesmo jeito.

## 7. Primeira release e conferência (Você)

1. Publique a release `v0.1.0` com o branch `claude/fork-vercel-e03995` (até o passo 9, as releases saem dele).
2. Acompanhe em **Actions**: os testes, as migrations e o deploy.
3. Abra o endereço de produção (`bitcraft-companion-six.vercel.app`, ou o que a Vercel mostrar no projeto): ele deve pedir login. Crie a sua conta em **Criar conta** e confira Planos, Receitas, Calculadora e Inventário.
4. Em **Settings → Cron Jobs** na Vercel, o `/api/cron/inventory-sync` deve aparecer, às 9h UTC (6h em Brasília). O botão **Run** roda na hora.

## 8. Personagens (Vocês)

Cada um cria a sua conta e, em **Inventário → Personagens**, adiciona os personagens cujo inventário quer ver (até 5). Ao abrir o inventário, a primeira sincronização com a BitJita começa sozinha. Para planos em conjunto, o dono do plano o compartilha pelo e-mail da outra conta.

## 9. Juntar no `main` (Claude, com seu OK)

Depois que o app estiver no ar e conferido:

- sai o `legacy/` (com o `start-production.ps1` e o que o README antigo diz sobre o Tailscale);
- o PR é juntado no `main`;
- as releases seguintes saem do `main`.

O app antigo deixa de ser atualizado a partir daí.

## Frequência do inventário

O app antigo passou a sincronizar a cada minuto (24/11/2026), e a versão nova segue isso: `INVENTORY_STALE_MINUTES` é 1 por padrão. Como na Vercel não existe processo contínuo (e um timer manteria o banco do Neon sempre acordado), a sincronização acontece quando alguém abre uma página que mostra o inventário e algum personagem da conta não é lido há mais de um minuto, além do botão e do cron diário.

Cada personagem são umas 4 chamadas à BitJita e alguns segundos em segundo plano, com a página já aberta e o aviso "Sincronizando com a BitJita…". O banco já está acordado nessa hora, então o custo no Neon é pequeno. Para consultar a BitJita menos vezes, crie a variável na Vercel com um valor maior (por exemplo, 15) e publique uma release.
