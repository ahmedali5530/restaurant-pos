import {ResponsiveBar} from "@nivo/bar";
import {ResponsiveLine} from "@nivo/line";
import {ResponsivePie} from "@nivo/pie";
import type {AiChartSpec} from "@/lib/ai/charts.ts";
import {dedupeCharts, isLineData, isPieData} from "@/lib/ai/charts.ts";

const CHART_HEIGHT = 320;

const chartTheme = {
  axis: {
    ticks: {
      text: {fill: "#525252", fontSize: 11},
    },
    legend: {
      text: {fill: "#525252", fontSize: 12},
    },
  },
  grid: {
    line: {stroke: "#e5e5e5"},
  },
};

interface AiReportChartsProps {
  charts: AiChartSpec[];
}

export const AiReportCharts = ({charts}: AiReportChartsProps) => {
  const uniqueCharts = dedupeCharts(charts);

  if (!uniqueCharts.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {uniqueCharts.map(chart => (
        <div key={chart.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-neutral-800">{chart.title}</h3>
          <div style={{height: CHART_HEIGHT}}>
            {chart.type === "pie" && isPieData(chart.data) && (
              <ResponsivePie
                data={chart.data}
                margin={{top: 20, right: 20, bottom: 20, left: 20}}
                innerRadius={0.5}
                padAngle={1}
                cornerRadius={3}
                colors={{scheme: "nivo"}}
                enableArcLinkLabels={false}
                arcLabelsSkipAngle={10}
              />
            )}
            {chart.type === "line" && isLineData(chart.data) && (
              <ResponsiveLine
                data={[{id: chart.title, data: chart.data.map(d => ({x: d.x, y: d.y}))}]}
                margin={{top: 20, right: 20, bottom: 50, left: 60}}
                xScale={{type: "point"}}
                yScale={{type: "linear", min: "auto", max: "auto"}}
                axisBottom={{
                  legend: chart.xLabel,
                  legendOffset: 36,
                  tickRotation: -35,
                }}
                axisLeft={{
                  legend: chart.yLabel,
                  legendOffset: -48,
                }}
                colors={{scheme: "nivo"}}
                pointSize={6}
                useMesh
                theme={chartTheme}
              />
            )}
            {chart.type === "bar" && isLineData(chart.data) && (
              <ResponsiveBar
                data={chart.data.map(d => ({label: d.x, value: d.y}))}
                keys={["value"]}
                indexBy="label"
                margin={{top: 20, right: 20, bottom: 80, left: 60}}
                padding={0.3}
                colors={{scheme: "nivo"}}
                colorBy="indexValue"
                axisBottom={{
                  legend: chart.xLabel,
                  legendOffset: 60,
                  tickRotation: -35,
                }}
                axisLeft={{
                  legend: chart.yLabel,
                  legendOffset: -48,
                }}
                theme={chartTheme}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
