-- Timeline marks during / after a work session (employer documentation)
CREATE TABLE public.time_entry_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_session_id UUID REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  time_entry_id UUID REFERENCES public.time_entries(id) ON DELETE CASCADE,
  marked_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_entry_marks_has_parent CHECK (
    work_session_id IS NOT NULL OR time_entry_id IS NOT NULL
  )
);

CREATE INDEX time_entry_marks_session_idx
  ON public.time_entry_marks(work_session_id, marked_at ASC);
CREATE INDEX time_entry_marks_entry_idx
  ON public.time_entry_marks(time_entry_id, marked_at ASC);
CREATE INDEX time_entry_marks_org_idx
  ON public.time_entry_marks(organization_id, marked_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entry_marks TO authenticated;
GRANT ALL ON public.time_entry_marks TO service_role;

ALTER TABLE public.time_entry_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own marks" ON public.time_entry_marks
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER touch_time_entry_marks BEFORE UPDATE ON public.time_entry_marks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
