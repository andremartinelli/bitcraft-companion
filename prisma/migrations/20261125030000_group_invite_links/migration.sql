-- Convites por link: cada convite ganha um token secreto, e só aparece na
-- página Conta de uma conta que já tinha o e-mail ao convidar (user_id).

-- DropIndex
DROP INDEX "group_invites_email_idx";

-- AlterTable. Convites de antes do link ganham um token aleatório e ficam sem
-- conta (só pelo link): ligar pelo e-mail abriria a brecha que o link fecha.
ALTER TABLE "group_invites" ADD COLUMN     "token" VARCHAR(64),
ADD COLUMN     "user_id" INTEGER;
UPDATE "group_invites" SET "token" = replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "group_invites" ALTER COLUMN "token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_token_key" ON "group_invites"("token");

-- CreateIndex
CREATE INDEX "group_invites_user_id_idx" ON "group_invites"("user_id");

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
