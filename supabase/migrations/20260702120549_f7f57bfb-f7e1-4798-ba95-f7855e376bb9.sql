DROP POLICY "Admins+ revoke api_keys" ON public.api_keys;

CREATE POLICY "Admins+ revoke api_keys"
  ON public.api_keys FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_keys.api_client_id
      AND public.has_org_role(c.organization_id, ARRAY['owner','admin']::public.org_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_keys.api_client_id
      AND public.has_org_role(c.organization_id, ARRAY['owner','admin']::public.org_role[])
  ));