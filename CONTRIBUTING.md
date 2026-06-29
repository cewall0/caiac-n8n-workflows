# Contributing to caiac-n8n-workflows

## First Time? Start Here
**[GITHUB_SETUP.md](GITHUB_SETUP.md)** — SSH keys, GitHub Desktop, and branch naming. Read this before your first push.

---

## Team
- `@cewall0` — infrastructure, DB, Cloudflare, repo admin
- `@lukesgray` — primary dev, n8n workflows, feature builds

Questions? Ping in Slack or check the plan doc in `.claude/plans/` for the feature you're working on.

---

## Branching Strategy

```
main  ──── production (n8n prod instance: flows.caiacdigital.com)
  └── dev ─ staging  (n8n staging:         flows-staging.caiacdigital.com)
        ├── feat/description
        ├── fix/description
        ├── chore/description
        └── docs/description

hotfix/* ── branches off main → PR to main → backmerge to dev
```

- **Always branch off `dev`**, not `main`
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/` + short kebab-case description
- Hotfixes that need to hit prod immediately: branch off `main`, PR to `main`, then open a second PR to merge into `dev`

---

## Commit Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add lead scoring workflow
fix: correct webhook path for contact form
chore: update workflow JSON from staging
docs: add branching strategy to CONTRIBUTING
```

Scopes (optional but encouraged):
```
feat(intake): add qualification step
fix(auth): handle token expiry on chat endpoint
```

---

## Making a Change

1. `git checkout dev && git pull origin dev`
2. `git checkout -b feat/your-feature`
3. Make changes — workflow JSON lives in `workflows/`, docs in `docs/`
4. Commit with a meaningful message (see format above)
5. Open a PR to `dev`
6. Get 1 approval, CI green → merge
7. When ready for prod: open a PR from `dev` → `main`

---

## Pull Request Process

- Fill in the PR template — it takes 2 minutes and prevents "what does this do?" review comments
- **If your change touches other repos**, list them in the PR description and link the related PRs
- Cross-repo features: the plan doc in `.claude/plans/` is the source of truth for what's done and what's left
- Tag `@cewall0` for anything touching DB schema, Cloudflare config, or infrastructure
- Tag `@lukesgray` for workflow logic, n8n builds, and feature flags

---

## n8n Workflow Rules

- Never edit workflows directly in the n8n UI — Claude via MCP is the only write path
- Always build and test in staging first; never write directly to prod
- Workflow JSON exported from staging goes in `workflows/` before prod deploy
- See [CLAUDE.md](CLAUDE.md) for full workflow standards and deploy process

---

## What Needs Review
- Any new workflow that touches billing or client data → both reviewers
- Feature flag additions → both reviewers (they affect all clients)
- Hotfixes to prod → `@cewall0` must approve before merge to `main`
