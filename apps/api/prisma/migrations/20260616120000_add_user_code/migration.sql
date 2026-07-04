-- AlterTable
ALTER TABLE "users" ADD COLUMN     "userCode" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "sequence_counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userCode_key" ON "users"("userCode");

-- CreateIndex
CREATE INDEX "users_userCode_idx" ON "users"("userCode");
