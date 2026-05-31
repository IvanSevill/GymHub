# Data Analysis Design Principles — GymHub

Extracted from the Salud dashboard redesign. Use these as a framework to redesign the Análisis de Rendimiento section.

---

## Core philosophy

A data analyst does not show raw numbers in a table. They show:

- **Tendencies** — is it improving or getting worse over time?
- **Distributions** — which days/weeks/exercises are outliers vs. normal?
- **Correlations** — does X relate to Y across time?
- **Actionable summaries** — avg, max, min, % change vs. previous period
- **Anomalies** — values above/below average, visually highlighted

Every chart should answer a specific question the user has, even if they haven't thought to ask it.

---

## Pattern 1 — KPI Cards with period comparison

**What:** 4–6 summary cards. Each shows the current period average and an arrow (↑↓) with % change vs. the previous period of the same length.

**Why it works:** A number alone is meaningless. "8,432 steps/day" is good or bad depending on whether it's better or worse than last month.

**How to implement:**
- Fetch `days * 2` of data from the backend
- Split at `cutoff = today - days` into `current[]` and `prev[]`
- `pctChange = ((avg(current) - avg(prev)) / avg(prev)) * 100`
- If `prev` is empty, show no arrow (no comparison possible)
- For periods ≥ 365 days, skip doubling — no meaningful "previous year" at that scale

```ts
const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const pctChange = (curr: number, prev: number): number | null =>
  prev === 0 ? null : ((curr - prev) / prev) * 100;
```

**Visual design:**
- `glass-card` with `borderLeft: 2px solid <accent-color>`
- Arrow icon: `TrendingUp` (green) / `TrendingDown` (red) from lucide-react
- Subvalue line below (e.g. "Excelente", "Máx: 12,000", "Falta 1.5h para objetivo")
- `motion.div` with staggered `delay: i * 0.07`

**Applied in Salud:** steps avg, calories avg, sleep efficiency avg, sleep hours avg.

**Apply to Análisis:** workouts/week, total volume (kg lifted), avg session duration, PR count this period.

---

## Pattern 2 — Time series trend (AreaChart / LineChart)

**What:** Single metric plotted over time with a dashed ReferenceLine at the period average.

**Why it works:** The eye immediately sees whether values cluster above or below the average, revealing consistent improvement or regression.

**When to use AreaChart vs LineChart:**
- AreaChart: cumulative or volume-type metrics (steps, calories, kg lifted per session)
- LineChart: rate or ratio metrics (efficiency %, heart rate, kg on bar)

**Key implementation details:**
```ts
// X-axis: never show more than ~8 labels regardless of period length
const xInterval = Math.max(0, Math.ceil(data.length / 8) - 1);

// Average reference line
<ReferenceLine y={avg} stroke="#f97316" strokeDasharray="5 4" strokeOpacity={0.5} strokeWidth={1.5} />
```

**Applied in Salud:** daily steps (AreaChart + ReferenceLine).

**Apply to Análisis:**
- Weight progress per exercise already exists (LineChart) — add ReferenceLine at avg and dots on PRs
- Weekly workout count over time (AreaChart) — shows consistency trend

---

## Pattern 3 — Stacked bar (distribution by category over time)

**What:** Each bar = one time unit (day/week). Segments = breakdown by category. Can be absolute (minutes) or percentage (100% stacked).

**When to use 100% stacked:** when the proportion matters more than the absolute value. Example: what fraction of my day was active vs. sedentary?

**When to use absolute stacked:** when both the total and breakdown matter. Example: how long was each sleep stage per night?

**Key detail — pre-compute percentages in the frontend for 100% stacked:**
```ts
const pct = (v: number) => Math.round((v / total) * 100);
// Pass percentages to recharts, format tooltip as "X%"
```

**Applied in Salud:**
- Activity distribution (100% stacked): sedentary / lightly / fairly / very active
- Sleep stages per night (absolute stacked): deep / light / REM / awake

**Apply to Análisis:**
- Volume breakdown per session by muscle group (absolute stacked bar) — reveals which sessions are push-heavy vs. leg-heavy
- Workout type distribution over time: strength / cardio / mobility (100% stacked)

---

## Pattern 4 — Dual Y-axis ComposedChart (correlation)

**What:** Bar chart for one metric + line chart for a correlated metric, sharing the same X axis but with independent Y axes.

**Why it works:** Reveals whether two variables move together. The reader can visually confirm or disprove a hypothesis.

**Classic pairs:**
- Volume this session ↔ weight progression next week (lag correlation)
- Calories burned ↔ resting heart rate over weeks
- Training frequency ↔ strength gain

**Implementation:**
```tsx
<ComposedChart data={data}>
  <YAxis yAxisId="left" />
  <YAxis yAxisId="right" orientation="right" />
  <Bar yAxisId="left" dataKey="volume" />
  <Line yAxisId="right" dataKey="pr" connectNulls={false} />
</ComposedChart>
```

