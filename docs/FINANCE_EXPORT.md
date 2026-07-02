# Finance Export

Work Core can push time entries to Finance Core as `expense` entries.

## Flow

1. Owner/admin opens **Settings → Finance integration** and pastes a Finance
   API key with scope `entries:write`. The key is encrypted (AES-GCM) with
   `INTEGRATION_SECRETS_KEY` and stored in `org_integration_secrets`.
2. In **Reports**, the admin picks a period and clicks **Export to Finance**.
   Only time entries where `finance_entry_id IS NULL` and `amount > 0` are
   sent.
3. For each entry Work Core `POST`s
   `${finance_base_url}/api/public/v1/entries` and writes the returned id
   back to `time_entries.finance_entry_id`. Every attempt is recorded in
   `finance_export_log` (success | skipped | error).

## Mapping

| Finance field    | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `entry_type`     | `expense`                                                             |
| `entry_date`     | `time_entries.date` (fallback: `started_at`)                          |
| `description`    | `Work: {project} — {hours}h ({rate})`                                 |
| `counterparty`   | `Internal labor`                                                      |
| `category`       | `Labor`                                                               |
| `category_group` | Project name                                                          |
| `amount_gross`   | `time_entries.amount` (rounded to 2 dp)                               |
| `vat_rate`       | `0`                                                                   |
| `source_app`     | `work-core`                                                           |
| `source_type`    | `time_entry`                                                          |
| `source_ref`     | `time_entries.id` (UUID)                                              |
| `external_url`   | `${PUBLIC_APP_URL}/orgs/{org_id}`                                     |
| `notes`          | `time_entries.comment` (truncated to 2000 chars)                      |

## Idempotency

- Work Core skips entries that already have `finance_entry_id`.
- Finance Core's unique index on `(organization_id, source_app, source_ref)`
  is the second line of defence — retrying the same entry is safe.

## Troubleshooting

| Symptom                                                        | Cause / fix                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Organization is not linked to Platform"                       | Set `organizations.external_identity_org_id` (Platform verify flow).              |
| "Finance integration not configured"                           | Save the Finance base URL + API key under Settings → Finance integration.         |
| Test connection: `Finance API 401`                             | Key is wrong or revoked. Issue a new key with scope `entries:write` in Finance.    |
| Export shows errors on individual entries                      | See `finance_export_log.error_message` for that entry.                            |
| `Unsupported ciphertext version` on export                     | `INTEGRATION_SECRETS_KEY` was rotated. Re-save the Finance API key.               |

## Creating a Finance API key

In Finance Core, open **Settings → API keys**, create a key named
`work-export`, grant scope `entries:write`, copy the token, and paste it
into Work Core → **Settings → Finance integration**.
