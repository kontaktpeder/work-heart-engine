-- Identity Core shadow users are created with a temporary email during SSO.
-- Skip auto personal-org seeding for those users; real orgs are remapped in app code.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  display_name TEXT;
  pending_email TEXT;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'identity_core', '') IN ('true', 't', '1') THEN
    RETURN NEW;
  END IF;

  pending_email := NULLIF(TRIM(NEW.raw_user_meta_data->>'pending_email'), '');

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(COALESCE(pending_email, NEW.email), '@', 1),
    'Min organisasjon'
  );

  INSERT INTO public.organizations (name, owner_id)
  VALUES (display_name || ' (personlig)', NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  INSERT INTO public.projects (organization_id, name, is_active)
  VALUES (new_org_id, 'Generelt', true);

  INSERT INTO public.rates (organization_id, name, amount) VALUES
    (new_org_id, 'Ordinær', 210),
    (new_org_id, 'Rigging', 180),
    (new_org_id, 'Kveld', 210),
    (new_org_id, 'Natt', 210),
    (new_org_id, 'Søndag', 210),
    (new_org_id, 'Overtid', 210),
    (new_org_id, 'Reise', 180);

  RETURN NEW;
END $function$;
