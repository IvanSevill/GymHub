# Fix: Security Hardening

**Tipo:** Fix  
**Prioridad:** Crítica  
**Estado:** Pendiente

Conjunto de vulnerabilidades detectadas en revisión de código. Se agrupan en un único PR porque son pequeñas y relacionadas — ninguna requiere cambios de arquitectura.

---

## Backend

### 1. `auth.py:16` — Default SECRET_KEY

**Problema:** Si `SECRET_KEY` no está en `.env`, la app arranca con `"your-secret-key-please-change-me"` como clave de firma JWT. Cualquiera que conozca el default puede forjar tokens válidos.

```python
# Actual — peligroso
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-please-change-me")

# Fix
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set")
```

---

### 2. `main.py:21-27` — SQL injection en ALTER TABLE

**Problema:** Los nombres de columna se interpolan directamente en SQL con f-string. Aunque el origen es interno hoy, es un antipatrón que debe eliminarse.

```python
# Actual — peligroso
f"ALTER TABLE exercises ADD COLUMN {col} TEXT"

# Fix — lista blanca explícita de columnas permitidas
ALLOWED_COLUMNS = {"video_url_1", "video_url_2", "image_url"}

for col in ALLOWED_COLUMNS:
    if col not in existing_columns:
        db.execute(text(f"ALTER TABLE exercises ADD COLUMN {col} TEXT"))
```

La interpolación es segura solo porque `col` viene de una constante definida en el propio código, no de input externo — pero debe documentarse explícitamente con la lista blanca para que sea evidente.

---

### 3. `main.py:62-64` — Traceback expuesto al cliente

**Problema:** El handler global de excepciones devuelve el traceback completo en la respuesta HTTP. En producción esto expone rutas de ficheros, nombres de variables internas y detalles de implementación.

```python
# Actual — peligroso en producción
return JSONResponse({"detail": str(exc), "traceback": str(exc)})

# Fix — traceback solo en logs, nunca en la respuesta
logger.exception("Unhandled exception")
return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

---

### 4. `auth_routes.py:139-141` — Credenciales en logs

**Problema:** El string de credenciales Fitbit (base64 de `client_id:client_secret`) puede aparecer en logs de error si la petición falla en ese punto.

**Fix:** Nunca loguear las cabeceras de autorización. Si se necesita debug, loguear solo el `client_id` (no el secret).

---

### 5. `workouts.py:486` — `print()` en producción

**Problema:** Resta señal/ruido a los logs reales y puede exponer información en entornos con log aggregation.

```python
# Actual
print(f"Error updating calendar...")

# Fix
logger.warning("Error updating calendar event: %s", e)
```

---

## Frontend

### 6. XSS vía `user.picture_url`

**Problema:** `Layout.tsx:46`, `Sidebar.tsx:121` y `Settings.tsx:132` renderizan `<img src={user.picture_url}>` sin validar la URL. Un valor malicioso podría ser `javascript:...` o `data:text/html,...`.

**Fix:** Validar antes de renderizar. Añadir una utilidad compartida:

```ts
// src/utils/url.ts
export const safeImageUrl = (url: string | null | undefined): string | undefined =>
  url?.startsWith("https://") ? url : undefined;
```

Aplicar en los tres componentes:
```tsx
<img src={safeImageUrl(user.picture_url)} alt={user.name} />
```

Si `safeImageUrl` devuelve `undefined`, el navegador no carga nada — añadir un fallback de avatar si se quiere.

---

### 7. JWT en `localStorage` — superficie XSS

**Problema:** `AuthContext.tsx:19` y `api.ts:14` guardan el token en `localStorage`. Cualquier script inyectado en la página puede robarlo con `localStorage.getItem('token')`.

**Solución completa (coordinada backend + frontend):** migrar a `httpOnly` cookies gestionadas por el backend. El token nunca toca JavaScript.

**Solución intermedia (solo frontend):** mover el token a una variable en memoria (`useRef` o módulo) que no persiste entre recargas. El usuario tendrá que volver a autenticarse tras cerrar el navegador, pero el token deja de ser accesible desde scripts.

**Archivos afectados:**
- `frontend-react/src/context/AuthContext.tsx`
- `frontend-react/src/services/api.ts`
- `backend/app/auth.py` (si se migra a cookies)
- `backend/app/routers/auth_routes.py` (si se migra a cookies)

**Prioridad dentro de este fix:** implementar al menos la solución intermedia. La migración completa a cookies es un refactor mayor y puede ir en un PR separado.

---

### 8. `App.tsx:132` — Variable de entorno sin validar

**Problema:** `import.meta.env.VITE_GOOGLE_CLIENT_ID` se usa directamente sin comprobar si es `undefined`. Si el `.env` no está configurado, el login falla con un error críptico en lugar de uno claro.

```ts
// Actual
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Fix
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
if (!googleClientId) {
  throw new Error("Missing VITE_GOOGLE_CLIENT_ID — check your .env file");
}
```

---

## Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `backend/app/auth.py` | SECRET_KEY sin fallback + RuntimeError |
| `backend/app/main.py` | Lista blanca ALTER TABLE + traceback eliminado del response |
| `backend/app/routers/auth_routes.py` | No loguear cabeceras de autorización |
| `backend/app/routers/workouts.py` | `print()` → `logger.warning()` |
| `frontend-react/src/utils/url.ts` | Nueva utilidad `safeImageUrl` |
| `frontend-react/src/components/Layout.tsx` | Aplicar `safeImageUrl` |
| `frontend-react/src/components/Sidebar.tsx` | Aplicar `safeImageUrl` |
| `frontend-react/src/pages/Settings.tsx` | Aplicar `safeImageUrl` |
| `frontend-react/src/App.tsx` | Guard en `VITE_GOOGLE_CLIENT_ID` |

---

## Verificación

- Arrancar backend sin `SECRET_KEY` en `.env` → debe lanzar `RuntimeError` y no arrancar
- Arrancar frontend sin `VITE_GOOGLE_CLIENT_ID` → debe mostrar el error en consola al cargar
- Forzar un error 500 en el backend → la respuesta no debe contener traceback ni rutas internas
- Poner un valor `javascript:alert(1)` en `picture_url` (directamente en DB) → el avatar no debe cargar ni ejecutar nada
