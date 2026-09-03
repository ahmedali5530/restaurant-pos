import type {AiChartSpec} from "@/lib/ai/charts.ts";

type ToolResultEntry = {name: string; result: unknown};

const toLineData = (points: Array<{period?: string; date?: string; x?: string; value?: number; y?: number; netSales?: number}>) =>
  points
    .filter(p => p.period || p.date || p.x)
    .map(p => ({
      x: String(p.period ?? p.date ?? p.x ?? ""),
      y: Number(p.value ?? p.y ?? p.netSales ?? 0),
    }));

export const buildAutoChartsFromToolResults = (entries: ToolResultEntry[]): AiChartSpec[] => {
  const charts: AiChartSpec[] = [];
  let chartIndex = 0;

  const nextId = () => `auto-chart-${++chartIndex}`;

  // Use only the latest result per tool to avoid duplicate charts from repeated calls.
  const latestByTool = new Map<string, unknown>();
  for (const {name, result} of entries) {
    latestByTool.set(name, result);
  }

  for (const [name, result] of latestByTool) {
    if (!result || typeof result !== "object") {
      continue;
    }

    const data = result as Record<string, unknown>;

    if (name === "get_time_series" && Array.isArray(data.points)) {
      const lineData = toLineData(data.points as Array<{period: string; value: number}>);
      if (lineData.length) {
        charts.push({
          id: nextId(),
          type: "line",
          title: String(data.metric ?? "Trend").replace(/_/g, " "),
          data: lineData,
          xLabel: "Period",
          yLabel: "Value",
        });
      }
      continue;
    }

    if (name === "get_weekly_sales" && Array.isArray(data.days)) {
      const lineData = toLineData(data.days as Array<{date: string; netSales: number}>);
      if (lineData.length) {
        charts.push({
          id: nextId(),
          type: "line",
          title: "Daily net sales",
          data: lineData,
          xLabel: "Date",
          yLabel: "Net sales",
        });
      }
      continue;
    }

    if (name === "get_top_selling_dishes" && Array.isArray(result)) {
      const dishes = (result as Array<{name: string; revenue: number}>).slice(0, 10);
      if (dishes.length) {
        charts.push({
          id: nextId(),
          type: "bar",
          title: "Top selling dishes",
          data: dishes.map(d => ({x: d.name, y: d.revenue})),
          xLabel: "Dish",
          yLabel: "Revenue",
        });
      }
      continue;
    }

    if (name === "get_sales_summary" && Array.isArray(data.orderTypeBreakdown)) {
      const breakdown = data.orderTypeBreakdown as Array<{label: string; value: number}>;
      if (breakdown.length) {
        charts.push({
          id: nextId(),
          type: "pie",
          title: "Sales by order type",
          data: breakdown.map((row, i) => ({
            id: `slice-${i}`,
            label: row.label,
            value: row.value,
          })),
        });
      }
      continue;
    }

    if (name === "forecast_sales") {
      const history = Array.isArray(data.history)
        ? toLineData(data.history as Array<{period: string; value: number}>)
        : [];
      const forecast = Array.isArray(data.forecast)
        ? toLineData(data.forecast as Array<{period: string; value: number}>)
        : [];
      const combined = [...history, ...forecast];
      if (combined.length) {
        charts.push({
          id: nextId(),
          type: "line",
          title: "Sales forecast",
          data: combined,
          xLabel: "Period",
          yLabel: "Value",
        });
      }
    }
  }

  return charts;
};
