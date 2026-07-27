-- Work Core: finn hva som er igjen etter Identity Core-migrering
-- Kjør i Lovable Cloud → Work Engine → Database → SQL Editor
-- (eller Supabase SQL for prosjekt eptoqbtquwxtubusqobq)

-- 1) Alle organisasjoner som finnes NÅ
SELECT id, name, owner_id, created_at, updated_at
FROM public.organizations
ORDER BY created_at;

-- 2) Medlemskap
SELECT m.id, m.organization_id, o.name AS org_name, m.user_id, m.role, m.created_at
FROM public.organization_members m
LEFT JOIN public.organizations o ON o.id = m.organization_id
ORDER BY m.created_at;

-- 3) Finnes det timeføring uten org? (burde normalt være 0 hvis CASCADE)
SELECT COUNT(*) AS time_entries FROM public.time_entries;
SELECT COUNT(*) AS projects FROM public.projects;
SELECT COUNT(*) AS work_sessions FROM public.work_sessions;

-- 4) Auth-brukere (lokal Work-shadow + eventuelle migrated.*)
SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data
FROM auth.users
ORDER BY created_at DESC;

-- 5) Orphan-hint: org med owner som ikke finnes i auth.users
SELECT o.id, o.name, o.owner_id
FROM public.organizations o
LEFT JOIN auth.users u ON u.id = o.owner_id
WHERE u.id IS NULL;

-- Hvis (1) bare viser nexus-pending / én personlig org,
-- og (3) er 0 → gammel data er CASCADE-slettet.
-- Da er eneste håp: Lovable/Supabase backup / point-in-time restore
-- fra FØR i dag formiddag (før SSO-migreringsforsøkene).
