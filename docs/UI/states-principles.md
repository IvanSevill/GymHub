# States Principles — Component Lifecycle

Every component that loads data from the server must handle exactly four states. Skipping any one causes silent failures or confusing blank screens for the user.

---

## The Four States

| State | When | What to render |
|---|---|---|
| **loading** | Data fetch in progress | Skeleton with the same dimensions as the real content |
| **success** | Data returned and non-empty | The actual content (chart, list, card) |
| **empty** | Fetch succeeded but returned zero records | Icon + short descriptive message + optional CTA |
| **error** | Fetch threw or returned an error | Icon + message + retry button |

**Critical rule:** never swallow errors with `.catch(() => setData([]))`. Empty and error must be distinguishable — the user cannot tell if they have no data or the API is down.

---

## Shared Wrapper Component

Create once, reuse everywhere. Lives at `src/components/ui/ChartStateWrapper.tsx`.

```tsx
type ChartState = "loading" | "success" | "empty" | "error";

interface Props {
  state: ChartState;
  emptyMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export const ChartStateWrapper: React.FC<Props> = ({ state, emptyMessage, onRetry, children }) => {
  if (state === "loading") return <SkeletonChartArea />;

  if (state === "error")
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <AlertCircle size={28} className="text-danger/60" />
        <p className="text-sm text-slate-500">Error al cargar los datos</p>
        {onRetry && (
          <button onClick={onRetry} className="text-xs text-primary hover:underline">
            Reintentar
          </button>
        )}
      </div>
    );

  if (state === "empty")
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <BarChart2 size={28} className="text-slate-700" />
        <p className="text-sm text-slate-500">{emptyMessage ?? "Sin datos para este período"}</p>
      </div>
    );

  return <>{children}</>;
};
```

---

## Deriving State in a Component

```ts
const [data, setData] = useState<T[]>([]);
const [status, setStatus] = useState<ChartState>("loading");

useEffect(() => {
  setStatus("loading");
  fetchData()
    .then((res) => {
      setData(res);
      setStatus(res.length === 0 ? "empty" : "success");
    })
    .catch(() => setStatus("error"));
}, [deps]);
```

---

## Empty State Message Guidelines

- Be specific: say *what* data is missing and *for which context* ("Sin entrenamientos en este período", not just "Sin datos").
- If the component has a pre-selection step (e.g. choosing an exercise), distinguish: "Selecciona un ejercicio para ver su progreso" vs. "Sin datos para este ejercicio en el período".
- For KPI cards with a numeric value, show `—` instead of `0` when data is missing — `0` implies the user trained zero times, `—` implies no data.

---

## Skeleton Design Rule

The skeleton must match the real content's dimensions as closely as possible. A skeleton that collapses to a single line and then expands to a 300px chart on load creates layout shift and feels broken.

```tsx
// Bad — collapses to nothing while loading
{isLoading ? <div>Cargando…</div> : <MyChart data={data} />}

// Good — same height as the chart
{isLoading ? <div className="h-[200px] animate-pulse rounded-lg bg-white/5" /> : <MyChart data={data} />}
```
