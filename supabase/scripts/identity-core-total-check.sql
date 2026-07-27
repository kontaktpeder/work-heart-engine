-- =============================================================================
-- Identity Core TOTAL CHECK — Work (eptoqbtquwxtubusqobq)
-- Nexus user: d53220f8-aa16-411c-b3a9-c5477c4a853e
-- Kjør i Lovable Cloud → Work Engine → SQL
-- =============================================================================

-- A) Innloggingsidentitet
SELECT 'A_auth_users' AS check_id, id::text, email, created_at::text
FROM auth.users
WHERE id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
   OR email ILIKE 'migrated%'
   OR email ILIKE 'nexus-pending%'
   OR lower(email) = 'kontaktpeder@gmail.com'
ORDER BY created_at;

-- B) Org-er Nexus eier / er medlem av
SELECT 'B_orgs' AS check_id, o.id::text, o.name, o.owner_id::text, m.role::text
FROM public.organizations o
JOIN public.organization_members m ON m.organization_id = o.id
WHERE m.user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
ORDER BY o.name;

-- C) Data-volum synlig for Nexus
SELECT 'C_time_entries' AS check_id, COUNT(*)::text AS value, '' AS extra, '' AS x
FROM public.time_entries WHERE user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
UNION ALL
SELECT 'C_projects', COUNT(*)::text, '', ''
FROM public.projects p
JOIN public.organization_members m ON m.organization_id = p.organization_id
WHERE m.user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e'
UNION ALL
SELECT 'C_finance_secrets', COUNT(*)::text, '', ''
FROM public.org_integration_secrets s
JOIN public.organization_members m ON m.organization_id = s.organization_id
WHERE m.user_id = 'd53220f8-aa16-411c-b3a9-c5477c4a853e';

-- D) Orphan: memberships / ownership still on migrated users
SELECT 'D_orphan_members' AS check_id, m.user_id::text, u.email, COUNT(*)::text
FROM public.organization_members m
JOIN auth.users u ON u.id = m.user_id
WHERE u.email ILIKE 'migrated%' OR u.email ILIKE 'nexus-pending%'
GROUP BY m.user_id, u.email;

SELECT 'D_orphan_owners' AS check_id, o.id::text, o.name, o.owner_id::text
FROM public.organizations o
JOIN auth.users u ON u.id = o.owner_id
WHERE u.email ILIKE 'migrated%' OR u.email ILIKE 'nexus-pending%';

-- E) Duplikate personlige org-er
SELECT 'E_personal_dupes' AS check_id, name, COUNT(*)::text AS n, '' AS x
FROM public.organizations
WHERE name ILIKE '%(personlig)%'
GROUP BY name
HAVING COUNT(*) > 1;
