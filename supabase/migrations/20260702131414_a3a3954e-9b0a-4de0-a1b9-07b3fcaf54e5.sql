CREATE TABLE public.org_integration_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  finance_base_url text NOT NULL DEFAULT 'https://financecore.lovable.app',
  finance_api_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.org_integration_secrets TO service_role;
ALTER TABLE public.org_integration_secrets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER t_org_integration_secrets_updated
  BEFORE UPDATE ON public.org_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.finance_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  finance_entry_id uuid,
  status text NOT NULL CHECK (status IN ('success', 'skipped', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, time_entry_id)
);
GRANT ALL ON public.finance_export_log TO service_role;
ALTER TABLE public.finance_export_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS finance_entry_id uuid;
CREATE INDEX IF NOT EXISTS idx_time_entries_finance_entry_id ON public.time_entries(finance_entry_id);