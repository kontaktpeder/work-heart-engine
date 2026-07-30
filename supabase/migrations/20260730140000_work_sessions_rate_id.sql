-- Persist selected rate on active work session so it survives refresh / navigation
ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS rate_id UUID REFERENCES public.rates(id) ON DELETE SET NULL;
