# CLAUDE.md

Guidance for Claude Code when working in this repository. This is the single source of truth — all other docs live in `docs/`.

---

## Project

**GymHub** — personal fitness platform for tracking workouts, planning routines, and visualizing analytics. Integrates with Google Calendar and Fitbit.

**Owner:** Iván Jesús Sevillano — 3rd-year Software Engineering student (University of Seville / Erasmus at University of Pannonia).

---

## Repository Structure

```
backend/            FastAPI backend (Python)
frontend-react/     React/Vite frontend (TypeScript)
docs/               Design docs, workflow guides, principles
```

---

## Commands

### Backend

```powershell
cd backend
pip install -r requirements.txt          # install deps
uvicorn app.main:app --reload            # dev server
ruff check .                             # lint — run after EVERY .py edit
ruff check --fix .                       # auto-fix lint issues
```

### Frontend

```powershell
cd frontend-react
npm install                              # install deps
npm run dev                              # dev server → http://localhost:5173
npm run build                            # tsc + vite build
npx prettier --write <file>             # format — run after EVERY .ts/.tsx edit
npx tsc --noEmit                         # type check
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

## Environment Setup

`backend/.env` (copy from `backend/.env.example`):
- `DATABASE_URL` — `sqlite:///./test.db` for dev, PostgreSQL URL for prod
- `SECRET_KEY` — JWT signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth + Calendar
- `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` — Fitbit integration
- `FRONTEND_URL` — CORS origin (default `http://localhost:5173`)
- `ROOT_EMAILS` — comma-separated admin emails

`frontend-react/.env`:
- `VITE_GOOGLE_CLIENT_ID`

---

## Architecture

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app, CORS middleware, global exception handler, router registration.
- **`database.py`** — SQLAlchemy engine (SQLite dev / PostgreSQL prod), `get_db` session dependency.
- **`models.py`** — ORM models: `User`, `UserTokens` (Google + Fitbit tokens), `Workout`, `Muscle`, `Exercise`, `ExerciseSet`, `FitbitData`. All PKs are UUID strings.
- **`schemas.py`** — Pydantic request/response schemas.
- **`auth.py`** — JWT creation/verification, `get_current_user` / `get_root_user` FastAPI dependencies, Google OAuth flow.
- **`calendar_utils.py`** — Parse and generate Google Calendar event descriptions for workouts.
- **`fitbit_utils.py`** — Fitbit OAuth token refresh and activity data fetching.
- **`routers/`** — `auth_routes.py`, `workouts.py`, `exercises.py`, `analytics.py`.

### Frontend (`frontend-react/src/`)

- **`App.tsx`** — React Router setup with `ProtectedRoute` (redirects to `/login` if unauthenticated).
- **`context/AuthContext.tsx`** — Auth state: JWT stored in `localStorage`, `useAuth()` hook.
- **`services/`** — Axios-based API clients: `api.ts` (base client), `auth.ts`, `workout.ts`, `exercise.ts`, `analytics.ts`.
- **`pages/`** — Dashboard, Login, Workouts, Calendar, Analytics, Settings, ParserTest, StandardizeExercises.
- **`components/`** — `Layout.tsx` (wraps all authenticated pages), `Sidebar.tsx`.
- **`components/analytics/`** — KPICards, WeightProgressCard, FrequencyAnalysisCard, WorkoutFrequencyChart, VolumeTrendChart.

Key libraries: TanStack Query (server state), Recharts v3 (charts), Framer Motion (animations), Tailwind CSS v4, Lucide React (icons).

---

## Git Workflow

Full guide: `docs/git-workflow.md`. Summary below.

### Branch model

```
main        ← production only. Receives merges from develop via release PRs.
  └── develop   ← integration. Receives feature merges. Always ahead of main.
        └── feat/<name>   ← one branch per feature, born from develop, dies on merge.
```

### Feature lifecycle

```powershell
# 1. Start from develop
git checkout develop && git pull
git checkout -b feat/<name>

# 2. Develop, commit with Conventional Commits
# 3. Push and open PR targeting develop
git push -u origin feat/<name>
gh pr create --base develop --title "feat(<scope>): ..."

# 4. Merge with --no-ff (preserves branch lane in git graph) and delete branch
gh pr merge <n> --merge --delete-branch
```

**Critical rules:**
- Always `--no-ff` merges — never fast-forward. Feature branches must appear as a distinct lane in the git graph.
- After every release (when `develop == main`), create a separation commit on develop before opening any feature:
  ```powershell
  git commit --allow-empty -m "chore(develop): begin vX.Y.Z development cycle"
  git push origin develop
  ```
- Never commit directly to `main` or `develop`.

### Release (develop → main)

```powershell
gh pr create --base main --head develop --title "release: vX.Y.Z — <description>"
gh pr merge <n> --merge
git checkout main && git pull
git tag -a vX.Y.Z -m "release: vX.Y.Z"
git push origin vX.Y.Z
# Immediately separate develop from main for the next cycle:
git checkout develop && git merge main --ff-only
git commit --allow-empty -m "chore(develop): begin vX.Y.(Z+1) development cycle"
git push origin develop
```

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

Scopes: `backend`, `frontend`, `auth`, `workouts`, `exercises`, `analytics`, `database`, `ui`

Examples:
```
feat(analytics): add KPI cards with period comparison
fix(backend): handle null fitbit duration in summary endpoint
chore(develop): begin v1.1.0 development cycle
```

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
- Security: validate input at system boundaries (user input, external APIs). Trust internal code and framework guarantees.

---

## Design Docs

| Doc | Purpose |
|---|---|
| `docs/git-workflow.md` | Full git branching guide with diagrams and command reference |
| `docs/data-analysis-design-principles.md` | 9 analytical chart patterns extracted from the Salud dashboard redesign — use when building analytics views |
