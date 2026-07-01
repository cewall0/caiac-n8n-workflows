# GitHub Connection Setup

One-time setup per machine. Do this before your first push.

---

## Option A — SSH Keys (Recommended for devs)

SSH means no passwords or tokens ever. Works permanently once set up.

### 1. Generate a key

Open a terminal and run:
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```
Press Enter through all prompts (default location, no passphrase is fine for a personal machine).

### 2. Copy your public key

**Windows (PowerShell):**
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | clip
```

**Mac/Linux:**
```bash
pbcopy < ~/.ssh/id_ed25519.pub   # Mac
cat ~/.ssh/id_ed25519.pub        # Linux — copy the output manually
```

### 3. Add to GitHub

1. Go to **github.com → Settings → SSH and GPG keys → New SSH key**
2. Title: anything (e.g. "My Laptop")
3. Paste the key → Save

### 4. Switch your repo remotes to SSH

Run this in each repo you work in:
```bash
git remote set-url origin git@github.com:cewall0/caiac-n8n-workflows.git
git remote set-url origin git@github.com:cewall0/caiac-website.git
git remote set-url origin git@github.com:cewall0/caiac-client-dashboard.git
git remote set-url origin git@github.com:cewall0/caiac-ops-dashboard.git
```

### 5. Test it
```bash
ssh -T git@github.com
# Should say: Hi <username>! You've successfully authenticated...
```

After this, `git push` and `git pull` just work — no prompts.

---

## Option B — GitHub Desktop (Recommended for non-CLI users)

GitHub Desktop is a visual app — no terminal needed for branching, committing, and pushing.

1. Download from [desktop.github.com](https://desktop.github.com)
2. Sign in with your GitHub account
3. File → Add Local Repository → point it at the repo folder
4. From there: branch, commit, push, and pull are all buttons

**Best for:** anyone who doesn't work in the terminal regularly.

---

## Option C — Personal Access Token (Quick fallback)

If SSH isn't set up and you need to push now:

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Generate a new token — check **`repo`** scope — set 90-day expiration
3. When git asks for a password, paste the token instead

Windows Git Credential Manager will save it after the first use so you won't be prompted again.

---

## Branch Naming Convention

All feature work goes on `dev` or a branch off `dev`:

```
main     → production (protected — PRs only)
dev      → staging (PRs from feature branches)
feat/*   → new features
fix/*    → bug fixes
hotfix/* → urgent prod fixes (branch off main)
```

Never push directly to `main`. Open a PR to `dev` instead.

---

## First Push on a New Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feat/your-feature
# ... make changes ...
git add .
git commit -m "feat: describe what you did"
git push -u origin feat/your-feature
```

Then open a Pull Request on GitHub from `feat/your-feature` → `dev`.
