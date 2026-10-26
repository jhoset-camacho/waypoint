-- Disposable capability fixture, never a production migration.
CREATE TABLE public.harness_probe (id integer PRIMARY KEY, owner_id uuid, label text NOT NULL);
CREATE INDEX harness_probe_owner_idx ON public.harness_probe(owner_id);
ALTER TABLE public.harness_probe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.harness_probe FROM anon, authenticated;
GRANT SELECT ON public.harness_probe TO anon, authenticated;
GRANT INSERT ON public.harness_probe TO authenticated;
CREATE POLICY probe_read ON public.harness_probe FOR SELECT TO anon, authenticated
  USING (owner_id IS NULL OR owner_id = (SELECT auth.uid()));
CREATE POLICY probe_insert ON public.harness_probe FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
INSERT INTO public.harness_probe VALUES (0, NULL, 'public');
