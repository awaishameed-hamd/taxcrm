-- Add noticeSection to fbr_cases
ALTER TABLE "fbr_cases" ADD COLUMN "noticeSection" TEXT;

-- Create fbr_notice_sections table
CREATE TABLE "fbr_notice_sections" (
  "id"        TEXT NOT NULL,
  "taxType"   TEXT NOT NULL,
  "section"   TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fbr_notice_sections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fbr_notice_sections_taxType_idx" ON "fbr_notice_sections"("taxType");
CREATE UNIQUE INDEX "fbr_notice_sections_taxType_section_key" ON "fbr_notice_sections"("taxType", "section");

-- Seed: Sales Tax Notices
INSERT INTO "fbr_notice_sections" ("id","taxType","section","sortOrder") VALUES
('sns01','SALES_TAX','U/S 11E',1),
('sns02','SALES_TAX','U/S 11F',2),
('sns03','SALES_TAX','U/S 25',3),
('sns04','SALES_TAX','U/S 14',4),
('sns05','SALES_TAX','U/S 38(A)',5),
('sns06','SALES_TAX','U/S 26(2A)',6),
('sns07','SALES_TAX','U/S 3(9A)',7),
('sns08','SALES_TAX','U/S 33',8),
('sns09','SALES_TAX','U/S 34',9),
('sns10','SALES_TAX','RULE 150Z',10);

-- Seed: Withholding Tax Notices
INSERT INTO "fbr_notice_sections" ("id","taxType","section","sortOrder") VALUES
('wht01','WHT','RULE 44',1),
('wht02','WHT','U/S 161',2);

-- Seed: Income Tax Notices
INSERT INTO "fbr_notice_sections" ("id","taxType","section","sortOrder") VALUES
('int01','INCOME_TAX','U/S 122(9)',1),
('int02','INCOME_TAX','U/S 122(5A)',2),
('int03','INCOME_TAX','U/S 111',3),
('int04','INCOME_TAX','U/S 114(4)',4),
('int05','INCOME_TAX','U/S 177',5),
('int06','INCOME_TAX','U/S 174',6),
('int07','INCOME_TAX','U/S 176',7),
('int08','INCOME_TAX','U/S 179',8),
('int09','INCOME_TAX','U/S 147',9),
('int10','INCOME_TAX','U/S 182/205',10),
('int11','INCOME_TAX','U/S 137',11),
('int12','INCOME_TAX','U/S 138',12),
('int13','INCOME_TAX','U/S 4C',13),
('int14','INCOME_TAX','U/S 221',14);