**Null values for missing data points — never use 0:**
```ts
calorias: d.calories_out > 0 ? d.calories_out : null,
fc: d.resting_heart_rate > 0 ? d.resting_heart_rate : null,
```
`connectNulls={false}` leaves gaps in the line instead of interpolating through zero.

**Applied in Salud:** calories burned (bars) + resting HR (line).

**Apply to Análisis:**
- Session volume in kg (bars) + best set weight for selected exercise (line) — shows if volume predicts strength
- Workout count per week (bars) + avg weight on main lift (line) — shows consistency → strength relationship

---

## Pattern 5 — Histogram (frequency distribution)

**What:** Pre-bucket the data into ranges, plot count per bucket as a bar chart.

**Why it works:** Shows whether performance is consistent or highly variable. A narrow histogram = consistent. Wide = erratic.

**Implementation:**
```ts
const buckets = [
  { label: "< 70%", count: 0 },
  { label: "70–79%", count: 0 },
  { label: "80–89%", count: 0 },
  { label: "≥ 90%", count: 0 },
];
data.forEach((d) => {
  if (d.value < 70) buckets[0].count++;
  else if (d.value < 80) buckets[1].count++;
  else if (d.value < 90) buckets[2].count++;
  else buckets[3].count++;
});
```

Use `<Cell>` per bar to assign progressive colors (red → amber → orange → green).

**Applied in Salud:** sleep efficiency distribution across nights.

**Apply to Análisis:**
- Weight lifted distribution per exercise (e.g. "how many sessions at 60kg vs 80kg vs 100kg")
- Session duration distribution (do I consistently train 45–60 min or all over the place?)
- Sets per session histogram

---

## Pattern 6 — Horizontal ranked bar chart

**What:** `BarChart layout="vertical"` — categories on Y axis, value on X axis. Sorted descending.

**Why it works:** Perfect for "top N" rankings where label length varies. Much more readable than vertical bars with rotated labels.

**When to use:** Any "most frequent X" or "highest Y by category" view.

**Already in Análisis:** FrequencyAnalysisCard uses this correctly for muscle/exercise frequency.

**Extend with:**
- Color each bar by rank (top 3 = primary, rest = muted) using `<Cell>`
- Add a small percentage label at the end of each bar
- Add a toggle: "by sets" vs. "by volume (kg)" vs. "by sessions"

---

## Pattern 7 — Progressive disclosure (collapsible raw data)

**What:** Show the analytical view by default. Put raw data tables inside an accordion, collapsed.

**Why:** Tables are useful for the 5% of cases where the user wants to verify a specific number. They should not dominate the layout.

```tsx
<button onClick={() => setOpen(o => !o)}>
  Ver datos detallados ({data.length} registros)
  {open ? <ChevronUp /> : <ChevronDown />}
</button>
{open && <RawDataTable data={data} />}
```

**Applied in Salud:** sleep and daily activity tables are collapsed by default.

**Apply to Análisis:** the current table inside FrequencyAnalysisCard is fine, but consider collapsing the WeightProgressCard's data if a table is ever added.

---

## Pattern 8 — Smart X-axis interval

**What:** Calculate a tick interval so the X axis always shows ~6–8 labels regardless of how much data is in the period.

```ts
const xInterval = Math.max(0, Math.ceil(data.length / 8) - 1);
// 7 days → interval 0 (show every point)
// 30 days → interval 3 (show every 4th)
// 180 days → interval 21 (show every 22nd)
// 365 days → interval 44
```

Pass this to every `<XAxis interval={xInterval} />`.

---

## Pattern 9 — Two-phase loading

**What:** Show cached/DB data immediately on first render. Kick off a background API sync. Refresh UI when sync completes. Never block the charts on the sync.

```ts
setLoading(true);
const cachedData = await fetchFromDB();
setData(cachedData);
setLoading(false); // ← charts visible immediately

if (isFirstLoad) {
  setAutoSyncing(true);
  await syncFromExternalAPI();
  const freshData = await fetchFromDB();
  setData(freshData);
  setAutoSyncing(false);
}
```

**Applied in Salud:** FitbitHealth.tsx — charts appear from DB instantly, Fitbit API syncs in background.

**Apply to Análisis:** if analytics data ever comes from a slow aggregation query, show a stale result immediately and revalidate. TanStack Query's `staleTime` + `refetchOnWindowFocus` handles this automatically.

---

## What the current Análisis section is missing

Compared to a real analytical dashboard, these are the gaps:

