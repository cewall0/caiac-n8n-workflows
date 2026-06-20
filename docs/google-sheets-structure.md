# Google Sheets — Structure & Usage

**Last updated:** 2026-06-17  
**Applies to:** Sheet-based clients (no CRM). CRM clients use `caiac.leads` instead.  
**Credential:** `Caiac Group Sheets` (ID: `aZpl46gLl1Uha2wW`, type: `googleSheetsOAuth2Api`)

---

## Overview

Each client gets one Google Sheet with one client-managed tab and one automation-managed tab per enabled workflow type.

| Tab | Managed by | Created when | Purpose |
|-----|-----------|-------------|---------|
| `Lead Information` | Client | Always | Client adds and updates lead records |
| `Review Status` | Automation | Reviews enabled | CAIAC writes review outcomes — client should not edit |
| `Nurture Status` | Automation | Nurture enabled (future) | CAIAC writes nurture/follow-up outcomes |
| `Appointment Status` | Automation | Appointments enabled (future) | CAIAC writes appointment outcomes |

**Pattern:** every workflow category that writes outcome data gets its own tab. Tabs are created at onboarding based on which features are enabled for that client — never created on first use.

Separating tabs means the client can freely edit Lead Information without touching automation data, and each automation type owns its tab independently.

---

## Sheet Naming

- **File name:** `[Client Name] Leads` — e.g. `Henderson & Associates Leads`
- **Tab 1:** `Lead Information`
- **Tab 2:** `Review Status`
- **Stored in:** the Google account linked to `Caiac Group Sheets` credential

---

## Lead Information Tab

**Who manages it:** The client. CAIAC reads from this tab but does not write to it.

**Trigger:** When `Status` is set to `Completed`, the lead qualifies for a review request on the next hourly poll.

### Columns

| Column | Type | Notes |
|--------|------|-------|
| Lead Name | Text | Full name — appears in the review email |
| Lead Email | Text | Primary match key. Required unless phone-only lead. |
| Lead Phone | Text | Used as match key when no email present |
| Service | Text | What the client provided — appears in email copy |
| Status | Dropdown | Lead lifecycle stage — drives which automation fires |
| Notes | Text | Free text — for client use, ignored by automation |

### Status Dropdown — Lifecycle Stages

The `Status` column (column E) represents where the lead is in the client's lifecycle. Each stage maps to an automation type. The client sets the status; CAIAC acts on it.

| Status value | Automation triggered | Tab written to |
|---|---|---|
| `New` | None — lead just entered | — |
| `In Progress` | None — work underway | — |
| `Completed` | Review Request | `Review Status` |
| `Appointment Booked` | Appointment Confirmation *(future)* | `Appointment Status` *(future)* |
| `No Show` | No-Show Follow-Up *(future)* | `Appointment Status` *(future)* |
| `Cancelled` | None | — |

**Rule:** each Status value that triggers an automation maps to exactly one output tab. Adding a new automation type means adding a Status value + a new tab — nothing else changes in Lead Information.

The dropdown is enforced via Google Sheets `setDataValidation` batchUpdate on column E:
- `startColumnIndex: 4` (0-based, so column E)
- `endColumnIndex: 5`

Poll workflows read `Status` and route to the appropriate core workflow. A lead with `Status = Completed` goes to `[Reviews] Process Completed Lead`. Future statuses route to their own core workflows via a Switch node in the poll.

---

## Automation Output Tabs

Each enabled workflow type gets its own tab. All automation tabs follow the same pattern:
- First two columns are always `Lead Email` and `Lead Phone` — used as the match key for `appendOrUpdate`
- All other columns are outcome fields written by that workflow type
- Never read by the client-facing poll — each poll workflow reads only its own tab

---

## Review Status Tab

**Who manages it:** CAIAC automation only. Client should not edit.

**Purpose:** Tracks what CAIAC has done with each lead for the review workflow so the hourly poll never sends a second email.

### Columns

| Column | Type | Written by | Notes |
|--------|------|-----------|-------|
| Lead Email | Text | Mark Review Sent | Match key (primary) |
| Lead Phone | Text | Mark Review Sent | Match key (fallback) |
| Review Email Sent | Boolean | Mark Review Sent | `TRUE` once the review email goes out |
| Review Email Sent Date | Date/Text | Mark Review Sent | ISO timestamp |
| Rating Received | Text | Record Rating | `good` or `bad` |
| Needs Followup | Boolean | Record Rating | `TRUE` if thumbs-down clicked |
| Review Confirmed | Boolean | Reserved | Future — did they actually post a review? |
| Last Resend Date | Date/Text | Reserved | Future — resend feature |

---

## Nurture Status Tab *(future)*

**Created when:** Nurture/follow-up workflows are enabled for the client.

