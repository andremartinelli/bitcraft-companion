-- CreateEnum
CREATE TYPE "item_kind" AS ENUM ('item', 'cargo');

-- CreateEnum
CREATE TYPE "recipe_kind" AS ENUM ('crafting', 'construction');

-- CreateEnum
CREATE TYPE "extraction_source" AS ENUM ('resource', 'enemy');

-- CreateEnum
CREATE TYPE "container_kind" AS ENUM ('personal', 'toolbelt', 'wallet', 'bank', 'stash', 'housing', 'claim', 'deployable', 'other');

-- CreateEnum
CREATE TYPE "entry_source" AS ENUM ('sync', 'manual');

-- CreateEnum
CREATE TYPE "sync_trigger" AS ENUM ('manual', 'auto', 'cron');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('running', 'ok', 'partial', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT,
    "email" VARCHAR(254) NOT NULL,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "ip" TEXT,
    "succeeded" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_data_imports" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "commit_sha" TEXT,
    "source_date" TIMESTAMPTZ(3),
    "counts" JSONB,
    "renamed" JSONB,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_graph_snapshots" (
    "import_id" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_graph_snapshots_pkey" PRIMARY KEY ("import_id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_types" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tool_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_types" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "building_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "kind" "item_kind" NOT NULL,
    "game_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" INTEGER NOT NULL,
    "tag" TEXT,
    "rarity" TEXT,
    "item_list_game_id" INTEGER,
    "item_list_id" INTEGER,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_lists" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_list_possibilities" (
    "id" SERIAL NOT NULL,
    "item_list_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "item_list_possibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_list_possibility_items" (
    "id" SERIAL NOT NULL,
    "possibility_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "item_list_possibility_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" SERIAL NOT NULL,
    "kind" "recipe_kind" NOT NULL,
    "game_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "actions_required" INTEGER NOT NULL,
    "time_per_action" DOUBLE PRECISION NOT NULL,
    "stamina_per_action" DOUBLE PRECISION NOT NULL,
    "skill_id" INTEGER,
    "skill_level" INTEGER,
    "tool_type_id" INTEGER,
    "tool_tier" INTEGER,
    "building_type_id" INTEGER,
    "building_tier" INTEGER,
    "is_passive" BOOLEAN NOT NULL DEFAULT false,
    "hidden_without_knowledge" BOOLEAN NOT NULL DEFAULT false,
    "shards" INTEGER NOT NULL DEFAULT 0,
    "paving_tier" INTEGER,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_inputs" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "recipe_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_outputs" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "recipe_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_techs" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" INTEGER NOT NULL,
    "tech_type" TEXT NOT NULL,
    "supplies_cost" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "claim_techs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_tech_inputs" (
    "id" SERIAL NOT NULL,
    "claim_tech_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "claim_tech_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_recipes" (
    "id" SERIAL NOT NULL,
    "source" "extraction_source" NOT NULL DEFAULT 'resource',
    "game_id" INTEGER NOT NULL,
    "verb" TEXT NOT NULL,
    "skill_id" INTEGER,
    "skill_level" INTEGER,
    "tool_type_id" INTEGER,
    "tool_tier" INTEGER,
    "removed_at" TIMESTAMPTZ(3),
    "last_import_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "extraction_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_recipe_outputs" (
    "id" SERIAL NOT NULL,
    "extraction_recipe_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "extraction_recipe_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "notes" TEXT,
    "use_inventory" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_items" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_buildings" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_choices" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "recipe_id" INTEGER,

    CONSTRAINT "plan_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_owned_items" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "plan_owned_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "region_id" INTEGER,
    "claims" JSONB,
    "user_id" INTEGER,
    "last_synced_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_containers" (
    "id" SERIAL NOT NULL,
    "kind" "container_kind" NOT NULL,
    "game_entity_id" TEXT NOT NULL,
    "game_player_id" INTEGER,
    "claim_entity_id" TEXT,
    "claim_name" TEXT,
    "name" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_entries" (
    "id" SERIAL NOT NULL,
    "container_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" "entry_source" NOT NULL DEFAULT 'sync',
    "synced_at" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" SERIAL NOT NULL,
    "trigger" "sync_trigger" NOT NULL,
    "source" TEXT NOT NULL,
    "status" "sync_status" NOT NULL,
    "message" TEXT,
    "counts" JSONB,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_item_list_id_idx" ON "items"("item_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_kind_game_id_key" ON "items"("kind", "game_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_lists_game_id_key" ON "item_lists"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_list_possibilities_item_list_id_position_key" ON "item_list_possibilities"("item_list_id", "position");

-- CreateIndex
CREATE INDEX "item_list_possibility_items_possibility_id_idx" ON "item_list_possibility_items"("possibility_id");

-- CreateIndex
CREATE INDEX "item_list_possibility_items_item_id_idx" ON "item_list_possibility_items"("item_id");

-- CreateIndex
CREATE INDEX "recipes_verb_idx" ON "recipes"("verb");

-- CreateIndex
CREATE INDEX "recipes_skill_id_idx" ON "recipes"("skill_id");

-- CreateIndex
CREATE INDEX "recipes_building_type_id_idx" ON "recipes"("building_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_kind_game_id_key" ON "recipes"("kind", "game_id");

-- CreateIndex
CREATE INDEX "recipe_inputs_recipe_id_idx" ON "recipe_inputs"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_inputs_item_id_idx" ON "recipe_inputs"("item_id");

-- CreateIndex
CREATE INDEX "recipe_outputs_recipe_id_idx" ON "recipe_outputs"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_outputs_item_id_idx" ON "recipe_outputs"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "claim_techs_game_id_key" ON "claim_techs"("game_id");

-- CreateIndex
CREATE INDEX "claim_techs_tech_type_tier_idx" ON "claim_techs"("tech_type", "tier");

-- CreateIndex
CREATE INDEX "claim_tech_inputs_claim_tech_id_idx" ON "claim_tech_inputs"("claim_tech_id");

-- CreateIndex
CREATE INDEX "extraction_recipes_skill_id_idx" ON "extraction_recipes"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_recipes_source_game_id_key" ON "extraction_recipes"("source", "game_id");

-- CreateIndex
CREATE INDEX "extraction_recipe_outputs_extraction_recipe_id_idx" ON "extraction_recipe_outputs"("extraction_recipe_id");

-- CreateIndex
CREATE INDEX "extraction_recipe_outputs_item_id_idx" ON "extraction_recipe_outputs"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_items_plan_id_item_id_key" ON "plan_items"("plan_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_buildings_plan_id_recipe_id_key" ON "plan_buildings"("plan_id", "recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_choices_plan_id_item_id_key" ON "plan_choices"("plan_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_owned_items_plan_id_item_id_key" ON "plan_owned_items"("plan_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_entity_id_key" ON "game_players"("entity_id");

-- CreateIndex
CREATE INDEX "inventory_containers_claim_entity_id_idx" ON "inventory_containers"("claim_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_containers_kind_game_entity_id_key" ON "inventory_containers"("kind", "game_entity_id");

-- CreateIndex
CREATE INDEX "inventory_entries_item_id_idx" ON "inventory_entries"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_entries_container_id_item_id_source_key" ON "inventory_entries"("container_id", "item_id", "source");

-- CreateIndex
CREATE INDEX "sync_runs_status_idx" ON "sync_runs"("status");

-- CreateIndex
CREATE INDEX "sync_runs_started_at_idx" ON "sync_runs"("started_at");

-- AddForeignKey
ALTER TABLE "recipe_graph_snapshots" ADD CONSTRAINT "recipe_graph_snapshots_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "game_data_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_item_list_id_fkey" FOREIGN KEY ("item_list_id") REFERENCES "item_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_list_possibilities" ADD CONSTRAINT "item_list_possibilities_item_list_id_fkey" FOREIGN KEY ("item_list_id") REFERENCES "item_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_list_possibility_items" ADD CONSTRAINT "item_list_possibility_items_possibility_id_fkey" FOREIGN KEY ("possibility_id") REFERENCES "item_list_possibilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_list_possibility_items" ADD CONSTRAINT "item_list_possibility_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_tool_type_id_fkey" FOREIGN KEY ("tool_type_id") REFERENCES "tool_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_building_type_id_fkey" FOREIGN KEY ("building_type_id") REFERENCES "building_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_inputs" ADD CONSTRAINT "recipe_inputs_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_inputs" ADD CONSTRAINT "recipe_inputs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_outputs" ADD CONSTRAINT "recipe_outputs_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_outputs" ADD CONSTRAINT "recipe_outputs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_tech_inputs" ADD CONSTRAINT "claim_tech_inputs_claim_tech_id_fkey" FOREIGN KEY ("claim_tech_id") REFERENCES "claim_techs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_tech_inputs" ADD CONSTRAINT "claim_tech_inputs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_recipes" ADD CONSTRAINT "extraction_recipes_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_recipes" ADD CONSTRAINT "extraction_recipes_tool_type_id_fkey" FOREIGN KEY ("tool_type_id") REFERENCES "tool_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_recipe_outputs" ADD CONSTRAINT "extraction_recipe_outputs_extraction_recipe_id_fkey" FOREIGN KEY ("extraction_recipe_id") REFERENCES "extraction_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_recipe_outputs" ADD CONSTRAINT "extraction_recipe_outputs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_buildings" ADD CONSTRAINT "plan_buildings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_buildings" ADD CONSTRAINT "plan_buildings_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_choices" ADD CONSTRAINT "plan_choices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_choices" ADD CONSTRAINT "plan_choices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_choices" ADD CONSTRAINT "plan_choices_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_owned_items" ADD CONSTRAINT "plan_owned_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_owned_items" ADD CONSTRAINT "plan_owned_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_containers" ADD CONSTRAINT "inventory_containers_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "inventory_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One inventory sync at a time, across every Vercel instance: a second
-- "running" row fails on this index (Prisma cannot declare partial indexes).
CREATE UNIQUE INDEX "sync_runs_one_running" ON "sync_runs" ("status") WHERE "status" = 'running';
