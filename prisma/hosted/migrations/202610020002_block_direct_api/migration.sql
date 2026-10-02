-- All application data goes through the authorized Next.js server, never the browser Data API.
-- The server connects as the table owner; RLS is defense in depth for API roles, not server tenancy.
ALTER TABLE "AppUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Household" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecallMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Recall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AppUser", "Household", "Membership", "Purchase", "RecallMatch", "Recall", "SyncState" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AppUser", "Household", "Membership", "Purchase", "RecallMatch", "Recall", "SyncState" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AppUser", "Household", "Membership", "Purchase", "RecallMatch", "Recall", "SyncState" FROM authenticated;
  END IF;
END $$;
