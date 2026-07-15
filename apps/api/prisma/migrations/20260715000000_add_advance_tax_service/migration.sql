-- Add Quarterly Advance Tax service flag to client_profiles
ALTER TABLE "client_profiles" ADD COLUMN "hasAdvanceTaxService" BOOLEAN NOT NULL DEFAULT false;
