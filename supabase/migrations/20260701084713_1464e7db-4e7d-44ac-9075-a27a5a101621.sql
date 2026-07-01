
-- 1) rates table
CREATE TABLE public.rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NOK',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rates TO authenticated;
GRANT ALL ON public.rates TO service_role;

ALTER TABLE public.rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view rates" ON public.rates
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Editors+ can insert rates" ON public.rates
  FOR INSERT WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role]));
CREATE POLICY "Editors+ can update rates" ON public.rates
  FOR UPDATE USING (public.has_org_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role]));
CREATE POLICY "Admins can delete rates" ON public.rates
  FOR DELETE USING (public.has_org_role(organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE TRIGGER rates_touch_updated_at BEFORE UPDATE ON public.rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) time_entries: rate_id + snapshot
ALTER TABLE public.time_entries
  ADD COLUMN rate_id UUID REFERENCES public.rates(id) ON DELETE SET NULL,
  ADD COLUMN hourly_rate_snapshot NUMERIC(10,2);

-- Backfill snapshot from legacy hourly_rate
UPDATE public.time_entries
SET hourly_rate_snapshot = hourly_rate
WHERE hourly_rate_snapshot IS NULL AND hourly_rate IS NOT NULL;

-- 3) Updated compute trigger — resolves snapshot from rate, not projects
CREATE OR REPLACE FUNCTION public.compute_time_entry_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_rate_amount NUMERIC(10,2);
  v_minutes INTEGER;
  v_rate_changed BOOLEAN;
BEGIN
  IF NEW.date IS NOT NULL AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    v_start := (NEW.date::TEXT || ' ' || NEW.start_time::TEXT)::TIMESTAMP AT TIME ZONE 'Europe/Oslo';
    IF NEW.end_time <= NEW.start_time THEN
      v_end := ((NEW.date + 1)::TEXT || ' ' || NEW.end_time::TEXT)::TIMESTAMP AT TIME ZONE 'Europe/Oslo';
    ELSE
      v_end := (NEW.date::TEXT || ' ' || NEW.end_time::TEXT)::TIMESTAMP AT TIME ZONE 'Europe/Oslo';
    END IF;
    NEW.started_at := v_start;
    NEW.ended_at := v_end;
  ELSIF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.date := (NEW.started_at AT TIME ZONE 'Europe/Oslo')::DATE;
    NEW.start_time := (NEW.started_at AT TIME ZONE 'Europe/Oslo')::TIME;
    NEW.end_time := (NEW.ended_at AT TIME ZONE 'Europe/Oslo')::TIME;
  END IF;

  IF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    v_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))/60)::INTEGER - COALESCE(NEW.break_minutes,0));
    NEW.total_minutes := v_minutes;
  END IF;

  -- Snapshot from rate: on INSERT always freeze, on UPDATE only when rate_id changes
  IF NEW.rate_id IS NOT NULL THEN
    v_rate_changed := TG_OP = 'INSERT' OR NEW.rate_id IS DISTINCT FROM OLD.rate_id;
    IF v_rate_changed OR NEW.hourly_rate_snapshot IS NULL THEN
      SELECT r.amount INTO v_rate_amount FROM public.rates r WHERE r.id = NEW.rate_id;
      NEW.hourly_rate_snapshot := v_rate_amount;
    END IF;
  END IF;

  -- Keep legacy hourly_rate in sync with snapshot for read compatibility
  IF NEW.hourly_rate_snapshot IS NOT NULL THEN
    NEW.hourly_rate := NEW.hourly_rate_snapshot;
  END IF;

  -- Amount
  IF NEW.hourly_rate_snapshot IS NOT NULL AND NEW.total_minutes IS NOT NULL THEN
    NEW.amount := ROUND((NEW.total_minutes::NUMERIC / 60.0) * NEW.hourly_rate_snapshot, 2);
  ELSIF NEW.hourly_rate IS NOT NULL AND NEW.total_minutes IS NOT NULL THEN
    NEW.amount := ROUND((NEW.total_minutes::NUMERIC / 60.0) * NEW.hourly_rate, 2);
  ELSE
    NEW.amount := NULL;
  END IF;

  RETURN NEW;
END $function$;

-- Ensure trigger is attached (safe if already exists)
DROP TRIGGER IF EXISTS compute_time_entry_fields ON public.time_entries;
CREATE TRIGGER compute_time_entry_fields
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.compute_time_entry_fields();

-- 4) Seed default rates for existing orgs
INSERT INTO public.rates (organization_id, name, amount)
SELECT o.id, r.name, r.amount
FROM public.organizations o
CROSS JOIN (VALUES
  ('Ordinær', 210),
  ('Rigging', 180),
  ('Kveld', 210),
  ('Natt', 210),
  ('Søndag', 210),
  ('Overtid', 210),
  ('Reise', 180)
) AS r(name, amount)
ON CONFLICT (organization_id, name) DO NOTHING;

-- 5) Extend handle_new_user to seed default rates for new orgs
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  display_name TEXT;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Min organisasjon'
  );

  INSERT INTO public.organizations (name, owner_id)
  VALUES (display_name || ' (personlig)', NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  INSERT INTO public.projects (organization_id, name, is_active)
  VALUES (new_org_id, 'Generelt', true);

  INSERT INTO public.rates (organization_id, name, amount) VALUES
    (new_org_id, 'Ordinær', 210),
    (new_org_id, 'Rigging', 180),
    (new_org_id, 'Kveld', 210),
    (new_org_id, 'Natt', 210),
    (new_org_id, 'Søndag', 210),
    (new_org_id, 'Overtid', 210),
    (new_org_id, 'Reise', 180);

  RETURN NEW;
END $function$;
