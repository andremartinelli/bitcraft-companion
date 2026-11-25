-- AlterTable
ALTER TABLE "users" ADD COLUMN     "game_player_id" INTEGER;

-- CreateTable
CREATE TABLE "plan_user_settings" (
    "plan_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "only_my_inventory" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_user_settings_pkey" PRIMARY KEY ("plan_id","user_id")
);

-- CreateIndex
CREATE INDEX "plan_user_settings_user_id_idx" ON "plan_user_settings"("user_id");

-- CreateIndex
CREATE INDEX "users_game_player_id_idx" ON "users"("game_player_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_user_settings" ADD CONSTRAINT "plan_user_settings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_user_settings" ADD CONSTRAINT "plan_user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um personagem por conta (25/11/2026): quem seguia um só já sai com ele. Quem
-- seguia 2 ou mais escolhe em Meu personagem. As linhas de user_game_players
-- ficam (a migração só acrescenta: o app antigo segue no ar até o deploy).
UPDATE "users" u
SET "game_player_id" = f."game_player_id"
FROM (
    SELECT "user_id", MIN("game_player_id") AS "game_player_id"
    FROM "user_game_players"
    GROUP BY "user_id"
    HAVING COUNT(*) = 1
) f
WHERE u."id" = f."user_id";
