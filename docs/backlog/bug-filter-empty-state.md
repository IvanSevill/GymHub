# Bug: Empty state cuando filtros de Workouts no devuelven resultados

**Tipo:** Bug UX  
**Prioridad:** Alta  
**Archivo:** `frontend-react/src/pages/Workouts.tsx:639-696`

## Descripción

Cuando los filtros (músculo, Fitbit) eliminan todos los workouts del historial, la sección simplemente no renderiza nada. No hay ningún mensaje que indique al usuario que su filtro está activo y no tiene resultados. Parece un bug o un estado vacío roto.

## Comportamiento actual

```tsx
// Workouts.tsx
{history.length > 0 && (
  <section>...</section>
)}
// → Si history.length === 0 con filtros activos: NADA se muestra
```

## Fix propuesto

Añadir un estado vacío explícito cuando `history.length === 0` pero hay filtros activos:

```tsx
const hasActiveFilters = selectedMuscles.length > 0 || fitbitOnly;

{history.length === 0 && hasActiveFilters && (
  <div className="glass-card py-16 text-center">
    <Filter size={28} className="mx-auto mb-4 text-slate-600" />
    <h3 className="text-lg font-black text-white mb-2">Sin resultados</h3>
    <p className="text-slate-500 text-sm mb-4">
      No hay entrenamientos que coincidan con los filtros activos.
    </p>
    <button
      onClick={resetFilters}
      className="text-xs text-primary hover:underline font-semibold"
    >
      Limpiar filtros
    </button>
  </div>
)}
```

La función `resetFilters` debería limpiar `selectedMuscles`, `fitbitOnly`, y cualquier otro filtro activo.

## Verificación

1. Activar el filtro "Con datos Fitbit" cuando no hay workouts con Fitbit
2. Debería aparecer el mensaje "Sin resultados" con botón para limpiar filtros
3. Al pulsar "Limpiar filtros", vuelven a aparecer todos los workouts
