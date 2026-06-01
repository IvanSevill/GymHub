# Bug: Fitbit toggle visual desplazado

**Tipo:** Bug visual  
**Prioridad:** Alta  
**Archivo:** `frontend-react/src/pages/Workouts.tsx:554-557`

## Descripción

El toggle "Con datos Fitbit" muestra el círculo desplazado a la derecha (posición ON) cuando el estado es OFF. La funcionalidad es correcta; el problema es únicamente visual.

## Código afectado

```tsx
<span
  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
    fitbitOnly ? "translate-x-5" : "translate-x-0.5"
  }`}
/>
```

## Causa probable

En Tailwind v4, `translate-x-0.5` (= 2px) puede no aplicarse correctamente si falta `left-0` en el span absoluto, haciendo que el elemento herede una posición base errónea. Sin `left-0` explícito, el span absolute puede no empezar desde el borde izquierdo del botón.

## Fix propuesto

Añadir `left-0` al span para anclar el punto de partida:

```tsx
<span
  className={`absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${
    fitbitOnly ? "translate-x-5" : "translate-x-0.5"
  }`}
/>
```

Si el problema persiste, cambiar `translate-x-0.5` por `translate-x-[2px]` para forzar el valor exacto.

## Verificación

1. Abrir Entrenamientos → Filtros
2. El toggle debe mostrar el círculo a la IZQUIERDA (posición inactiva) al cargar
3. Al pulsar, el círculo se desplaza a la DERECHA y el fondo cambia a `bg-primary`
