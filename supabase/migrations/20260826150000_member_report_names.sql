-- Per-member employee/manager names for reports (editors cannot update org rows).

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS report_employee_name TEXT,
  ADD COLUMN IF NOT EXISTS report_manager_name TEXT;

-- Keep the owner's existing org-level names so current exports stay filled.
UPDATE public.organization_members m
SET
  report_employee_name = COALESCE(
    m.report_employee_name,
    NULLIF(btrim(o.report_employee_name), '')
  ),
  report_manager_name = COALESCE(
    m.report_manager_name,
    NULLIF(btrim(o.report_manager_name), '')
  )
FROM public.organizations o
WHERE m.organization_id = o.id
  AND m.user_id = o.owner_id;

CREATE OR REPLACE FUNCTION public.update_my_report_names(
  _org_id UUID,
  _employee_name TEXT,
  _manager_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_employee TEXT := NULLIF(btrim(COALESCE(_employee_name, '')), '');
  cleaned_manager TEXT := NULLIF(btrim(COALESCE(_manager_name, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.organization_members
  SET
    report_employee_name = cleaned_employee,
    report_manager_name = cleaned_manager
  WHERE organization_id = _org_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No membership in this organization';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_report_names(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_report_names(UUID, TEXT, TEXT) TO authenticated;
