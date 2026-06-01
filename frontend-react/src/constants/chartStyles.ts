// Shared Recharts tooltip and axis config used across all chart components
export const CHART_TOOLTIP_CONFIG = {
  contentStyle: {
    background: "#0f1729",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#94a3b8", fontSize: 11 },
  itemStyle: { fontWeight: "700", fontSize: "13px" },
};

export const AXIS_TICK_STYLE = {
  fill: "#475569",
  fontSize: 10,
  fontWeight: "bold" as const,
};
