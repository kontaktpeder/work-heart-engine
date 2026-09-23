-- Production days and shift assignments.
-- A shift stores the assignee as a user id plus a name snapshot.
-- It does not reference organization_members, so removing a membership
-- leaves the historical row. Create and update still require an active member.

ALTER TYPE public.api_scope ADD VALUE IF NOT EXISTS 'schedule:read';
ALTER TYPE public.api_scope ADD VALUE IF NOT EXISTS 'schedule:write';

CREATE TABLE public.production_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 1440),
  comment TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX production_days_org_date_idx
  ON public.production_days (organization_id, event_date);

CREATE TABLE public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_day_id UUID NOT NULL REFERENCES public.production_days(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignee_user_id UUID NOT NULL,
  assignee_name TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 1440),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (production_day_id, assignee_user_id)
);

CREATE INDEX shift_assignments_org_user_idx
  ON public.shift_assignments (organization_id, assignee_user_id);

COMMENT ON TABLE public.shift_assignments IS
  'Planned shift for one person. assignee_user_id is not a foreign key to organization_members so history survives membership removal.';

CREATE OR REPLACE FUNCTION public.assert_shift_assignee_is_active_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day_org UUID;
  snapshot TEXT;
BEGIN
  SELECT organization_id INTO day_org
  FROM public.production_days
  WHERE id = NEW.production_day_id;

  IF day_org IS NULL THEN
    RAISE EXCEPTION 'production day not found';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM day_org THEN
    RAISE EXCEPTION 'shift organization does not match production day';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id
      AND user_id = NEW.assignee_user_id
  ) THEN
    RAISE EXCEPTION 'assignee is not an active member of the organization';
  END IF;

  IF NULLIF(btrim(COALESCE(NEW.assignee_name, '')), '') IS NULL THEN
    SELECT COALESCE(
      NULLIF(btrim(m.report_employee_name), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), '')
    )
    INTO snapshot
    FROM public.organization_members m
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.assignee_user_id;
    NEW.assignee_name := snapshot;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER shift_assignments_require_member
  BEFORE INSERT OR UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_shift_assignee_is_active_member();

CREATE TRIGGER touch_production_days
  BEFORE UPDATE ON public.production_days
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_shift_assignments
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_assignments TO authenticated;
GRANT ALL ON public.production_days TO service_role;
GRANT ALL ON public.shift_assignments TO service_role;

ALTER TABLE public.production_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders see all production days, assignees see their own"
  ON public.production_days
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[])
      OR EXISTS (
        SELECT 1
        FROM public.shift_assignments s
        WHERE s.production_day_id = production_days.id
          AND s.assignee_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Leaders manage production days"
  ON public.production_days
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Leaders update production days"
  ON public.production_days
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Leaders delete production days"
  ON public.production_days
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Leaders see all shifts, employees see their own"
  ON public.shift_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[])
      OR assignee_user_id = auth.uid()
    )
  );

CREATE POLICY "Leaders assign shifts"
  ON public.shift_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Leaders update shifts"
  ON public.shift_assignments
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Leaders delete shifts"
  ON public.shift_assignments
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

REVOKE ALL ON FUNCTION public.assert_shift_assignee_is_active_member() FROM PUBLIC, anon;
