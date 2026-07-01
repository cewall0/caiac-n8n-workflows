# Plan: Consolidate Client Sheet Setup

**Status: IMPLEMENTED — 2026-06-25 (see lead-data-architecture.md Phase 2b)**

## Problem

Two separate workflows both create a Google Sheet for each client:

- `[Onboarding] Create Lead Sheet v1.0.0` (`mXtKgZzK7Ppncywr`) — creates spreadsheet, writes lead headers from `field_map`, shares with owner, saves sheet ID
- `[Onboarding] Create Client Lead Sheet v1.0.0` (`WL6OUEmJ4Z5ZGsr8`) — creates a separate spreadsheet, writes lead + review headers, adds review status tab, dropdown, row protection, upserts review config

**Each creates its own file.** There should be ONE sheet per client with TWO tabs. Currently the sheet setup is split across two workflows, producing two files with duplicated sheet creation logic.

## Intended Architecture

One sheet per client:
- **Tab 1 — Leads** — columns driven by `field_map` (client-defined intake fields). Auto-written by Lead Capture on new submissions.
- **Tab 2 — Review Status** — client manually moves leads through the review status dropdown. The reviews polling workflow (`[Reviews] Poll Sheets For Completed Leads v1.0.0`) reads this tab to trigger review collection. This tab is the client's CRM interface — it stays.

## What We're Building

**`[Onboarding] Setup Client Sheet v1.0.0`** — replaces both existing workflows. Does the complete sheet setup in one shot.

**Inputs:**
```
client_id            UUID
client_slug          string
client_name          string
owner_email          string
field_map            JSON string — lead column definitions
google_review_link   string — validated before creating anything; stored in review config
```

**Steps:**
1. Validate `google_review_link` responds 200 — throw if invalid (don't create a partial sheet)
2. Create spreadsheet
3. Rename default tab → "Leads", write lead column headers from `field_map`
4. Add "Review Status" tab, write review status headers
5. Set status dropdown on Review Status tab
6. Protect header rows on both tabs
7. Share with `owner_email`
8. Save sheet ID + review config to Postgres (single upsert)
9. Return `sheet_id`, `sheet_url`

## Changes Required

**New workflow:** `[Onboarding] Setup Client Sheet v1.0.0` — build and test in staging first

**Onboarding agent — update `create_lead_sheet` tool:**
- Point to new workflow ID
- Add `client_slug` and `google_review_link` to inputs (the old `Create Lead Sheet` didn't require these)
- Update tool description to reflect it sets up both tabs

**Deactivate after cutover:**
- `[Onboarding] Create Lead Sheet v1.0.0` (`mXtKgZzK7Ppncywr`)
- `[Onboarding] Create Client Lead Sheet v1.0.0` (`WL6OUEmJ4Z5ZGsr8`)

**Registry + files:**
- Add `onboarding-setup-client-sheet-v1.0.0.json` to `workflows/` after prod deploy
- Remove old files once workflows deactivated

## Dependencies

Build `[Onboarding] Generate Field Map v1.0.0` first (see `onboarding-field-map.md`) — the sheet setup workflow receives `field_map` as a proper input. The agent should call `generate_field_map` before calling `setup_client_sheet`.
