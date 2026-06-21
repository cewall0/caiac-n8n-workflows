## What changed
<!-- 1-3 bullets: what workflow/doc was added or changed and why -->
-

## How to test
<!-- Steps to verify in staging before merging to main -->
- [ ] Tested in staging (flows-staging.caiacdigital.com)
- [ ] Workflow executes without errors
- [ ] Edge cases handled (empty payload, missing fields, auth failure)

## Other repos affected
<!-- Does this require changes in the frontend repos? List them and link the PRs. -->
- [ ] caiac-website — PR: #
- [ ] caiac-client-dashboard — PR: #
- [ ] caiac-ops-dashboard — PR: #
- [ ] None

## Checklist
- [ ] Workflow JSON exported to `workflows/` if deploying to prod
- [ ] Feature flag updated if this is a new billable feature
- [ ] No secrets hardcoded in workflow JSON
- [ ] Error handling node present
- [ ] Sticky note added to workflow canvas
