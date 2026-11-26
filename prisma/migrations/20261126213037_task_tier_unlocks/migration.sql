-- AlterTable
ALTER TABLE "game_players" ADD COLUMN     "completed_quest_chain_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "task_tier_unlocks" (
    "id" SERIAL NOT NULL,
    "quest_chain_game_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_tier_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_tier_unlocks_quest_chain_game_id_key" ON "task_tier_unlocks"("quest_chain_game_id");

-- AddForeignKey
ALTER TABLE "task_tier_unlocks" ADD CONSTRAINT "task_tier_unlocks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
