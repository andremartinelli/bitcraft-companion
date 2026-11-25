-- Limpeza do legado de "um personagem por conta" (issue #17, decidido em
-- 25/11/2026: apagar sem esperar que todos escolham o seu personagem).
--
-- Só pode rodar com o código que já não lê user_game_players nem
-- plans.use_inventory no ar (PR #18): a release roda as migrations antes do
-- deploy, e o Prisma seleciona todas as colunas do modelo.

-- Os personagens que cada conta seguia antes. Quem seguia 2 ou mais e não
-- escolheu o seu digita o nick em Meu personagem, guiado pelo aviso.
ALTER TABLE "user_game_players" DROP CONSTRAINT "user_game_players_game_player_id_fkey";
ALTER TABLE "user_game_players" DROP CONSTRAINT "user_game_players_user_id_fkey";
DROP TABLE "user_game_players";

-- A antiga caixa "Usar meu inventário": o inventário está sempre ligado.
ALTER TABLE "plans" DROP COLUMN "use_inventory";

-- Personagens sem nenhuma conta: ninguém mais os lê. Os lugares
-- (inventory_containers) e os itens deles saem em cascata.
DELETE FROM "game_players" AS player
WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."game_player_id" = player."id");
