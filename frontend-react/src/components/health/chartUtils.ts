export const CHART_TOOLTIP = {
  contentStyle: {
    background: "#0f1729",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#94a3b8", fontSize: 11 },
  itemStyle: { fontWeight: "700", fontSize: "13px" },
};

export const fmtDate = (d: string): string => `${d.slice(8)}/${d.slice(5, 7)}`;

export const xTickInterval = (dataLength: number): number =>
  Math.max(0, Math.ceil(dataLength / 8) - 1);

export const fmtMin = (ms: number): string => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const fmtTime = (iso: string | null): string =>
  iso ? iso.slice(11, 16) : "—";
