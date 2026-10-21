-- Additive inventory snapshots; household/purchase tables are unchanged.
BEGIN;
ALTER TABLE "BusinessLocation" ADD COLUMN "currentSnapshotId" TEXT;
CREATE TABLE "InventoryImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "appliedHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "payload" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "InventoryImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "InventorySnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "inventoryAsOf" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "InventoryStockRow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "stockKey" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantityOnHand" INTEGER NOT NULL CHECK ("quantityOnHand" >= 0),
  "brand" TEXT NOT NULL DEFAULT '',
  "gtin" TEXT NOT NULL DEFAULT '',
  "manufacturer" TEXT NOT NULL DEFAULT '',
  "modelNumber" TEXT NOT NULL DEFAULT '',
  "lotNumber" TEXT NOT NULL DEFAULT '',
  "serialNumber" TEXT NOT NULL DEFAULT '',
  "productionDate" TEXT NOT NULL DEFAULT '',
  "supplier" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX "InventoryImport_organizationId_createdById_contentHash_idx" ON "InventoryImport"("organizationId", "createdById", "contentHash");
CREATE INDEX "InventoryImport_organizationId_createdAt_idx" ON "InventoryImport"("organizationId", "createdAt");
CREATE UNIQUE INDEX "InventoryImport_organizationId_appliedHash_key" ON "InventoryImport"("organizationId", "appliedHash");
CREATE UNIQUE INDEX "InventoryImport_id_organizationId_key" ON "InventoryImport"("id", "organizationId");
CREATE INDEX "InventorySnapshot_locationId_organizationId_idx" ON "InventorySnapshot"("locationId", "organizationId");
CREATE INDEX "InventorySnapshot_importId_organizationId_idx" ON "InventorySnapshot"("importId", "organizationId");
CREATE UNIQUE INDEX "InventorySnapshot_id_locationId_organizationId_key" ON "InventorySnapshot"("id", "locationId", "organizationId");
CREATE INDEX "InventoryStockRow_organizationId_locationId_idx" ON "InventoryStockRow"("organizationId", "locationId");
CREATE INDEX "InventoryStockRow_snapshotId_locationId_organizationId_idx" ON "InventoryStockRow"("snapshotId", "locationId", "organizationId");
CREATE UNIQUE INDEX "InventoryStockRow_snapshotId_stockKey_key" ON "InventoryStockRow"("snapshotId", "stockKey");
CREATE UNIQUE INDEX "BusinessLocation_currentSnapshotId_key" ON "BusinessLocation"("currentSnapshotId");
CREATE UNIQUE INDEX "BusinessLocation_id_organizationId_key" ON "BusinessLocation"("id", "organizationId");
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_currentSnapshotId_fkey" FOREIGN KEY ("currentSnapshotId") REFERENCES "InventorySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "BusinessLocation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_importId_organizationId_fkey" FOREIGN KEY ("importId", "organizationId") REFERENCES "InventoryImport"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStockRow" ADD CONSTRAINT "InventoryStockRow_snapshotId_locationId_organizationId_fkey" FOREIGN KEY ("snapshotId", "locationId", "organizationId") REFERENCES "InventorySnapshot"("id", "locationId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['InventoryImport', 'InventorySnapshot', 'InventoryStockRow'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', table_name); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated', table_name); END IF;
  END LOOP;
END $$;
COMMIT;
