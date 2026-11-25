# Deploy na Vercel e no Neon

O passo a passo para pôr a versão nova no ar, de graça: o app na Vercel (plano Hobby) e o banco no Neon (plano Free), os dois em São Paulo. O desenho está em [design/2026-11-24-vercel.md](design/2026-11-24-vercel.md).

As contas, as chaves e as senhas são suas. Os passos marcados com **Você** são feitos por você. Os marcados com **Claude** só acontecem com o seu OK, passo a passo.

O app antigo não tem planos nem personagens salvos (conferido em 24/11/2026), então não há dados para levar do SQLite. A versão nova começa vazia: os dados do jogo vêm da importação, e as contas são criadas na página de cadastro (`/signup`).

## Como uma versão vai para o ar

**Produção só muda quando uma release é publicada no GitHub** (decidido em 24/11/2026). O workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) roda sozinho e:

1. roda o typecheck, o lint e todos os testes, com um Postgres só para eles;
2. se passarem, aplica as migrations no Neon (`prisma migrate deploy`);
3. publica em produção na Vercel (`vercel deploy --prod`).

Se os testes falharem, nada vai para o ar. Push no `main` não publica (o `vercel.json` desliga o deploy automático dele); push em outros branches gera um preview, que só abre para quem está logado na sua conta da Vercel (veja [Previews](#previews)). O mesmo workflow também roda à mão, em **Actions → Release → Run workflow**.

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

Para gerar uma chave nova, rode num terminal com Node:

```bash
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

## 6. Dados do jogo (Você, pelo GitHub Actions)

A importação no Neon roda pelo workflow [`.github/workflows/game-data-import.yml`](../.github/workflows/game-data-import.yml), com o segredo `DATABASE_URL_UNPOOLED` do passo 5. Nenhuma sessão do Claude e nenhum PC precisa da URL do Neon.

1. No GitHub, **Actions → Importar dados do jogo → Run workflow**.
2. Deixe o branch `main`. O campo do commit é opcional: vazio, importa o último commit do BitCraft_GameData.
3. O resumo (itens novos, removidos e renomeados) aparece no log do job.

- O workflow para antes de importar se o Neon tiver migrations pendentes: publique uma release antes (passo 7).
- Ele espera uma release em andamento terminar, e vice-versa.
- A cada patch do jogo, rode de novo.

## 7. Primeira release e conferência (Você)

1. Publique a release `v0.1.0` com o branch `claude/fork-vercel-e03995` (até o passo 9, as releases saem dele).
2. Acompanhe em **Actions**: os testes, as migrations e o deploy.
3. Abra o endereço de produção (`bitcraft-companion-six.vercel.app`, ou o que a Vercel mostrar no projeto): ele deve pedir login. Crie a sua conta em **Criar conta** e confira Planos, Receitas, Calculadora e Inventário.
4. Em **Settings → Cron Jobs** na Vercel, o `/api/cron/inventory-sync` deve aparecer, às 9h UTC (6h em Brasília). O botão **Run** roda na hora.

## 8. Personagens (Vocês)

Cada um cria a sua conta e informa o nick do seu personagem: no cadastro (campo opcional) ou depois, em **Inventário → Meu personagem**. Quem não tem personagem vê um aviso ⚠️ na aba Inventário e na calculadora, com o link para Meu personagem. Ao abrir o inventário, a primeira sincronização com a BitJita começa sozinha. Quem seguia vários personagens antes de 25/11/2026 digita ali o nick do seu; os outros entram nos planos pela conta de quem joga com eles. Para planos em conjunto, alguém cria um grupo em **Conta**, convida os outros pelo e-mail e manda a cada um o link do convite ("Copiar link"); quem abre o link aceita. Depois, o dono do plano o compartilha pelo menu "Compartilhar com o grupo".

## 9. Juntar no `main` (feito)

Em 24/11/2026, com o app no ar e os dados do jogo importados, o `legacy/` saiu (com o `start-production.ps1` e o que o README antigo dizia sobre o Tailscale) e o branch foi levado para o `main`. As releases seguintes saem do `main`, e o "Run workflow" manual aparece em **Actions**. O app antigo deixou de ser atualizado: o que roda no PC pode ser desligado.

## Frequência do inventário

O app antigo passou a sincronizar a cada minuto (24/11/2026), e a versão nova segue isso: `INVENTORY_STALE_MINUTES` é 1 por padrão. Como na Vercel não existe processo contínuo (e um timer manteria o banco do Neon sempre acordado), a sincronização acontece quando alguém abre uma página que mostra o inventário e algum personagem da conta não é lido há mais de um minuto, além do botão e do cron diário.

Cada personagem são umas 4 chamadas à BitJita e alguns segundos em segundo plano, com a página já aberta e o aviso "Sincronizando com a BitJita…". O banco já está acordado nessa hora, então o custo no Neon é pequeno. Para consultar a BitJita menos vezes, crie a variável na Vercel com um valor maior (por exemplo, 15) e publique uma release.

## Previews

Cada push num branch que não é o `main` gera um preview na Vercel, com um banco próprio e login automático numa conta de teste (decidido em 25/11/2026).

- **Banco:** a integração da Vercel com o Neon cria um branch do Neon `preview/<branch do git>`, cópia da produção (com os dados do jogo e as contas), e o injeta no preview (`DATABASE_URL` e `DATABASE_URL_UNPOOLED`). Essas variáveis não aparecem em Settings → Environment Variables.
- **Build:** o `npm run build` roda o [`scripts/preview_prepare.ts`](../scripts/preview_prepare.ts). Só com `VERCEL_ENV=preview`, ele aplica as migrations do branch no banco do preview e cria ou atualiza a conta de teste. Em qualquer outro build (produção, CI, local), ele não faz nada: produção só migra pelas releases.
- **Conta de teste:** `preview@example.com`, sem senha conhecida. O primeiro nick da variável `PREVIEW_GAME_PLAYERS` é o personagem dela; cada um dos outros é o de uma conta extra (`preview+2@example.com`...), no "Grupo de teste" com ela. Ela tem os planos Set de couro, Set de minério (Plated e Duelist) e Fundação do Homestead, no primeiro tier que os dados do jogo têm, compartilhados com o grupo: um plano mostra o inventário de várias pessoas. O grupo e os planos são refeitos a cada build. Um personagem que a BitJita não acha vira um aviso no log do build, sem quebrar o deploy.
- **Login automático:** sem sessão, o preview manda direto para `/preview_session`, que entra na conta de teste. `/login` e `/signup` continuam abrindo. Fora de um preview, `/preview_session` responde 404 (`tests/integration/preview/`).
- **Limpeza:** o workflow [`.github/workflows/preview-cleanup.yml`](../.github/workflows/preview-cleanup.yml) apaga o branch do Neon quando o branch do git é apagado. A integração só apaga quando o deployment é apagado.

**Limites do plano Free do Neon:** 10 branches por projeto, contando a produção, e as CU-horas dos previews saem da mesma cota de 100 da produção. Ao estourar, o banco todo é suspenso, produção incluída. No 11º branch, o deploy do preview falha ("Resource provisioning failed") até a limpeza rodar.

### O que configurar (Você, uma vez)

1. **Branches de preview no Neon:** na Vercel, **Storage → o banco Neon → Projects**, no **⋮** da linha `bitcraft-companion` → **Manage**: marque **Preview** em Environments e, em **Advanced Options**, ligue **Preview** em "Create database branch for deployment" (feito em 25/11/2026).
2. **Compute dos branches:** no console do Neon, em **Settings → Compute**, deixe o compute padrão dos branches novos em **0,25 CU** e o "scale to zero" em 5 minutos.
3. **Variáveis na Vercel,** em **Settings → Environment Variables**, marcando só **Preview**:

   | Variável | Valor |
   |---|---|
   | `SESSION_SECRET` | Uma chave nova, diferente da de produção (gere como no passo 4) |
   | `PREVIEW_GAME_PLAYERS` | Os nicks, separados por vírgula: o primeiro é o da conta de teste, os outros os das pessoas do grupo dela |

4. **Segredos do GitHub** para a limpeza, em **Settings → Secrets and variables → Actions**:

   | Segredo | Valor |
   |---|---|
   | `NEON_API_KEY` | Uma chave da API em [console.neon.tech/app/settings/api-keys](https://console.neon.tech/app/settings/api-keys) |
   | `NEON_PROJECT_ID` | O id do projeto, em **Settings → General** no console do Neon |

5. **Apagar o branch no merge:** no GitHub, **Settings → General → Pull Requests**, ligue "Automatically delete head branches". Assim a limpeza roda sozinha a cada merge.

O GitHub só roda a limpeza com o workflow que está no `main`: ela começa a funcionar depois do merge deste PR. Para apagar de uma vez os bancos de branches que já não existem: **Actions → Limpar bancos dos previews → Run workflow**.
