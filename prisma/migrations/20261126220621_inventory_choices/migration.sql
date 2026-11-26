-- "Usar apenas meu inventário" becomes a choice per character of the plan's people
-- (decided 26/11/2026). Whoever had it on keeps seeing only their own inventory:
-- the other people's characters, and the claims only they count, are left out.
ALTER TABLE "plan_user_settings"
ADD COLUMN     "excluded_game_player_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

WITH people AS (
  -- The plan's people other than the account: the owner, one-by-one shares and group shares
  SELECT s.plan_id, s.user_id AS account_id, u.id AS person_id, u.game_player_id
  FROM "plan_user_settings" s
  JOIN "users" u ON u.id <> s.user_id
  WHERE s.only_my_inventory
    AND (
      EXISTS (SELECT 1 FROM "plans" p WHERE p.id = s.plan_id AND p.created_by_id = u.id)
      OR EXISTS (SELECT 1 FROM "plan_shares" ps WHERE ps.plan_id = s.plan_id AND ps.user_id = u.id)
      OR EXISTS (
        SELECT 1 FROM "plan_group_shares" gs
        JOIN "group_members" gm ON gm.group_id = gs.group_id
        WHERE gs.plan_id = s.plan_id AND gm.user_id = u.id
      )
    )
)
UPDATE "plan_user_settings" s
SET "excluded_game_player_ids" = COALESCE((
      SELECT array_agg(DISTINCT p.game_player_id) FROM people p
      WHERE p.plan_id = s.plan_id AND p.account_id = s.user_id
        AND p.game_player_id IS NOT NULL
        AND p.game_player_id IS DISTINCT FROM (SELECT game_player_id FROM "users" WHERE id = s.user_id)
    ), ARRAY[]::INTEGER[]),
    "excluded_claim_ids" = ARRAY(
      SELECT DISTINCT c FROM unnest(s.excluded_claim_ids || COALESCE((
        SELECT array_agg(cc.claim_entity_id) FROM people p
        JOIN "counted_claims" cc ON cc.user_id = p.person_id
        WHERE p.plan_id = s.plan_id AND p.account_id = s.user_id
          AND cc.claim_entity_id NOT IN (
            SELECT claim_entity_id FROM "counted_claims" WHERE user_id = s.user_id
          )
      ), ARRAY[]::TEXT[])) AS c
    )
WHERE s.only_my_inventory;

ALTER TABLE "plan_user_settings" DROP COLUMN "only_my_inventory";

-- CreateTable
CREATE TABLE "task_inventory_settings" (
    "user_id" INTEGER NOT NULL,
    "without_mine" BOOLEAN NOT NULL DEFAULT false,
    "game_player_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "excluded_claim_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_inventory_settings_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "task_inventory_settings" ADD CONSTRAINT "task_inventory_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
