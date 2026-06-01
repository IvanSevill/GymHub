# CLAUDE.md

Behavioral guidance for Claude Code. Reference docs live in `docs/`.

---

## Project

**GymHub** — personal fitness platform for tracking workouts, planning routines, and visualizing analytics. Integrates with Google Calendar and Fitbit.

---

## Commands

### Backend

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
ruff check .
ruff check --fix .
```

### Frontend

```powershell
cd frontend-react
npm install
npm run dev
npm run build
npx prettier --write <file>
npx tsc --noEmit
```

---

## Mandatory Post-Edit Verification

**Never finish a turn without running these:**

| File type | Command |
|---|---|
| `.py` | `cd backend && ruff check .` — fix all issues before concluding |
| `.ts` / `.tsx` / `.js` / `.jsx` | `npx prettier --write <file>` |
| After significant frontend changes | `npx tsc --noEmit` |

If a check fails, investigate and fix autonomously — do not leave a failing state.

---

## Git Workflow

Full guide: `docs/git-workflow.md`.

### Rules

- Every change — regardless of type or size — goes through a PR into `develop`. No direct commits, ever.
- Branch prefix follows the commit type: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `perf/`, `style/`.
- Merges use `--no-ff` to preserve branch history. Never squash or rebase.
- Branches are deleted after merge.
- `main` only receives release merges from `develop`, tagged with a version.
- After each release, a separation commit is made on `develop` to start the next cycle.

---

## Versioning

Follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`) with this project-specific rule:

| Change | Version bump |
|---|---|
| New feature | `1.X.Y` → `1.X.Y+1` (patch) |
| Bug fix / chore / docs | `1.X.Y` → `1.X.Y+1` (patch) |
| Significant refactor | `1.X.Y` → `1.X+1.0` (minor, patch resets to 0) |
| Breaking change | `1.X.Y` → `2.0.0` (major) |

A refactor qualifies as **significant** when it restructures a core area of the codebase (e.g. rewrites a full page, replaces a shared pattern across multiple components, or changes a backend module's architecture). A single-file cleanup does not qualify.

---

## Commit Style

**Conventional Commits:** `<type>(<scope>): <short description>`

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Restructure without behavior change |
| `test` | Adding or fixing tests |
| `chore` | Deps, config, tooling, CI |
| `perf` | Performance improvement |
| `revert` | Reverts a previous commit |

Scopes: `backend`, `frontend`, `auth`, `workouts`, `exercises`, `analytics`, `calendar`, `health`, `database`, `ui`

---

## Pull Request Structure

Every PR description must include:

```markdown
## Summary
- Bullet list of what changed and why.

## Test plan
- [ ] Specific thing to verify
- [ ] Another thing to verify
```

Additional sections when relevant: **Screenshots** (UI changes), **Related Issues** (`Closes #123`).

Keep PRs small and focused. If a feature is large, split it: backend API first, then frontend.

---

## Key Conventions

- All docstrings and comments must be in **English**.
- SOLID principles and Clean Code are mandatory.
- Never hardcode secrets — always read from `.env` via `python-dotenv` or `import.meta.env`.
- Use parameterized queries (SQLAlchemy ORM) — never raw string SQL.
- OS: **Windows**, shell: **PowerShell**. Use PowerShell syntax in all scripts.
- Validate input at system boundaries (user input, external APIs). Trust internal code and framework guarantees.
- External image URLs rendered in `<img src>` must be validated to start with `https://` before use.
- **4-state component lifecycle (mandatory):** every component that loads data from the server must handle `loading`, `success`, `empty`, and `error`. See `docs/UI/`.

---

## End-of-Session Checklist

- Update `docs/architecture.md` to reflect any new files, routes, components, or routers added during the session.

---

## Reference Docs

| Doc | Purpose |
|---|---|
| `docs/architecture.md` | Repository structure, backend modules, frontend pages and components |
| `docs/environment.md` | All environment variables for backend and frontend |
| `docs/UI/` | UI/UX development principles — consult before building any interface component |
| `docs/new-implementations/` | Brainstorming and full specs for pending features and refactors |
