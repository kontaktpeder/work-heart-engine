
-- Drop policies that reference the old function signatures
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members can view members of their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;
DROP POLICY IF EXISTS "Members can view work types" ON public.work_types;
DROP POLICY IF EXISTS "Editors+ can insert work types" ON public.work_types;
DROP POLICY IF EXISTS "Editors+ can update work types" ON public.work_types;
DROP POLICY IF EXISTS "Admins can delete work types" ON public.work_types;

DROP FUNCTION IF EXISTS public.is_org_member(UUID, UUID);
DROP FUNCTION IF EXISTS public.has_org_role(UUID, UUID, public.org_role[]);

-- Recreate without the _user_id parameter: implicit auth.uid()
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id UUID, _roles public.org_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(UUID, public.org_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, public.org_role[]) TO authenticated;

-- Recreate policies
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "Owners and admins can update organizations" ON public.organizations
  FOR UPDATE TO authenticated USING (public.has_org_role(id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Members can view members of their organizations" ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Owners and admins can add members" ON public.organization_members
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners and admins can update members" ON public.organization_members
  FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners and admins can remove members" ON public.organization_members
  FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Members can view work types" ON public.work_types
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Editors+ can insert work types" ON public.work_types
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Editors+ can update work types" ON public.work_types
  FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Admins can delete work types" ON public.work_types
  FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]));