| Column | Written by | Notes |
|--------|-----------|-------|
| Lead Email | Nurture workflow | Match key |
| Lead Phone | Nurture workflow | Match key (fallback) |
| Auto Reply Sent | [Nurture] New Lead Auto-Reply | `TRUE` once sent |
| Auto Reply Sent Date | [Nurture] New Lead Auto-Reply | ISO timestamp |
| Follow Up 1 Sent | [Nurture] No-Response Follow-Up | `TRUE` once sent |
| Follow Up 1 Sent Date | [Nurture] No-Response Follow-Up | ISO timestamp |
| Follow Up 2 Sent | [Nurture] No-Response Follow-Up | `TRUE` once sent |
| Follow Up 2 Sent Date | [Nurture] No-Response Follow-Up | ISO timestamp |
| Responded | [Nurture] No-Response Follow-Up | `TRUE` if lead replied |

---

## Appointment Status Tab *(future)*

**Created when:** Appointment workflows are enabled for the client.

| Column | Written by | Notes |
|--------|-----------|-------|
| Lead Email | Appointment workflow | Match key |
| Lead Phone | Appointment workflow | Match key (fallback) |
| Confirmation Sent | [Appt] Booking Confirmation | `TRUE` once sent |
| Confirmation Sent Date | [Appt] Booking Confirmation | ISO timestamp |
| Reminder 24hr Sent | [Appt] Reminder | `TRUE` once sent |
| Reminder 1hr Sent | [Appt] Reminder | `TRUE` once sent |
| No Show | [Appt] No-Show Follow-Up | `TRUE` if no show detected |
| No Show Follow Up Sent | [Appt] No-Show Follow-Up | `TRUE` once sent |

---

## How a Sheet Is Created

**Workflow:** `[Onboarding] Create Client Lead Sheet v1.0.0` (ID: `WL6OUEmJ4Z5ZGsr8`)

### Steps the workflow performs
1. Verifies the `google_review_link` resolves (HTTP GET — fails loud if not)
2. Creates a new Google Sheet via Sheets API (`POST /spreadsheets`)
3. Renames the default tab from `Sheet1` → `Lead Information` via `updateSheetProperties` batchUpdate
4. Writes Lead Information headers: `["Lead Name","Lead Email","Lead Phone","Service","Status","Notes"]`
5. Applies `Status` dropdown validation to Lead Information column E (all current + future lifecycle values)
6. For each enabled feature, adds the corresponding tab and writes its headers:
   - `reviews` → `Review Status` tab
   - `nurture` → `Nurture Status` tab *(future)*
   - `appointments` → `Appointment Status` tab *(future)*
7. Generates a 64-char random hex HMAC signing secret (Math.random loop — crypto module unavailable in n8n sandbox)
8. Upserts `caiac.client_review_config` with sheet ID, tab names, enabled features, signing secret, and config

### Important: Tab creation bug workaround
The n8n Google Sheets `create` node always creates the first tab as `Sheet1` regardless of what name is specified in node parameters. The onboarding workflow works around this by:
1. Creating the sheet (tab lands as `Sheet1`)
2. Immediately renaming `Sheet1` → `Lead Information` via `updateSheetProperties` batchUpdate in an HTTP Request node

Any future sheet creation must follow this pattern — do not rely on the Sheets node to name the first tab correctly.

### Inputs required
| Input | Description |
|-------|-------------|
| `client_slug` | Must match `caiac.clients.slug` exactly |
| `client_name` | Display name used in file name and email copy |
| `google_review_link` | Full URL from Google Business Profile |
| `client_admin_email` | Who receives bad-experience notifications |
| `enabled_features` | List of workflow types to enable: `["reviews", "nurture", "appointments"]` — defaults to `["reviews"]` |
| `lead_sheet_tab` | Optional — tab name for Lead Information (defaults to `Lead Information`) |

### Tab naming convention
| Feature key | Tab name |
|---|---|
| *(always)* | `Lead Information` |
| `reviews` | `Review Status` |
| `nurture` | `Nurture Status` |
| `appointments` | `Appointment Status` |

Future workflow types follow the pattern: `[Category] Status`.

### Safe to re-run
Uses `ON CONFLICT DO UPDATE` on `client_review_config`. Re-running updates the config. **Warning:** the signing secret rotates on each run, invalidating any previously sent review links.

---

## How Sheets Are Read

**Workflow:** `[Reviews] Poll Sheets For Completed Leads v1.0.0` (ID: `rsuysKkzQZ3Muse2`)  
**Schedule:** Hourly

### Read pattern
Both tabs are read using the Google Sheets node:
- **Operation:** `read`
- **typeVersion:** `4.7`
- **Range:** `A:Z` (all columns — header-aware, returns objects keyed by column name)
- **Sheet name:** specified by `mode: name`, not by index

### Filter logic (`Filter Qualifying Leads` Code node)
1. Reads all enabled automation tabs → builds `sentContacts` Sets per automation type (email + phone already processed)
2. Reads all rows from Lead Information → filters for:
   - Has a `Lead Email` or `Lead Phone` value
   - `Status` value maps to an enabled automation type
   - Contact key (`email || phone`) is NOT already processed for that automation type
