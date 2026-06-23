export type AiChartType = "line" | "bar" | "pie";

export interface AiChartLinePoint {
  x: string;
  y: number;
}

export interface AiChartPiePoint {
  id: string;
  label: string;
  value: number;
}

export interface AiChartSpec {
  id: string;
  type: AiChartType;
  title: string;
  data: AiChartLinePoint[] | AiChartPiePoint[];
  xLabel?: string;
  yLabel?: string;
}

export const isLineData = (data: AiChartSpec["data"]): data is AiChartLinePoint[] =>
  data.length === 0 || ("x" in data[0] && "y" in data[0]);

export const isPieData = (data: AiChartSpec["data"]): data is AiChartPiePoint[] =>
  data.length === 0 || ("label" in data[0] && "value" in data[0]);

export const validateChartSpec = (args: Record<string, unknown>): AiChartSpec => {
  const id = String(args.id ?? `chart-${Date.now()}`);
  const type = args.type as AiChartType;
  const title = String(args.title ?? "Chart");

  if (!["line", "bar", "pie"].includes(type)) {
    throw new Error(`Invalid chart type: ${type}`);
  }

  const rawData = args.data;
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error("Chart data must be a non-empty array.");
  }

  if (type === "pie") {
    const data = rawData.map((row, index) => ({
      id: String((row as {id?: string}).id ?? `slice-${index}`),
      label: String((row as {label?: string; x?: string}).label ?? (row as {x?: string}).x ?? `Item ${index + 1}`),
      value: Number((row as {value?: number; y?: number}).value ?? (row as {y?: number}).y ?? 0),
    }));
    return {id, type, title, data};
  }

  const data = rawData.map(row => ({
    x: String((row as {x?: string; period?: string; label?: string}).x ?? (row as {period?: string}).period ?? (row as {label?: string}).label ?? ""),
    y: Number((row as {y?: number; value?: number}).y ?? (row as {value?: number}).value ?? 0),
  }));

  return {
    id,
    type,
    title,
    data,
    xLabel: args.xLabel ? String(args.xLabel) : undefined,
    yLabel: args.yLabel ? String(args.yLabel) : undefined,
  };
};

const chartFingerprint = (chart: AiChartSpec) =>
  `${chart.type}|${chart.title.trim().toLowerCase()}|${JSON.stringify(chart.data)}`;

export const dedupeCharts = (charts: AiChartSpec[]): AiChartSpec[] => {
  const seen = new Set<string>();
  return charts.filter(chart => {
    const key = chartFingerprint(chart);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
