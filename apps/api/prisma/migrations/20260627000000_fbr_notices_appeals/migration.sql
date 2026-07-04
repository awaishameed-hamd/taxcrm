-- CreateEnum
CREATE TYPE "FbrEntryPoint" AS ENUM ('FRESH_NOTICE', 'FURTHER_NOTICE_ONLY', 'DIRECT_APPEAL', 'HEARING_ONLY');
CREATE TYPE "FbrCaseStage" AS ENUM ('NOTICE', 'APPEAL', 'STAY', 'HIGHER_FORUM', 'CLOSED');
CREATE TYPE "FbrSubmissionMethod" AS ENUM ('IRIS', 'MANUAL');
CREATE TYPE "FbrNoticeOutcome" AS ENUM ('PENDING', 'ACCEPTED', 'FURTHER_NOTICE', 'ORDER_AGAINST');
CREATE TYPE "FbrAppealType" AS ENUM ('CIR_APPEALS', 'ATIR', 'HIGH_COURT');
CREATE TYPE "FbrAppealOutcome" AS ENUM ('PENDING', 'IN_FAVOR', 'AGAINST', 'HIGHER_FORUM');
CREATE TYPE "FbrStayOutcome" AS ENUM ('PENDING', 'GRANTED', 'REJECTED');
CREATE TYPE "FbrHearingOutcome" AS ENUM ('PENDING', 'ADJOURNED', 'DECIDED');