3. Tags each qualifying lead with its `automation_type` based on Status value
4. Returns qualifying leads with normalized shape; returns `{ _skip: true }` if none

### Status → Automation routing (Switch node)
After filtering, a Switch node routes each lead to the correct core workflow based on `automation_type`:

| automation_type | Routes to |
|---|---|
| `review_request` | `[Reviews] Process Completed Lead` |
| `appointment_confirmation` | `[Appt] Process Booking` *(future)* |
| `nurture` | `[Nurture] Process New Lead` *(future)* |

### Why rows are accessed by header name (not column index)
The Sheets read node returns each row as a JSON object with column headers as keys:
```json
{ "Lead Name": "Jane Smith", "Lead Email": "jane@example.com", "Status": "Completed" }
```
This means columns can be reordered or new columns inserted by the client without breaking the automation. The filter code accesses `row['Status']`, `row['Lead Email']`, etc. — never by position.

---

## How Sheets Are Written

**Utility workflow:** `[Utility] Update Lead Sheet Row v1.0.0` (ID: `ySf9npJlqi23yjXK`)

### Operation
`appendOrUpdate` — if a row with the matching key exists, updates it in place. If not, appends a new row. This is how Review Status rows are created on first write.

### Inputs
| Input | Description |
|-------|-------------|
| `lead_sheet_id` | Google Sheet file ID |
| `lead_sheet_tab` | Tab name to write to |
| `match_column` | Column header to match on — `"Lead Email"` or `"Lead Phone"` |
| `match_value` | The value to match (the email or phone number) |
| `fields` | Object of column header → value pairs to write |

### Routing
An IF node (`Route By Match Column`) branches on whether `match_column === "Lead Email"`:
- **True:** `Upsert By Email` node — `matchingColumns: ["Lead Email"]`
- **False:** `Upsert By Phone` node — `matchingColumns: ["Lead Phone"]`

Both nodes use `autoMapInputData: true` — they write all fields from the input data object to the sheet, mapping by column header name.

### Data preparation (`Flatten Fields For Mapping` Code node)
```js
const input = $input.first().json;
return [{ json: { [input.match_column]: input.match_value, ...input.fields } }];
```
The match column + value is merged with the fields object so the Sheets node sees a flat object where every key is a column header.

---

## Write-Back Workflows

### `[Utility] Mark Review Sent v1.0.0` (ID: `zHqk2CNsXQX6K1Bn`)
Called after `Process Completed Lead` sends the review email. Writes to the **Review Status** tab.

Fields written:
```json
{
  "Review Email Sent": true,
  "Review Email Sent Date": "2026-06-17T14:00:00Z"
}
```

Match column inference: `source_ref.includes('@')` → `"Lead Email"`, otherwise `"Lead Phone"`.

### `[Utility] Record Rating v1.0.0` (ID: `eQeYbCkCLYaNvG83`)
Called when the lead clicks a thumbs-up or thumbs-down link. Writes to the **Review Status** tab.

Fields written (thumbs-up):
```json
{ "Rating Received": "good" }
```

Fields written (thumbs-down):
```json
{ "Rating Received": "bad", "Needs Followup": true }
```

Same match column inference as Mark Review Sent.

---

## Known Sheets

| Client | slug | Sheet ID | Notes |
|--------|------|----------|-------|
| Henderson & Associates | `henderson` | `1Zds_M-gVyKYGSk3ALOi1099vAgbvOOgoaLPwgHIlGiA` | Manually migrated to two-tab structure 2026-06-16 |

---

## Adding an Existing Sheet (Manual Migration)

If a client already has a Google Sheet that wasn't created by the Onboarding workflow:

1. Add a `Review Status` tab with the correct headers (see above)
2. Add a `Lead Phone` column to `Lead Information` at column C if not present — use `insertDimension` batchUpdate to avoid shifting existing data
3. Add a `Lead Phone` column to `Review Status` at column B if not present — same method
4. Run the Onboarding workflow with the existing sheet ID set in `client_review_config` (or manually upsert the config row)

The Henderson sheet was migrated this way using a temporary n8n workflow (`2AcbMjhO7fTmBAg6`) that was created, executed, then deleted.

---

## Technical Reference

| Detail | Value |
|--------|-------|
| Sheets node typeVersion | `4.7` |
| Read operation | `read`, range `A:Z` |
| Write operation | `appendOrUpdate`, `autoMapInputData: true` |
| Credential type | `googleSheetsOAuth2Api` |
| Credential name | `Caiac Group Sheets` |
| Credential ID | `aZpl46gLl1Uha2wW` |
| First tab name on create | Always `Sheet1` — must rename via batchUpdate |
| Row access pattern | By header name (string key), never by column index |
