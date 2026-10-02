-- Initial hosted database, generated from the canonical Prisma model.
CREATE TYPE "PurchaseSource" AS ENUM ('MANUAL', 'CSV', 'RECEIPT', 'DEMO');
CREATE TYPE "MatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');
CREATE TYPE "MatchStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'DISMISSED', 'RETURNED', 'DISCARDED');

CREATE TABLE "AppUser" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Household" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'My household',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Membership" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'OWNER'
);
CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "householdId" TEXT,
  "productName" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "retailer" TEXT NOT NULL,
  "purchaseDate" TIMESTAMP(3) NOT NULL,
  "upc" TEXT,
  "lotNumber" TEXT,
  "source" "PurchaseSource" NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Recall" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "externalId" TEXT NOT NULL,
  "sourceAuthority" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "upcs" TEXT NOT NULL DEFAULT '[]',
  "lotNumbers" TEXT NOT NULL DEFAULT '[]',
  "distributionStartDate" TIMESTAMP(3),
  "distributionEndDate" TIMESTAMP(3),
  "recallDate" TIMESTAMP(3) NOT NULL,
  "severity" TEXT,
  "recommendedAction" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "rawData" TEXT NOT NULL DEFAULT '{}',
  "isFixture" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "RecallMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseId" TEXT NOT NULL,
  "recallId" TEXT NOT NULL,
  "confidence" "MatchConfidence" NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "reasons" TEXT NOT NULL DEFAULT '[]',
  "status" "MatchStatus" NOT NULL DEFAULT 'UNREVIEWED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SyncState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
  "errorMessage" TEXT,
  "recordCount" INTEGER NOT NULL
);
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
CREATE INDEX "Purchase_upc_idx" ON "Purchase"("upc");
CREATE INDEX "Purchase_householdId_createdAt_idx" ON "Purchase"("householdId", "createdAt");
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");
CREATE INDEX "Membership_householdId_idx" ON "Membership"("householdId");
CREATE INDEX "Recall_recallDate_idx" ON "Recall"("recallDate");
CREATE UNIQUE INDEX "Recall_sourceAuthority_externalId_key" ON "Recall"("sourceAuthority", "externalId");
CREATE INDEX "RecallMatch_confidence_status_idx" ON "RecallMatch"("confidence", "status");
CREATE UNIQUE INDEX "RecallMatch_purchaseId_recallId_key" ON "RecallMatch"("purchaseId", "recallId");
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecallMatch" ADD CONSTRAINT "RecallMatch_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecallMatch" ADD CONSTRAINT "RecallMatch_recallId_fkey" FOREIGN KEY ("recallId") REFERENCES "Recall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
