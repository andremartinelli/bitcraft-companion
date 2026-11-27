-- CreateEnum
CREATE TYPE "other_steps_mode" AS ENUM ('show', 'collapse', 'hide');

-- AlterTable
ALTER TABLE "plan_user_settings" ADD COLUMN     "other_steps" "other_steps_mode";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "other_steps" "other_steps_mode" NOT NULL DEFAULT 'show';

-- CreateTable
CREATE TABLE "user_professions" (
    "user_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,

    CONSTRAINT "user_professions_pkey" PRIMARY KEY ("user_id","skill_id")
);

-- AddForeignKey
ALTER TABLE "user_professions" ADD CONSTRAINT "user_professions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_professions" ADD CONSTRAINT "user_professions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
