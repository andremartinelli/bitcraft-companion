-- AlterTable
ALTER TABLE "game_players" ADD COLUMN     "skills" JSONB;

-- CreateTable
CREATE TABLE "traveler_tasks" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "traveler" TEXT,
    "skill_id" INTEGER NOT NULL,
    "min_level" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "traveler_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traveler_task_inputs" (
    "id" SERIAL NOT NULL,
    "traveler_task_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "traveler_task_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_player_tasks" (
    "id" SERIAL NOT NULL,
    "game_player_id" INTEGER NOT NULL,
    "traveler_task_id" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "game_player_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traveler_tasks_game_id_key" ON "traveler_tasks"("game_id");

-- CreateIndex
CREATE INDEX "traveler_tasks_skill_id_tier_idx" ON "traveler_tasks"("skill_id", "tier");

-- CreateIndex
CREATE INDEX "traveler_task_inputs_traveler_task_id_idx" ON "traveler_task_inputs"("traveler_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_player_tasks_game_player_id_traveler_task_id_key" ON "game_player_tasks"("game_player_id", "traveler_task_id");

-- AddForeignKey
ALTER TABLE "traveler_tasks" ADD CONSTRAINT "traveler_tasks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_task_inputs" ADD CONSTRAINT "traveler_task_inputs_traveler_task_id_fkey" FOREIGN KEY ("traveler_task_id") REFERENCES "traveler_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_task_inputs" ADD CONSTRAINT "traveler_task_inputs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_player_tasks" ADD CONSTRAINT "game_player_tasks_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_player_tasks" ADD CONSTRAINT "game_player_tasks_traveler_task_id_fkey" FOREIGN KEY ("traveler_task_id") REFERENCES "traveler_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