-- CreateTable: fbr_cases
CREATE TABLE "fbr_cases" (
  "id"           TEXT NOT NULL,
  "caseNumber"   TEXT NOT NULL,
  "clientId"     TEXT NOT NULL,
  "entryPoint"   "FbrEntryPoint" NOT NULL,
  "currentStage" "FbrCaseStage" NOT NULL DEFAULT 'NOTICE',
  "taxType"      TEXT NOT NULL,
  "taxYear"      TEXT,
  "noticeNumber" TEXT,
  "description"  TEXT,
  "assignedToId" TEXT,
  "createdById"  TEXT NOT NULL,
  "closedAt"     TIMESTAMP(3),
  "closedReason" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fbr_cases_caseNumber_key" ON "fbr_cases"("caseNumber");
CREATE INDEX "fbr_cases_clientId_idx" ON "fbr_cases"("clientId");
CREATE INDEX "fbr_cases_currentStage_idx" ON "fbr_cases"("currentStage");

-- CreateTable: fbr_notice_rounds
CREATE TABLE "fbr_notice_rounds" (
  "id"                  TEXT NOT NULL,
  "caseId"              TEXT NOT NULL,
  "roundNumber"         INTEGER NOT NULL DEFAULT 1,
  "dueDate"             TIMESTAMP(3),
  "adjournmentApplied"  BOOLEAN NOT NULL DEFAULT false,
  "adjournmentDate"     TIMESTAMP(3),
  "docListCreatedAt"    TIMESTAMP(3),
  "docListApprovedAt"   TIMESTAMP(3),
  "docListApprovedById" TEXT,
  "draftPreparedAt"     TIMESTAMP(3),
  "internalReviewedAt"  TIMESTAMP(3),
  "internalReviewById"  TEXT,
  "partnerApprovedAt"   TIMESTAMP(3),
  "partnerApprovedById" TEXT,
  "submissionMethod"    "FbrSubmissionMethod",
  "submittedAt"         TIMESTAMP(3),
  "submissionRef"       TEXT,
  "outcome"             "FbrNoticeOutcome" NOT NULL DEFAULT 'PENDING',
  "orderDate"           TIMESTAMP(3),
  "challanPaid"         BOOLEAN NOT NULL DEFAULT false,
  "challanPaidAt"       TIMESTAMP(3),
  "challanRef"          TEXT,
  "notes"               TEXT,
  "closedAt"            TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_notice_rounds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fbr_notice_rounds_caseId_idx" ON "fbr_notice_rounds"("caseId");

-- CreateTable: fbr_appeals
CREATE TABLE "fbr_appeals" (
  "id"                  TEXT NOT NULL,
  "caseId"              TEXT NOT NULL,
  "appealType"          "FbrAppealType" NOT NULL DEFAULT 'CIR_APPEALS',
  "isLate"              BOOLEAN NOT NULL DEFAULT false,
  "condonationFiled"    BOOLEAN NOT NULL DEFAULT false,
  "feeChallanRef"       TEXT,
  "feePaidAt"           TIMESTAMP(3),
  "submissionMethod"    "FbrSubmissionMethod",
  "groundsPreparedAt"   TIMESTAMP(3),
  "internalReviewedAt"  TIMESTAMP(3),
  "internalReviewById"  TEXT,
  "partnerApprovedAt"   TIMESTAMP(3),
  "partnerApprovedById" TEXT,
  "submittedAt"         TIMESTAMP(3),
  "submissionRef"       TEXT,
  "outcome"             "FbrAppealOutcome" NOT NULL DEFAULT 'PENDING',
  "orderDate"           TIMESTAMP(3),
  "challanPaid"         BOOLEAN NOT NULL DEFAULT false,
  "challanPaidAt"       TIMESTAMP(3),
  "challanRef"          TEXT,
  "closedAt"            TIMESTAMP(3),
  "notes"               TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_appeals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fbr_appeals_caseId_key" ON "fbr_appeals"("caseId");

-- CreateTable: fbr_stay_applications
CREATE TABLE "fbr_stay_applications" (
  "id"               TEXT NOT NULL,
  "caseId"           TEXT NOT NULL,
  "triggeredAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason"           TEXT,
  "reviewedAt"       TIMESTAMP(3),
  "reviewedById"     TEXT,
  "submissionMethod" "FbrSubmissionMethod",
  "submittedAt"      TIMESTAMP(3),
  "submissionRef"    TEXT,
  "hearingDate"      TIMESTAMP(3),
  "outcome"          "FbrStayOutcome" NOT NULL DEFAULT 'PENDING',
  "decidedAt"        TIMESTAMP(3),
  "resumedAt"        TIMESTAMP(3),
  "resumedById"      TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_stay_applications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fbr_stay_applications_caseId_idx" ON "fbr_stay_applications"("caseId");

-- CreateTable: fbr_hearings
CREATE TABLE "fbr_hearings" (
  "id"            TEXT NOT NULL,
  "caseId"        TEXT NOT NULL,
  "appealId"      TEXT,
  "scheduledDate" TIMESTAMP(3) NOT NULL,
  "adjournedTo"   TIMESTAMP(3),
  "outcome"       "FbrHearingOutcome" NOT NULL DEFAULT 'PENDING',
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_hearings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fbr_hearings_caseId_idx" ON "fbr_hearings"("caseId");

-- CreateTable: fbr_attachments
CREATE TABLE "fbr_attachments" (
  "id"            TEXT NOT NULL,
  "noticeRoundId" TEXT,
  "appealId"      TEXT,
  "stayId"        TEXT,
  "label"         TEXT,
  "url"           TEXT NOT NULL,
  "fileType"      TEXT NOT NULL DEFAULT 'other',
  "uploadedById"  TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fbr_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fbr_attachments_noticeRoundId_idx" ON "fbr_attachments"("noticeRoundId");
CREATE INDEX "fbr_attachments_appealId_idx" ON "fbr_attachments"("appealId");
CREATE INDEX "fbr_attachments_stayId_idx" ON "fbr_attachments"("stayId");

-- AddForeignKeys
ALTER TABLE "fbr_cases" ADD CONSTRAINT "fbr_cases_clientId_fkey"    FOREIGN KEY ("clientId")    REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fbr_cases" ADD CONSTRAINT "fbr_cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fbr_cases" ADD CONSTRAINT "fbr_cases_createdById_fkey"  FOREIGN KEY ("createdById")  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fbr_notice_rounds" ADD CONSTRAINT "fbr_notice_rounds_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "fbr_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fbr_appeals" ADD CONSTRAINT "fbr_appeals_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "fbr_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fbr_stay_applications" ADD CONSTRAINT "fbr_stay_applications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "fbr_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fbr_hearings" ADD CONSTRAINT "fbr_hearings_caseId_fkey"   FOREIGN KEY ("caseId")   REFERENCES "fbr_cases"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fbr_hearings" ADD CONSTRAINT "fbr_hearings_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "fbr_appeals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fbr_attachments" ADD CONSTRAINT "fbr_attachments_noticeRoundId_fkey" FOREIGN KEY ("noticeRoundId") REFERENCES "fbr_notice_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fbr_attachments" ADD CONSTRAINT "fbr_attachments_appealId_fkey"      FOREIGN KEY ("appealId")      REFERENCES "fbr_appeals"("id")        ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fbr_attachments" ADD CONSTRAINT "fbr_attachments_stayId_fkey"        FOREIGN KEY ("stayId")        REFERENCES "fbr_stay_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fbr_attachments" ADD CONSTRAINT "fbr_attachments_uploadedById_fkey"  FOREIGN KEY ("uploadedById")  REFERENCES "users"("id")              ON DELETE RESTRICT ON UPDATE CASCADE;
