CREATE TYPE public.api_scope AS ENUM (
  'time:read',
  'time:write',
  'reports:read',
  'platform:read',
  'platform:verify'
);

CREATE TABLE public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  allowed_scopes public.api_scope[] NOT NULL DEFAULT ARRAY['time:read']::public.api_scope[],
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX idx_api_clients_org ON public.api_clients(organization_id);

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX idx_api_keys_client ON public.api_keys(api_client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins+ view api_clients"
  ON public.api_clients FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Admins+ create api_clients"
  ON public.api_clients FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[])
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins+ update api_clients"
  ON public.api_clients FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Owners delete api_clients"
  ON public.api_clients FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner']::public.org_role[]));

CREATE POLICY "Admins+ view api_keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_keys.api_client_id
      AND public.has_org_role(c.organization_id, ARRAY['owner','admin']::public.org_role[])
  ));

CREATE POLICY "Admins+ revoke api_keys"
  ON public.api_keys FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_keys.api_client_id
      AND public.has_org_role(c.organization_id, ARRAY['owner','admin']::public.org_role[])
  ))
  WITH CHECK (true);