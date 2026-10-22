BEGIN;
-- CreateTable
CREATE TABLE "NoticeHistory" (
    "id" TEXT NOT NULL,
    "sourceAuthority" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "currentHash" TEXT NOT NULL DEFAULT '',
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeRevision" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observationSource" TEXT NOT NULL,

    CONSTRAINT "NoticeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRecallCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stockKey" TEXT NOT NULL,
    "noticeHistoryId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "affectedQuantity" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRecallCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseObservation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stockRowId" TEXT NOT NULL,
    "noticeHistoryId" TEXT NOT NULL,
    "noticeRevisionId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "matchKind" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "stockEvidence" TEXT NOT NULL,
    "observedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCaseObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeHistory_sourceAuthority_externalId_key" ON "NoticeHistory"("sourceAuthority", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeRevision_historyId_number_key" ON "NoticeRevision"("historyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeRevision_id_historyId_key" ON "NoticeRevision"("id", "historyId");

-- CreateIndex
CREATE INDEX "BusinessRecallCase_organizationId_updatedAt_idx" ON "BusinessRecallCase"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "BusinessRecallCase_locationId_organizationId_idx" ON "BusinessRecallCase"("locationId", "organizationId");

-- CreateIndex
CREATE INDEX "BusinessRecallCase_noticeHistoryId_idx" ON "BusinessRecallCase"("noticeHistoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecallCase_scope_key" ON "BusinessRecallCase"("organizationId", "locationId", "stockKey", "noticeHistoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecallCase_id_organizationId_key" ON "BusinessRecallCase"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecallCase_evidence_scope_key" ON "BusinessRecallCase"("id", "locationId", "organizationId", "noticeHistoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseObservation_caseId_sequence_key" ON "BusinessCaseObservation"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "BusinessCaseObservation_stockRowId_locationId_organizationI_idx" ON "BusinessCaseObservation"("stockRowId", "locationId", "organizationId");

-- CreateIndex
CREATE INDEX "BusinessCaseObservation_noticeRevisionId_noticeHistoryId_idx" ON "BusinessCaseObservation"("noticeRevisionId", "noticeHistoryId");

-- CreateIndex
CREATE INDEX "BusinessCaseObservation_scope_idx" ON "BusinessCaseObservation"("caseId", "locationId", "organizationId", "noticeHistoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseObservation_dedupe_key" ON "BusinessCaseObservation"("caseId", "stockRowId", "noticeRevisionId", "algorithmVersion");

-- CreateIndex
CREATE INDEX "BusinessCaseEvent_caseId_organizationId_idx" ON "BusinessCaseEvent"("caseId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCaseEvent_caseId_version_key" ON "BusinessCaseEvent"("caseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStockRow_id_locationId_organizationId_key" ON "InventoryStockRow"("id", "locationId", "organizationId");

-- AddForeignKey
ALTER TABLE "NoticeRevision" ADD CONSTRAINT "NoticeRevision_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "NoticeHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecallCase" ADD CONSTRAINT "BusinessRecallCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecallCase" ADD CONSTRAINT "BusinessRecallCase_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "BusinessLocation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecallCase" ADD CONSTRAINT "BusinessRecallCase_noticeHistoryId_fkey" FOREIGN KEY ("noticeHistoryId") REFERENCES "NoticeHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseObservation" ADD CONSTRAINT "BusinessCaseObservation_caseId_locationId_organizationId_n_fkey" FOREIGN KEY ("caseId", "locationId", "organizationId", "noticeHistoryId") REFERENCES "BusinessRecallCase"("id", "locationId", "organizationId", "noticeHistoryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseObservation" ADD CONSTRAINT "BusinessCaseObservation_stockRowId_locationId_organization_fkey" FOREIGN KEY ("stockRowId", "locationId", "organizationId") REFERENCES "InventoryStockRow"("id", "locationId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseObservation" ADD CONSTRAINT "BusinessCaseObservation_noticeRevisionId_noticeHistoryId_fkey" FOREIGN KEY ("noticeRevisionId", "noticeHistoryId") REFERENCES "NoticeRevision"("id", "historyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCaseEvent" ADD CONSTRAINT "BusinessCaseEvent_caseId_organizationId_fkey" FOREIGN KEY ("caseId", "organizationId") REFERENCES "BusinessRecallCase"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing household and catalog records are untouched.
ALTER TABLE "BusinessRecallCase" ADD CONSTRAINT "BusinessRecallCase_status_check"
  CHECK ("status" IN ('NEEDS_REVIEW','CONFIRMED_AFFECTED','NOT_AFFECTED'));
ALTER TABLE "BusinessRecallCase" ADD CONSTRAINT "BusinessRecallCase_quantity_check"
  CHECK (("status" = 'CONFIRMED_AFFECTED' AND "affectedQuantity" IS NOT NULL AND "affectedQuantity" > 0) OR ("status" <> 'CONFIRMED_AFFECTED' AND "affectedQuantity" IS NULL));
CREATE FUNCTION public.prevent_saved_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Saved evidence and activity records are append-only';
END;
$$;
CREATE TRIGGER "NoticeRevision_immutable" BEFORE UPDATE OR DELETE ON "NoticeRevision"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_saved_evidence_mutation();
CREATE TRIGGER "BusinessCaseObservation_immutable" BEFORE UPDATE OR DELETE ON "BusinessCaseObservation"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_saved_evidence_mutation();
CREATE TRIGGER "BusinessCaseEvent_immutable" BEFORE UPDATE OR DELETE ON "BusinessCaseEvent"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_saved_evidence_mutation();
REVOKE ALL ON FUNCTION public.prevent_saved_evidence_mutation() FROM PUBLIC;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['NoticeHistory','NoticeRevision','BusinessRecallCase','BusinessCaseObservation','BusinessCaseEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', table_name); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated', table_name); END IF;
  END LOOP;
END $$;
COMMIT;

