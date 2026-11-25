-- Cadastros com nick que falharam: contam no limite de contas novas por IP por
-- dia (decidido em 25/11/2026). Só acrescenta; pode ir em qualquer release.

-- CreateTable
CREATE TABLE "signup_nick_failures" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_nick_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signup_nick_failures_ip_created_at_idx" ON "signup_nick_failures"("ip", "created_at");

