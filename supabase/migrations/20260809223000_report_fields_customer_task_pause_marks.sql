-- Report header fields on organization
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS report_company_name TEXT,
  ADD COLUMN IF NOT EXISTS report_employee_name TEXT,
  ADD COLUMN IF NOT EXISTS report_manager_name TEXT;

-- Customer (fritekst) + task (oppgave) on sessions and entries
ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS customer TEXT,
  ADD COLUMN IF NOT EXISTS task TEXT;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS customer TEXT,
  ADD COLUMN IF NOT EXISTS task TEXT;

-- Mark kinds: note vs pause
ALTER TABLE public.time_entry_marks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS pause_minutes INTEGER;

ALTER TABLE public.time_entry_marks
  DROP CONSTRAINT IF EXISTS time_entry_marks_kind_check;

ALTER TABLE public.time_entry_marks
  ADD CONSTRAINT time_entry_marks_kind_check
  CHECK (kind IN ('note', 'pause'));

ALTER TABLE public.time_entry_marks
  DROP CONSTRAINT IF EXISTS time_entry_marks_pause_minutes_check;

ALTER TABLE public.time_entry_marks
  ADD CONSTRAINT time_entry_marks_pause_minutes_check
  CHECK (
    (kind = 'note' AND pause_minutes IS NULL)
    OR (kind = 'pause' AND pause_minutes IS NOT NULL AND pause_minutes > 0)
  );
