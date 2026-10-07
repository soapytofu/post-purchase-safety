-- Prisma creates this internal table outside application migrations. Supabase's
-- default public-schema grants must not expose it through browser-facing APIs.
-- Run after every deployment; the table owner can still manage migrations.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._prisma_migrations FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public._prisma_migrations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public._prisma_migrations FROM authenticated;
  END IF;
END $$;
