-- Seed report-export test rows for a known org/user (no-op if they do not exist).
-- Idempotent: replaces previous comment='rapport-test' rows for that user.

DO $$
DECLARE
  v_org UUID := '339b0d71-8c13-47dc-9045-742ce844641b';
  v_user UUID := '170677b6-eb60-4924-ac31-79cef3265680';
  v_project UUID;
  v_rate UUID;
  v_entry UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE NOTICE 'Skip report-test seed: org missing';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    RAISE NOTICE 'Skip report-test seed: user missing';
    RETURN;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  SELECT v_org, v_user, 'editor'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org AND user_id = v_user
  );

  DELETE FROM public.time_entry_marks
  WHERE user_id = v_user
    AND organization_id = v_org
    AND time_entry_id IN (
      SELECT id FROM public.time_entries
      WHERE user_id = v_user AND organization_id = v_org AND comment = 'rapport-test'
    );

  DELETE FROM public.time_entries
  WHERE user_id = v_user
    AND organization_id = v_org
    AND comment = 'rapport-test';

  SELECT id INTO v_project
  FROM public.projects
  WHERE organization_id = v_org
  ORDER BY CASE WHEN name ILIKE 'rapport-test' THEN 0 ELSE 1 END, name
  LIMIT 1;

  IF v_project IS NULL THEN
    INSERT INTO public.projects (organization_id, name, code, is_active)
    VALUES (v_org, 'Rapport-test', 'RPT', true)
    RETURNING id INTO v_project;
  END IF;

  SELECT id INTO v_rate
  FROM public.rates
  WHERE organization_id = v_org AND is_active
  ORDER BY CASE WHEN name ILIKE 'ordinær' THEN 0 ELSE 1 END, name
  LIMIT 1;

  IF v_rate IS NULL THEN
    INSERT INTO public.rates (organization_id, name, amount, currency, is_active)
    VALUES (v_org, 'Ordinær', 210, 'NOK', true)
    RETURNING id INTO v_rate;
  END IF;

  INSERT INTO public.time_entries (
    user_id, organization_id, project_id, rate_id,
    date, start_time, end_time, break_minutes,
    customer, task, comment, source
  ) VALUES
    (v_user, v_org, v_project, v_rate, '2026-08-06', '08:00', '12:00', 0,
     'Eskjenk', 'Oppsett scene', 'rapport-test', 'manual'),
    (v_user, v_org, v_project, v_rate, '2026-08-07', '13:00', '17:30', 15,
     'Eskjenk', 'Lydsjekk', 'rapport-test', 'manual'),
    (v_user, v_org, v_project, v_rate, '2026-08-12', '09:00', '16:00', 30,
     'Festival', 'Rigging', 'rapport-test', 'manual'),
    (v_user, v_org, v_project, v_rate, '2026-08-18', '18:00', '23:00', 0,
     'Festival', 'Kveldsvakt', 'rapport-test', 'manual'),
    (v_user, v_org, v_project, v_rate, '2026-08-21', '10:00', '14:00', 0,
     'Kontor', 'Planlegging', 'rapport-test', 'manual'),
    (v_user, v_org, v_project, v_rate, '2026-08-25', '08:30', '15:00', 30,
     'Kontor', 'Rapport og avstemming', 'rapport-test', 'manual');

  SELECT id INTO v_entry
  FROM public.time_entries
  WHERE user_id = v_user AND organization_id = v_org AND date = '2026-08-12' AND comment = 'rapport-test'
  LIMIT 1;

  IF v_entry IS NOT NULL THEN
    INSERT INTO public.time_entry_marks (
      user_id, organization_id, time_entry_id, marked_at, kind, pause_minutes, note
    ) VALUES (
      v_user, v_org, v_entry,
      timestamptz '2026-08-12 11:30:00+02',
      'pause', 30, 'Lunsj'
    );
  END IF;
END $$;
