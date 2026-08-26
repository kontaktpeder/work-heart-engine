-- Do not auto-create a «(personlig)» workspace on signup.
-- Colleagues join an existing org via membership; owners use «Ny organisasjon».
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END $function$;
