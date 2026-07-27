-- =============================================================================
-- Work Core: gjenopprett tilgang — remap gammel lokal UUID → Nexus UUID
-- =============================================================================
-- Nexus (deg nå):     d53220f8-aa16-411c-b3a9-c5477c4a853e
-- Gammel Work-bruker: f32d09b5-d4d1-41ba-80d4-4fb89e7c0381  (28. juni)
-- SSO-parkert:        65791b9e-d395-4703-bbe2-8be2e726ee8f  (i dag)
--
-- Kjør i Lovable Cloud → Work → SQL Editor.
-- Sletter INGEN org-er / time_entries. Sletter heller ikke auth.users ennå.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  nexus_id uuid := 'd53220f8-aa16-411c-b3a9-c5477c4a853e';
  old_ids uuid[] := ARRAY[
    'f32d09b5-d4d1-41ba-80d4-4fb89e7c0381'::uuid,
    '65791b9e-d395-4703-bbe2-8be2e726ee8f'::uuid
  ];
  old_id uuid;
BEGIN
  FOREACH old_id IN ARRAY old_ids LOOP
    IF old_id = nexus_id THEN
      CONTINUE;
    END IF;

    -- 1) Memberships: flytt, eller slett legacy-rad ved unik-konflikt
    UPDATE public.organization_members m
    SET user_id = nexus_id
    WHERE m.user_id = old_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members x
        WHERE x.organization_id = m.organization_id
          AND x.user_id = nexus_id
      );

    DELETE FROM public.organization_members
    WHERE user_id = old_id;

    -- 2) Org ownership (må skje FØR eventuell senere deleteUser)
    UPDATE public.organizations
    SET owner_id = nexus_id
    WHERE owner_id = old_id;

    -- 3) Time entries
    UPDATE public.time_entries
    SET user_id = nexus_id
    WHERE user_id = old_id;

    -- 4) Work sessions (unik per user — behold nexus sin, slett legacy)
    DELETE FROM public.work_sessions
    WHERE user_id = old_id
      AND EXISTS (
        SELECT 1 FROM public.work_sessions s WHERE s.user_id = nexus_id
      );

    UPDATE public.work_sessions
    SET user_id = nexus_id
    WHERE user_id = old_id;

    -- 5) API clients (ON DELETE RESTRICT)
    UPDATE public.api_clients
    SET created_by = nexus_id
    WHERE created_by = old_id;
  END LOOP;
END $$;

COMMIT;

-- Verifiser
SELECT id, name, owner_id, created_at
FROM public.organizations
ORDER BY created_at;

SELECT o.name, m.role, m.user_id
FROM public.organization_members m
JOIN public.organizations o ON o.id = m.organization_id
WHERE m.user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
ORDER BY o.name;

SELECT COUNT(*) AS time_entries_for_nexus
FROM public.time_entries
WHERE user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e';

SELECT COUNT(*) AS projects_visible
FROM public.projects p
JOIN public.organization_members m ON m.organization_id = p.organization_id
WHERE m.user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e';
