-- AlterTable
ALTER TABLE "inventory_containers" ADD COLUMN     "building_id" INTEGER;

-- CreateTable
CREATE TABLE "buildings" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "interact_permission" TEXT NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_building_choices" (
    "user_id" INTEGER NOT NULL,
    "building_id" INTEGER NOT NULL,
    "counted" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "claim_building_choices_pkey" PRIMARY KEY ("user_id","building_id")
);

-- AddForeignKey
ALTER TABLE "claim_building_choices" ADD CONSTRAINT "claim_building_choices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_building_choices" ADD CONSTRAINT "claim_building_choices_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
