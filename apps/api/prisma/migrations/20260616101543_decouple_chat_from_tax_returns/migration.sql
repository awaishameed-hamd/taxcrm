-- DropIndex
DROP INDEX "conversations_taxReturnId_key";

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "taxReturnId" DROP NOT NULL;