| Missing | What it reveals | Chart type |
|---|---|---|
| Workout frequency trend over time | Consistency — am I training more or less than 3 months ago? | AreaChart by week |
| Total volume per session (sets × reps × kg) | Training load trend — overtraining risk | AreaChart |
| Estimated 1RM trend | Strength progress independent of rep scheme | LineChart |
| Muscle balance over time | Push/pull/legs ratio — injury prevention | Stacked 100% BarChart |
| Session duration trend | Efficiency — same or more work in less time? | LineChart |
| PR timeline | Motivational — when did you last hit a PR per exercise? | Scatter or annotated LineChart |
| Period comparison on KPI cards | Are you improving vs. last month? | KPI cards (Pattern 1) |
| Weekly adherence | Consistency score (workouts done / planned) | Heatmap or KPI card |

### Data already available in the backend to build all of these:
- `ExerciseSet`: `exercise_id`, `value` (weight), `measurement` (kg/reps), `is_completed`
- `Workout`: `start_time`, `exercise_sets[]`
- `FitbitData` (on workouts): `calories`, `heart_rate_avg`, `duration_ms`, `azm_*`
- `analyticsService.getWeightProgress(exerciseId, days)` — already returns time series
- `analyticsService.getExerciseFrequency(exerciseId?, days)` — returns set counts

The most impactful additions (highest insight / lowest implementation cost):
1. **KPI cards with period comparison** (Pattern 1) on the existing 5 stats — zero new API calls needed
2. **Weekly workout count AreaChart** — group existing workout dates by ISO week
3. **Volume trend AreaChart** — sum `value * reps` per session from existing data
4. **Muscle balance stacked bar** — use existing frequency data, aggregate by muscle group per week

---

## Pattern 10 — Four-state component lifecycle

**What:** Every chart or data card must handle exactly four states. Missing any one causes silent failures or confusing blank screens.

| State | When | What to render |
|---|---|---|
| **loading** | Data fetch in progress | `SkeletonChartArea` / `SkeletonBlock` — same dimensions as the real chart |
| **success** | Data returned and non-empty | The chart/table |
| **empty** | Fetch succeeded but returned zero records | Icon + short message + optional CTA (e.g. "Registra entrenamientos para ver datos") |
| **error** | Fetch threw or returned an error | Icon + message + retry button; never swallow silently |

**Why it matters:** The current codebase swallows all errors (`catch(() => setData([]))`) which makes empty-state and error-state look identical — the user can't tell whether they have no data or the API is down.

**Implementation pattern — shared wrapper:**
```tsx
// src/components/ui/ChartStateWrapper.tsx
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

**How to derive state in a component:**
```ts
const [data, setData] = useState<T[]>([]);
const [status, setStatus] = useState<"loading" | "success" | "empty" | "error">("loading");

useEffect(() => {
  setStatus("loading");
  fetchData()
    .then((res) => setStatus(res.length === 0 ? "empty" : "success"))
    .catch(() => setStatus("error"))
    .finally(() => setLoading(false));
}, [deps]);
```

**Empty messages by component:**
| Component | Empty message |
|---|---|
| `FrequencyAnalysisCard` | "No hay ejercicios registrados en este período" |
| `WeightProgressCard` (no exercise selected) | "Selecciona un ejercicio para ver su progreso" |
| `WeightProgressCard` (exercise selected, no data) | "Sin datos para este ejercicio en el período" |
| `WorkoutFrequencyChart` | "Sin entrenamientos en este período" |
| `VolumeTrendChart` | "Sin datos de volumen en este período" |
| `DurationHistogram` | "Sin datos de duración en este período" |
| `MuscleBalanceChart` | "Sin datos en este período" |
| `KPICards` | Show `—` instead of `0` to signal missing data |

**Applied in:** Pending — see `docs/backlog/refactor-analytics-4-states.md`.

---

## Recharts component reference (already installed, v3.8.1)

| Use case | Component |
|---|---|
| Trend over time | `AreaChart` + `Area` |
| Rate/ratio trend | `LineChart` + `Line` |
| Category ranking | `BarChart layout="vertical"` + `Bar` |
| Breakdown over time | `BarChart` + stacked `Bar` |
| Correlation (two metrics) | `ComposedChart` + `Bar` + `Line` |
| Two independent Y scales | `YAxis yAxisId="left"` + `YAxis yAxisId="right" orientation="right"` |
| Frequency distribution | `BarChart` + `Bar` + `Cell` per bucket |
| Average reference line | `ReferenceLine y={avg}` |

---

## Design system tokens (Tailwind + inline styles)

```
glass-card          → semi-transparent dark card with border
text-primary        → orange (#f97316)
text-accent/border  → blue (#3b82f6)
text-secondary      → purple (#a855f7)
bg-white/5          → subtle background
border-white/10     → subtle border
text-slate-500      → muted label text

Chart grid:         stroke="rgba(255,255,255,0.04)"
Chart axis tick:    fill: "#475569", fontSize: 10
Chart tooltip bg:   background: "#0f1729"
Chart tooltip border: border: "1px solid rgba(255,255,255,0.08)"
```

Staggered entry animation:
```tsx
<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
```
