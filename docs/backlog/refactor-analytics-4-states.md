# Refactor: 4 estados en todos los componentes de Analytics

**Tipo:** Refactor + Bug fix  
**Prioridad:** Alta  
**Archivos:** `frontend-react/src/components/analytics/`

## Problema

Todos los componentes de analytics tienen un patrón defectuoso:

```ts
.catch(() => setData([]))  // ← error silencioso, parece "sin datos"
```

Esto hace que un error de red sea indistinguible de "no hay datos para este período". El usuario no puede saber si hay un problema o si simplemente no tiene entrenamientos.

Además, `FrequencyAnalysisCard` no tiene empty state explícito, y `WeightProgressCard` no distingue el estado inicial ("selecciona un ejercicio") del estado "ejercicio seleccionado pero sin datos".

## Patrón a implementar

Ver **Pattern 10** en `docs/data-analysis-design-principles.md` para el patrón completo con código.

### Componente compartido a crear

`frontend-react/src/components/ui/ChartStateWrapper.tsx`

```tsx
type ChartState = "loading" | "success" | "empty" | "error";

interface Props {
  state: ChartState;
  emptyMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}
```

### Cambios por componente

| Componente | Estado vacío | Cambio principal |
|---|---|---|
| `FrequencyAnalysisCard` | "No hay ejercicios registrados en este período" | Añadir empty + error state |
| `WeightProgressCard` | "Selecciona un ejercicio" (inicial) / "Sin datos en el período" (sin datos) | Distinguir 2 empty states |
| `WorkoutFrequencyChart` | Ya tiene empty | Añadir error state visible |
| `VolumeTrendChart` | Ya tiene empty | Añadir error state visible |
| `MuscleBalanceChart` | Ya tiene empty | Añadir error state visible |
| `DurationHistogram` | Ya tiene empty | Añadir error state visible |
| `KPICards` | Mostrar `—` en lugar de `0` | Añadir error state visible |

### Estado de error estándar

```tsx
<div className="flex flex-col items-center gap-3 py-12 text-center">
  <AlertCircle size={28} className="text-danger/60" />
  <p className="text-sm text-slate-500">Error al cargar los datos</p>
  <button onClick={onRetry} className="text-xs text-primary hover:underline">
    Reintentar
  </button>
</div>
```

## Estrategia de implementación

1. Crear `ChartStateWrapper.tsx`
2. Aplicar a `FrequencyAnalysisCard` primero (más urgente — sin empty state)
3. Aplicar a `WeightProgressCard` (distinguir estado inicial vs sin datos)
4. Aplicar al resto de componentes en una sola pasada

## Verificación

- Desconectar red → todos los charts muestran error con botón "Reintentar"
- Sin entrenamientos → charts muestran mensaje vacío apropiado
- Normal → charts funcionan igual que antes
