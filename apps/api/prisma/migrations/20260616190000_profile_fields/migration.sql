-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountTitle" TEXT,
ADD COLUMN     "bank" TEXT,
ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "basicSalary" DECIMAL(12,2),
ADD COLUMN     "cnic" TEXT,
ADD COLUMN     "currentAddress" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "dateOfJoining" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "extraFields" JSONB,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "ibanNo" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "midName" TEXT,
ADD COLUMN     "otherAllowance" DECIMAL(12,2),
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "profileLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "punctualityAllowance" DECIMAL(12,2),
ADD COLUMN     "travellingAllowance" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "form_field_settings" (
    "id" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "fieldType" TEXT NOT NULL,
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT,
    "colSpan" TEXT NOT NULL DEFAULT 'third',
    "textareaRows" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_field_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_field_settings_formType_idx" ON "form_field_settings"("formType");

-- CreateIndex
CREATE UNIQUE INDEX "form_field_settings_formType_fieldKey_key" ON "form_field_settings"("formType", "fieldKey");
