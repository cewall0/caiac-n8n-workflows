# Plan: Onboarding Field Map Generation

**Status: IMPLEMENTED — 2026-06-25 (see lead-data-architecture.md Phase 2a)**

## Problem

The onboarding agent currently generates `field_map` on the fly from conversation context using `$fromAI()`. Nothing enforces consistency or produces a Tally form artifact. Result: the admin manually builds the Tally form and must match field labels exactly to what Claude happened to generate — any mismatch silently breaks Lead Capture mapping for that client.

## What We're Building

**`[Onboarding] Generate Field Map v1.0.0`** — a new onboarding agent tool. The agent collects the client's desired intake fields during the conversation, calls this tool, and gets back two artifacts: the `field_map` JSON (stored in DB, used for sheet headers) and the exact Tally field label list (handed to the operator to set up the form). Both come from the same source — drift is impossible by design.

## Workflow Spec

**Trigger:** `executeWorkflowTrigger` (sub-workflow)

**Inputs:**
```json
{
  "fields": [
    { "label": "Full Name", "required": true },
    { "label": "Phone Number", "required": true },
    { "label": "Email Address", "required": false },
    { "label": "Service Needed", "required": true },
    { "label": "Property Address", "required": false }
  ]
}
```
Agent passes this array after discussing with the operator what the client wants to collect.

**Processing (single Code node):**
- Validate at least one field provided
- For each field, derive a snake_case system key from the label using a lookup table for common fields, fallback to auto-slugify
- Common key mappings: `name`, `phone`, `email`, `address`, `service`, `notes`, `budget`, `city`, `zip`
- Build `field_map` object: `{ "Full Name": "name", "Phone Number": "phone", ... }`

**Outputs:**
```json
{
  "field_map": "{\"Full Name\": \"name\", \"Phone Number\": \"phone\"}",
  "tally_fields": ["Full Name", "Phone Number", "Email Address"],
  "required_fields": ["Full Name", "Phone Number", "Service Needed"]
}
```

**Error handling:** throw if `fields` is missing or empty.

## Agent Tool Description

```
Converts the client's desired intake fields into a field_map for storage and a 
Tally field list for form setup. Call this BEFORE create_client. Pass the list 
of fields the client wants to collect from leads (label + required). 
Returns: field_map (pass to create_client and create_lead_sheet), 
tally_fields (show to operator to set up the Tally form).
```

## Changes to Onboarding Agent

Update `create_client` tool description: `field_map` now comes from `generate_field_map` output, not `$fromAI`. Update `create_lead_sheet` same way.

New agent call order:
1. `generate_field_map` ← new, called first after collecting field requirements
2. `create_client` ← receives `field_map` from step 1
3. `create_user`
4. `create_lead_sheet` ← receives `field_map` from step 1
5. `stub_crm_config`
6. `send_welcome_email`
7. `seed_features`
8. `smoke_test`

## Files

- New workflow JSON → `workflows/onboarding-generate-field-map-v1.0.0.json` after prod deploy
- No DB changes needed — `field_map` already stored in `caiac.clients`

## Out of Scope

- Tally API integration (Tally doesn't have a public API for form creation — operator sets it up manually using the `tally_fields` output)
- Validating field labels against an existing Tally form
- CRM-specific field requirements (field_map is client-defined, not CRM-driven)
