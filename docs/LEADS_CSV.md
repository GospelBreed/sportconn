# Leads CSV — import & export format

SportConn CRM imports and exports **Leads** as CSV from the **Leads** page
(`/leads`): **Import CSV** / **Export CSV** in the top-right, plus **Download
template** inside the import dialog. This covers the Sponsor, Investor,
Strategic Partnership, and User Acquisition pipelines — Facilities and
Captains have their own directory pages, not a CSV import yet.

- Encoding: UTF-8. Delimiter: comma. First row = headers.
- Quote any value that contains a comma, quote, or newline; escape a literal
  quote by doubling it (`""`). This is standard RFC-4180 CSV — what Excel,
  Google Sheets, and Numbers produce by default.
- Header names are matched **case-insensitively and ignore spaces / underscores /
  dashes**, and common aliases are auto-detected (e.g. `Company`, `Organization`
  → `company_name`; `Value`, `Deal Value` → `expected_value`).
  You confirm every mapping on the "Map columns" step before importing.
- Import **only adds** rows. It never updates or de-duplicates existing leads.
- Rows missing `full_name` are skipped and listed back to you; unrecognised
  enum values fall back to the default and are reported as warnings.
- A row's `pipeline` determines which pipeline it lands in; if the pipeline's
  stage isn't specified, it defaults to that pipeline's first configured stage
  (Settings → Pipelines & stages).

## Columns

| Column | Required | Notes |
|---|---|---|
| `full_name` | **yes** | Contact person's full name. |
| `title` | no | Job title, e.g. `Facility Manager`. |
| `email` | no | Contact email. |
| `phone` | no | Any format. |
| `whatsapp` | no | Any format. Blank allowed. |
| `linkedin_url` | no | Full URL. |
| `company_name` | no | Organization / brand name. |
| `lead_type` | no | `sponsor` \| `investor` \| `facility` \| `sports_brand` \| `coach` \| `academy` \| `captain` \| `athlete` \| `community` \| `tournament_organizer` \| `strategic_partner` \| `media_partner` \| `corporate_partner` \| `other`. Default `other`. |
| `pipeline` | no | `sponsor` \| `investor` \| `strategic_partnership` \| `user_acquisition`. Default `sponsor`. |
| `location_city` | no | City. |
| `location_country` | no | Country. |
| `temperature` | no | `hot` \| `warm` \| `cold` \| `at_risk`. Default `warm`. |
| `priority` | no | `high` \| `medium` \| `low`. Default `medium`. |
| `source` | no | `field_sales` \| `referral` \| `website` \| `social_media` \| `linkedin` \| `instagram` \| `facebook` \| `whatsapp` \| `email` \| `event` \| `campaign` \| `existing_network` \| `investor_outreach` \| `sponsor_outreach` \| `facility_outreach` \| `organic` \| `other`. Default `import`. |
| `expected_value` | no | Numeric. `$` and thousands separators are stripped. Blank allowed. |
| `next_follow_up_at` | no | `YYYY-MM-DD`, `MM/DD/YYYY`, or full ISO 8601. Blank allowed. |
| `notes` | no | Free text. |

## Export-only columns

Exports add five read-only trailing columns for reference — **ignored on
import**, so an exported file re-imports cleanly (creating new copies):

`id`, `stage`, `status`, `created_at`, `last_activity_at`

## Example

```csv
full_name,title,email,phone,whatsapp,linkedin_url,company_name,lead_type,pipeline,location_city,location_country,temperature,priority,source,expected_value,next_follow_up_at,notes
Adaeze Nwankwo,Marketing Director,adaeze@titantelecom.ng,+234 803 555 0301,+234 803 555 0301,,Titan Telecom,sponsor,sponsor,Lagos,Nigeria,hot,high,sponsor_outreach,10000000,2026-10-15,"Very interested in grassroots football sponsorship."
Chidi Okafor,Partner,chidi@capitalventures.ng,+234 803 555 0306,,,Capital Ventures,investor,investor,Lagos,Nigeria,hot,high,investor_outreach,75000,,Pitch deck sent; strong initial interest.
```
