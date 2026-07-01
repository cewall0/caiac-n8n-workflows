# Session End

End-of-session reconciliation. Audits what changed, updates all living docs, and surfaces anything that needs attention before the next session.

**Usage:** `/session-end`

Run this at the end of any session that: built or deployed a workflow, ran a migration, created/closed PRs, or changed any plan status.

---

## Steps

### 1. What changed this session?
Scan git log since session start (last push before this session):
```bash
git log origin/dev..HEAD --oneline
```
Categorize each commit:
- `deploy` — a workflow was pushed to prod
- `fix` — a bug was fixed on prod
- `sync` — a workflow JSON was exported from prod
- `chore` — plan/doc cleanup
- `feat/improve` — new capability added (staging or prod)

### 2. Update `docs/prod-state.md`
For each deploy/fix commit:
- Remove the deployed workflow from "Staged But Not On Prod"
- Remove fixed bugs from "Known Prod Bugs"
- Add newly discovered bugs to "Known Prod Bugs"
- Add any new staging-only workflows to "Staged But Not On Prod"
- Update "Pending Deactivation" if old versions were cleaned up

Update the "Last updated" date at the top.

### 3. Update `CLAUDE.md` "Current Focus"
- Reflect what's actually next based on what was completed
- Keep it to 3 bullets max
- Update the "Active Plans" table status/next-action columns

### 4. Check for broken prod (quick audit)
Run `mcp__n8n-prod__n8n_health_check`. If workflows were deployed or migrations were run:
- Check `mcp__n8n-prod__n8n_executions` on affected workflows — look for error executions in the last hour
- If errors found: add to "Known Prod Bugs" in prod-state.md, add to OPEN_ITEMS

### 5. Prune OPEN_ITEMS
- Remove any items that were resolved this session
- Add any new blocked items discovered this session (but only genuinely blocked ones — not work Claude could do now)

### 6. Check for half-finished work
For each feature touched this session, verify:
- [ ] If a workflow was deployed to prod → does `workflows/README.md` have the prod ID?
- [ ] If a staging workflow was built → is it in prod-state.md "Staged But Not On Prod"?
- [ ] If frontend code was written → is there a PR, or is it listed in prod-state.md "Pending Frontend PRs"?
- [ ] If a plan phase was completed → is the plan status updated?

Flag anything incomplete. Offer to finish it before ending the session.

### 7. Report
```
## Session End — [date]

### What shipped
- [list deploys, fixes, migrations]

### Docs updated
- docs/prod-state.md — [what changed]
- CLAUDE.md — [what changed]
- OPEN_ITEMS.md — [added/removed N items]

### Broken on prod
- [any known prod bugs]

### Half-finished (needs follow-up)
- [anything that was built but not deployed/PR'd]

### Next session: start with
- [the single most important thing to do first]
```
