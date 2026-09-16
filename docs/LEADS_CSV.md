# Leads CSV — import & export format

Roseway CRM imports and exports **Leads** as CSV from the **Leads** page
(`/leads`): **Import CSV** / **Export CSV** in the top-right, plus **Download
template** inside the import dialog.

- Encoding: UTF-8. Delimiter: comma. First row = headers.
- Quote any value that contains a comma, quote, or newline; escape a literal
  quote by doubling it (`""`). This is standard RFC-4180 CSV — what Excel,
  Google Sheets, and Numbers produce by default.
- Header names are matched **case-insensitively and ignore spaces / underscores /
  dashes**, and common aliases are auto-detected (e.g. `Company`, `Company Name`,
  `Management Company` → `company_name`; `ARR`, `Annual Value` → `estimated_arr`).
  You confirm every mapping on the "Map columns" step before importing.
- Import **only adds** rows. It never updates or de-duplicates existing leads.
- Rows missing `full_name` are skipped and listed back to you; unrecognised
  enum values fall back to the default and are reported as warnings.

## Columns

| Column | Required | Notes |
|---|---|---|
| `full_name` | **yes** | Contact person's full name. |
| `title` | no | Job title, e.g. `Community Manager`. |
| `email` | no | Contact email. |
| `phone` | no | Any format. |
| `linkedin_url` | no | Full URL. |
| `company_name` | no | Management company, e.g. `Greystar Real Estate`. |
| `property_name` | no | Community name (free text). |
| `location_city` | no | City. |
| `location_state` | no | 2-letter state code. |
| `unit_count` | no | Whole number ≥ 0. Non-digits are stripped. |
| `asset_type` | no | `conventional` \| `luxury` \| `senior` \| `affordable` \| `mixed_use`. Labels like `Senior Living` also accepted. Default `conventional`. |
| `temperature` | no | `hot` \| `warm` \| `cold`. Default `warm`. |
| `experience_score` | no | Integer `0`–`100`. Blank allowed. |
| `stage` | no | `new_lead` \| `contacted` \| `qualified` \| `discovery` \| `proposal` \| `pilot` \| `closed_won` \| `closed_lost`. Labels like `Discovery Call` also accepted. Default `new_lead`. |
| `source` | no | `res_exp_check` \| `cold_email` \| `linkedin` \| `referral` \| `website` \| `import` \| `other`. Default `import`. |
| `estimated_arr` | no | Annual USD value. `$` and thousands separators are stripped. Default `0`. |
| `next_follow_up_at` | no | `YYYY-MM-DD`, `MM/DD/YYYY`, or full ISO 8601. Blank allowed. |
| `notes` | no | Free text. |

## Export-only columns

Exports add three read-only trailing columns for reference — **ignored on
import**, so an exported file re-imports cleanly (creating new copies):

`id`, `created_at`, `last_activity_at`

## Example

```csv
full_name,title,email,phone,linkedin_url,company_name,property_name,location_city,location_state,unit_count,asset_type,temperature,experience_score,stage,source,estimated_arr,next_follow_up_at,notes
Sarah Johnson,Community Manager,s.johnson@greystar.com,(972) 555-0184,https://linkedin.com/in/sjohnson,Greystar Real Estate,The Park at Legacy,Plano,TX,420,conventional,hot,68,qualified,cold_email,18000,2025-10-15,"Downloaded checklist; wants to loop in Regional VP."
Marcus Rivera,General Manager,m.rivera@cortland.com,(214) 555-0110,,Cortland Communities,Cortland Grand Reserve,Dallas,TX,380,luxury,hot,52,discovery,cold_email,24000,,Rescue package proposal under review.
```
