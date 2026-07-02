# Module Contract v1 — Work Core Compliance

Work Core implements Platform Module Contract v1.
Spec (frozen): `platform-nexus/docs/MODULE_CONTRACT.v1.md`

- contract_version: 1.0
- module_slug: work
- key prefix: `wc_live_`

## Endpoints

| Endpoint | Method | Scope |
|----------|--------|-------|
| /api/public/v1/module/health | GET | — |
| /api/public/v1/module/info | GET | — |
| /api/public/v1/module/organization | GET | platform:read |
| /api/public/v1/module/organization/{org_id} | GET | platform:verify |

Wrong `org_id` on verify → **404** (not 403).

## Deep links

| key | path |
|-----|------|
| org_home | `/orgs/{org_id}` |
| org_timer | `/orgs/{org_id}/timer` |
| org_reports | `/orgs/{org_id}/reports` |

## Widgets (Platform dashboard)

`GET /api/public/v1/module/info` includes `widgets[]` per MODULE_CONTRACT.v1.

All widgets are `placeholder: true` in v1 — Platform shows titles only; live data comes later.

| id | title | deep_link |
|----|-------|-----------|
| today_hours | Today's hours | org_home |
| active_projects | Active projects | org_home |

## Platform verify key

Org → Settings → API keys → name: `platform-verify`
Scopes: `platform:read` + `platform:verify` only.

## curl

```bash
BASE="https://<work-deploy-url>"
KEY="wc_live_..."

curl -s "$BASE/api/public/v1/module/health" | jq .module_slug    # "work"
curl -s "$BASE/api/public/v1/module/info"   | jq .module_slug

ORG="<gold-of-sicily-work-org-uuid>"
curl -s "$BASE/api/public/v1/module/organization/$ORG" \
  -H "Authorization: Bearer $KEY" | jq .verified   # true
```
