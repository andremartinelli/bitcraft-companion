/*
  Warnings:

  - You are about to drop the column `user_id` on the `game_players` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "game_players" DROP CONSTRAINT "game_players_user_id_fkey";

-- AlterTable
ALTER TABLE "game_players" DROP COLUMN "user_id",
ADD COLUMN     "last_attempt_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN     "user_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signup_ip" TEXT;

-- CreateTable
CREATE TABLE "plan_shares" (
    "plan_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_shares_pkey" PRIMARY KEY ("plan_id","user_id")
);

-- CreateTable
CREATE TABLE "user_game_players" (
    "user_id" INTEGER NOT NULL,
    "game_player_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_game_players_pkey" PRIMARY KEY ("user_id","game_player_id")
);

-- CreateIndex
CREATE INDEX "plan_shares_user_id_idx" ON "plan_shares"("user_id");

-- CreateIndex
CREATE INDEX "user_game_players_game_player_id_idx" ON "user_game_players"("game_player_id");

-- CreateIndex
CREATE INDEX "plans_created_by_id_idx" ON "plans"("created_by_id");

-- CreateIndex
CREATE INDEX "sync_runs_user_id_started_at_idx" ON "sync_runs"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "users_signup_ip_created_at_idx" ON "users"("signup_ip", "created_at");

-- AddForeignKey
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_game_players" ADD CONSTRAINT "user_game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_game_players" ADD CONSTRAINT "user_game_players_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
