
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.time_entry_source AS ENUM ('manual', 'timer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  hourly_rate NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view projects" ON public.projects FOR SELECT
  TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Editors+ can insert projects" ON public.projects FOR INSERT
  TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role]));
CREATE POLICY "Editors+ can update projects" ON public.projects FOR UPDATE
  TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role]));
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE
  TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner'::org_role,'admin'::org_role]));

CREATE TRIGGER touch_projects BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX projects_org_active_idx ON public.projects(organization_id, is_active);

-- 3. Extend time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS total_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS source public.time_entry_source NOT NULL DEFAULT 'manual';

-- Make started_at/ended_at nullable so trigger can fill them when only date+times provided
ALTER TABLE public.time_entries ALTER COLUMN started_at DROP NOT NULL;
ALTER TABLE public.time_entries ALTER COLUMN ended_at DROP NOT NULL;

-- 4. Extend work_sessions
ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- 5. Trigger: compute time entry fields
CREATE OR REPLACE FUNCTION public.compute_time_entry_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_rate NUMERIC(10,2);
  v_minutes INTEGER;
BEGIN
  -- If date+times provided, build timestamps in Europe/Oslo
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
    -- Backfill date/times from timestamps using Europe/Oslo
    NEW.date := (NEW.started_at AT TIME ZONE 'Europe/Oslo')::DATE;
    NEW.start_time := (NEW.started_at AT TIME ZONE 'Europe/Oslo')::TIME;
    NEW.end_time := (NEW.ended_at AT TIME ZONE 'Europe/Oslo')::TIME;
  END IF;

  -- Total minutes
  IF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    v_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))/60)::INTEGER - COALESCE(NEW.break_minutes,0));
    NEW.total_minutes := v_minutes;
  END IF;

  -- Resolve hourly rate from project if not given
  IF NEW.hourly_rate IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT p.hourly_rate INTO v_rate FROM public.projects p WHERE p.id = NEW.project_id;
    -- Only auto-apply on INSERT to avoid surprising overwrites on update
    IF TG_OP = 'INSERT' THEN
      NEW.hourly_rate := v_rate;
    END IF;
  END IF;

  -- Amount
  IF NEW.hourly_rate IS NOT NULL AND NEW.total_minutes IS NOT NULL THEN
    NEW.amount := ROUND((NEW.total_minutes::NUMERIC / 60.0) * NEW.hourly_rate, 2);
  ELSE
    NEW.amount := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS compute_time_entry_fields_trg ON public.time_entries;
CREATE TRIGGER compute_time_entry_fields_trg
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.compute_time_entry_fields();

-- 6. Backfill existing rows: trigger fields by no-op update
UPDATE public.time_entries SET break_minutes = break_minutes;

-- 7. Migrate work_types -> projects per org
INSERT INTO public.projects (organization_id, name, hourly_rate, is_active)
SELECT wt.organization_id, wt.name,
  CASE
    WHEN wt.name ILIKE 'Event%' THEN 210
    WHEN wt.name ILIKE 'Kjøring%' OR wt.name ILIKE 'Rigg%' THEN 180
    ELSE NULL
  END,
  true
FROM public.work_types wt
ON CONFLICT (organization_id, name) DO NOTHING;

-- 8. Link existing time_entries.project_id from work_type_id when null
UPDATE public.time_entries te
SET project_id = p.id
FROM public.work_types wt
JOIN public.projects p
  ON p.organization_id = wt.organization_id AND p.name = wt.name
WHERE te.work_type_id = wt.id AND te.project_id IS NULL;

-- 9. FK on time_entries.project_id (drop if exists then add)
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_project_id_fkey;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- 10. Ensure every org has a default project
INSERT INTO public.projects (organization_id, name, is_active)
SELECT o.id, 'Generelt', true
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.organization_id = o.id)
ON CONFLICT DO NOTHING;

-- 11. Update handle_new_user to seed a default project instead of work_types
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END $$;
