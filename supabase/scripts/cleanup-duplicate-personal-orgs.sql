-- =============================================================================
-- Work Core: rydd opp duplikate «(personlig)»-org-er etter SSO-forsøk
-- =============================================================================
-- Beholder:
--   - Org-er som IKKE heter «kontaktpeder (personlig)» / «nexus-pending…»
--   - Den «kontaktpeder (personlig)» som har mest data (time_entries)
-- Sletter resten av tomme/duplikate personlige org-er (CASCADE fjerner tomt innhold).
--
-- Kjør i Lovable Cloud → Work → SQL Editor.
-- =============================================================================

BEGIN;

-- Se status FØR sletting
SELECT
  o.id,
  o.name,
  o.created_at,
  (SELECT COUNT(*) FROM public.projects p WHERE p.organization_id = o.id) AS projects,
  (SELECT COUNT(*) FROM public.time_entries t WHERE t.organization_id = o.id) AS time_entries,
  (SELECT COUNT(*) FROM public.organization_members m WHERE m.organization_id = o.id) AS members
FROM public.organizations o
WHERE o.owner_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
ORDER BY o.name, o.created_at;

-- Merk duplikate personlige org-er for sletting:
-- navn matcher kontaktpeder/nexus-pending personlig, OG ikke den med flest time_entries
WITH personal AS (
  SELECT
    o.id,
    o.name,
    o.created_at,
    (SELECT COUNT(*) FROM public.time_entries t WHERE t.organization_id = o.id) AS time_entries,
    (SELECT COUNT(*) FROM public.projects p WHERE p.organization_id = o.id) AS projects
  FROM public.organizations o
  WHERE o.owner_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
    AND (
      o.name ILIKE 'kontaktpeder (personlig)'
      OR o.name ILIKE 'nexus-pending%'
      OR o.name ILIKE 'migrated.%'
    )
),
keeper AS (
  SELECT id
  FROM personal
  ORDER BY time_entries DESC, projects DESC, created_at ASC
  LIMIT 1
)
DELETE FROM public.organizations o
WHERE o.id IN (SELECT id FROM personal)
  AND o.id NOT IN (SELECT id FROM keeper);

COMMIT;

-- Verifiser ETTER
SELECT id, name, created_at
FROM public.organizations
WHERE owner_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
   OR id IN (
     SELECT organization_id FROM public.organization_members
     WHERE user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
   )
ORDER BY name;
