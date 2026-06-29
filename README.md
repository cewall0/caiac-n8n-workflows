# caiac-n8n-workflows

Central hub for CAIAC platform automation — n8n workflows, backend logic, and cross-repo planning. This is the primary working directory for the platform.

**n8n instances:** staging (`flows-staging.caiacdigital.com`) · prod (`flows.caiacdigital.com`)

---

## Platform Repos

The CAIAC platform spans 4 repos. Clone all of them as siblings into the same folder, then open the workspace file.

| Repo | What it is |
|---|---|
| `caiac-n8n-workflows` | This repo — automation hub |
| `caiac-website` | Marketing site (caiacdigital.com) |
| `caiac-client-dashboard` | Client portal (*.caiacdigital.com) |
| `caiac-ops-dashboard` | Internal ops tool (ops.caiacdigital.com) |

### First-Time Workspace Setup

```bash
# Create a caiac folder and clone all 4 repos into it
mkdir caiac && cd caiac
git clone git@github.com:cewall0/caiac-n8n-workflows.git
git clone git@github.com:cewall0/caiac-website.git
git clone git@github.com:cewall0/caiac-client-dashboard.git
git clone git@github.com:cewall0/caiac-ops-dashboard.git
```

Then open `caiac.code-workspace` in VS Code — all 4 repos load as a single multi-root workspace.

> **New to GitHub?** See [GITHUB_SETUP.md](GITHUB_SETUP.md) for SSH key setup and branch conventions before your first push.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching strategy, commit format, and PR process.

For n8n workflow standards, deploy process, and MCP setup see [CLAUDE.md](CLAUDE.md).
