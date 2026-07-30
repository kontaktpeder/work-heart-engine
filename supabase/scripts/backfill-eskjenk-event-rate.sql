-- Backfill: set Event @ 210 on all E-SKJENK time entries in period.
-- Run in Work Supabase SQL editor. Preview first, then UPDATE.

-- Ensure Event rate exists at 210
WITH org AS (
  SELECT id
  FROM public.organizations
  WHERE name ILIKE '%E-SKJENK%'
  ORDER BY created_at
  LIMIT 1
)
INSERT INTO public.rates (organization_id, name, amount, currency, is_active)
SELECT o.id, 'Event', 210, 'NOK', true
FROM org o
WHERE NOT EXISTS (
  SELECT 1 FROM public.rates r
  WHERE r.organization_id = o.id AND r.name ILIKE 'Event'
);

UPDATE public.rates r
SET amount = 210
FROM public.organizations o
WHERE o.name ILIKE '%E-SKJENK%'
  AND r.organization_id = o.id
  AND r.name ILIKE 'Event'
  AND r.amount IS DISTINCT FROM 210;

-- Preview
SELECT
  te.id,
  te.date,
  te.total_minutes,
  te.rate_id AS old_rate_id,
  te.amount AS old_amount,
  p.name AS project,
  ROUND((COALESCE(te.total_minutes, 0)::numeric / 60.0) * 210, 2) AS new_amount_expected
FROM public.time_entries te
JOIN public.organizations o ON o.id = te.organization_id
LEFT JOIN public.projects p ON p.id = te.project_id
WHERE o.name ILIKE '%E-SKJENK%'
  AND te.date BETWEEN '2026-07-06' AND '2026-08-28'
ORDER BY te.date, te.start_time;

-- Apply (trigger recomputes hourly_rate_snapshot + amount)
UPDATE public.time_entries te
SET
  rate_id = r.id,
  hourly_rate_snapshot = NULL
FROM public.organizations o
JOIN public.rates r
  ON r.organization_id = o.id
 AND r.name ILIKE 'Event'
WHERE te.organization_id = o.id
  AND o.name ILIKE '%E-SKJENK%'
  AND te.date BETWEEN '2026-07-06' AND '2026-08-28';

-- Verify
SELECT
  COUNT(*) AS entries,
  SUM(te.total_minutes) AS total_min,
  ROUND(SUM(te.total_minutes)::numeric / 60.0, 2) AS total_hours,
  SUM(te.amount) AS total_amount,
  COUNT(*) FILTER (WHERE te.rate_id IS NULL) AS missing_rate
FROM public.time_entries te
JOIN public.organizations o ON o.id = te.organization_id
WHERE o.name ILIKE '%E-SKJENK%'
  AND te.date BETWEEN '2026-07-06' AND '2026-08-28';
