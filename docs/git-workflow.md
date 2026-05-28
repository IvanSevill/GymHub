# Git Workflow — GymHub

## Resumen del modelo de ramas

```
main        ← rama de producción. Solo recibe merges desde develop en forma de releases.
  └── develop   ← rama de integración. Aquí se acumulan las features listas.
        └── feat/<nombre>   ← una rama por feature, nace de develop y muere al mergear.
```

Reglas absolutas:
- **Nunca** se hace commit directo a `main` ni a `develop`.
- `main` y `develop` son ramas protegidas — todo cambio entra por Pull Request.
- Una feature se mergea a `develop`, nunca directamente a `main`.
- `main` solo avanza cuando se hace una release (merge de `develop` → `main`).

---

## Ciclo de vida de una feature

### 1. Crear la rama desde `develop`

```powershell
git checkout develop
git pull                          # asegura que develop está al día
git checkout -b feat/<nombre>     # nombra la rama por lo que hace, no por quién la hace
```

Convención de nombres:

| Tipo | Prefijo | Ejemplo |
|---|---|---|
| Nueva funcionalidad | `feat/` | `feat/analytics-redesign` |
| Corrección de bug | `fix/` | `fix/fitbit-token-refresh` |
| Refactor sin cambio de comportamiento | `refactor/` | `refactor/workout-service` |
| Documentación | `docs/` | `docs/api-reference` |
| Estilos / UI sin lógica | `style/` | `style/dashboard-spacing` |
| Chore (deps, config, CI) | `chore/` | `chore/update-dependencies` |

### 2. Desarrollar la feature

- Haz commits atómicos con **Conventional Commits**: `<tipo>(<scope>): <descripción corta>`
- Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`
- Scopes habituales: `backend`, `frontend`, `auth`, `workouts`, `exercises`, `analytics`, `ui`

```
feat(analytics): add KPI cards with period comparison
fix(backend): handle null fitbit duration in summary endpoint
refactor(frontend): extract PeriodSelector to shared component
```

- Ejecuta las verificaciones obligatorias antes de cada push:
  ```powershell
  # Backend (tras editar .py)
  cd backend && ruff check .

  # Frontend (tras editar .ts/.tsx)
  cd frontend-react && npx prettier --write <archivo> && npx tsc --noEmit
  ```

### 3. Push y apertura del PR

```powershell
git push -u origin feat/<nombre>
gh pr create --base develop --title "<tipo>(<scope>): <descripción>" --body "..."
```

El cuerpo del PR debe incluir siempre:
- **Summary**: qué cambia y por qué.
- **Test plan**: checklist de qué verificar antes de mergear.

### 4. Revisión y merge

- El PR se revisa (auto-revisión si trabajas solo, o revisión de compañero en equipo).
- Una vez aprobado, se mergea con **merge commit** (no squash ni rebase) para preservar el historial.
- La rama feature se elimina al mergear (`--delete-branch`).

```powershell
gh pr merge <número> --merge --delete-branch
```

### 5. Actualizar local tras el merge

```powershell
git checkout develop
git pull
```

---

## Releases: merge de `develop` → `main`

Una release ocurre cuando `develop` acumula suficientes features listas para producción.

```powershell
# 1. Asegúrate de que develop está al día y los tests pasan
git checkout develop && git pull

# 2. Abre el PR de release
gh pr create --base main --head develop --title "release: v<X.Y.Z> — <descripción breve>"

# 3. Tras revisión y aprobación, mergea
gh pr merge <número> --merge

# 4. Etiqueta el commit de release en main
git checkout main && git pull
git tag -a v<X.Y.Z> -m "release: v<X.Y.Z> — <descripción>"
git push origin v<X.Y.Z>

# 5. Actualiza develop para que quede igual que main
git checkout develop && git merge main --ff-only
git push origin develop
```

Después de una release, `develop` y `main` apuntan exactamente al mismo commit. Las nuevas features siempre se ramifican desde ese punto.

---

## Regla de sincronización post-release

Tras publicar una release, antes de abrir cualquier feature nueva:

```powershell
git checkout develop && git pull    # develop == main
git checkout -b feat/<nueva-feature>
```

Esto garantiza que todas las features nuevas nacen del código de producción más reciente.

---

## Diagrama de flujo completo

```
main ─────────────────────────────────────────●─────────────────────────────→
                                              ↑ PR release vX.Y.Z
develop ──────────────────────●──────────────●─────────────────────────────→
                              ↑ PR feat/B    ↑ PR feat/C
feat/A ──────●
             ↓ PR feat/A mergeado antes
feat/B ──────────────────────●
feat/C ────────────────────────────────────────●
```

---

## Comandos de referencia rápida

```powershell
# Ver estado de PRs abiertos
gh pr list

# Ver el PR de la rama actual
gh pr view

# Ver el log del branch actual vs develop
git log --oneline develop..HEAD

# Ver qué ramas existen (locales y remotas)
git branch -a

# Eliminar ramas locales ya mergeadas
git branch --merged develop | Where-Object { $_ -notmatch "main|develop|master" } | ForEach-Object { git branch -d $_.Trim() }
```

---

## Lo que NO se hace

| Prohibido | Por qué |
|---|---|
| `git push --force` en `main` o `develop` | Destruye historial compartido |
| Commit directo a `main` o `develop` | Salta la revisión y el CI |
| Mergear una feature directamente a `main` | Rompe el modelo de integración |
| Ramas de larga duración sin mergear | Genera conflictos enormes |
| Squash en releases (`develop` → `main`) | Pierde el historial de features individuales |
