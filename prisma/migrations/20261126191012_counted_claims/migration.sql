-- CreateTable
CREATE TABLE "counted_claims" (
    "user_id" INTEGER NOT NULL,
    "claim_entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counted_claims_pkey" PRIMARY KEY ("user_id","claim_entity_id")
);

-- CreateIndex
CREATE INDEX "counted_claims_claim_entity_id_idx" ON "counted_claims"("claim_entity_id");

-- AddForeignKey
ALTER TABLE "counted_claims" ADD CONSTRAINT "counted_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
