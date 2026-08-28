/**
 * Demand Forecast Dashboard — admin panel showing AI-powered 7-day forecast.
 *
 * Shows:
 *   - Weekly summary (total orders, revenue, busiest/quietest day)
 *   - Daily breakdown (orders, peak hour, recommended staff)
 *   - Top items (predicted quantity for 7 days)
 *   - AI insights (staffing + inventory recommendations + trends)
 *   - Generate button (collects data + runs forecast)
 *
 * Research finding: Toast charges $69/mo for "Toast Predict". POSR: $0.
 * This is POSR's key AI differentiator.
 *
 * Placement: new route /reports/forecast or tab in Admin.
 */

import { useState, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { generateDemandForecast, type WeeklyForecast } from "@/lib/demand-forecast.service.ts";

export function DemandForecastScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [forecast, setForecast] = useState<WeeklyForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [useAI, setUseAI] = useState(true);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await generateDemandForecast(db, undefined, useAI);
      setForecast(result);
      toast.success(
        t("reports:forecast.generated", { defaultValue: "Forecast generated for 7 days" })
      );
    } catch (err: any) {
      toast.error(err?.message || t("reports:forecast.failed", { defaultValue: "Failed to generate forecast" }));
    } finally {
      setLoading(false);
    }
  }, [db, useAI, t]);

  return (
    <Layout>
      <DocumentTitle parts={[t("reports:forecast.title", { defaultValue: "Demand Forecast" })]} />
      <div className="p-5 space-y-6" data-testid="demand-forecast-screen">
        {/* Header + generate button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {t("reports:forecast.title", { defaultValue: "AI Demand Forecast" })}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {t("reports:forecast.subtitle", { defaultValue: "7-day prediction based on 90 days of history" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="w-4 h-4"
              />
              {t("reports:forecast.useAI", { defaultValue: "AI insights" })}
            </label>
            <Button variant="primary" onClick={() => void handleGenerate()} disabled={loading}>
              {loading
                ? t("common:actions.processing", { defaultValue: "Processing…" })
                : t("reports:forecast.generate", { defaultValue: "Generate Forecast" })}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20" data-testid="forecast-loading">
            <div className="text-lg text-neutral-400">
              {t("reports:forecast.analyzing", { defaultValue: "Analyzing 90 days of data…" })}
            </div>
          </div>
        )}

        {forecast && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                label={t("reports:forecast.totalOrders", { defaultValue: "Predicted Orders" })}
                value={String(forecast.totalOrders)}
                icon="📦"
              />
              <SummaryCard
                label={t("reports:forecast.totalRevenue", { defaultValue: "Predicted Revenue" })}
                value={String(forecast.totalRevenue)}
                icon="💰"
              />
              <SummaryCard
                label={t("reports:forecast.busiestDay", { defaultValue: "Busiest Day" })}
                value={forecast.busiestDay}
                icon="🔥"
              />
              <SummaryCard
                label={t("reports:forecast.quietestDay", { defaultValue: "Quietest Day" })}
                value={forecast.quietestDay}
                icon="📅"
              />
            </div>

            {/* AI insights */}
            {forecast.aiInsights && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                  ✨ {t("reports:forecast.aiInsights", { defaultValue: "AI Insights" })}
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">{forecast.aiInsights}</p>
              </div>
            )}

            {/* Staffing + inventory recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forecast.staffingRecommendation && (
                <div className="bg-white dark:bg-neutral-900 border rounded-xl p-5">
                  <h3 className="font-semibold mb-2">
                    👥 {t("reports:forecast.staffing", { defaultValue: "Staffing Recommendation" })}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {forecast.staffingRecommendation}
                  </p>
                </div>
              )}
              {forecast.inventoryRecommendation && (
                <div className="bg-white dark:bg-neutral-900 border rounded-xl p-5">
                  <h3 className="font-semibold mb-2">
                    📋 {t("reports:forecast.inventory", { defaultValue: "Inventory Recommendation" })}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {forecast.inventoryRecommendation}
                  </p>
                </div>
              )}
            </div>

            {/* Daily breakdown */}
            <div className="bg-white dark:bg-neutral-900 border rounded-xl p-5">
              <h3 className="font-semibold mb-4">
                {t("reports:forecast.dailyBreakdown", { defaultValue: "Daily Breakdown" })}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="py-2 pr-4">{t("reports:forecast.day", { defaultValue: "Day" })}</th>
                      <th className="py-2 pr-4">{t("reports:forecast.orders", { defaultValue: "Orders" })}</th>
                      <th className="py-2 pr-4">{t("reports:forecast.revenue", { defaultValue: "Revenue" })}</th>
                      <th className="py-2 pr-4">{t("reports:forecast.peakHour", { defaultValue: "Peak Hour" })}</th>
                      <th className="py-2 pr-4">{t("reports:forecast.staff", { defaultValue: "Staff" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.days.map((day) => (
                      <tr key={day.date} className="border-b" data-testid={`forecast-day-${day.date}`}>
                        <td className="py-2 pr-4 font-medium">{day.dayOfWeek}</td>
                        <td className="py-2 pr-4">{day.totalOrders}</td>
                        <td className="py-2 pr-4">{day.totalRevenue}</td>
                        <td className="py-2 pr-4">{day.peakHour}:00 ({day.peakOrders})</td>
                        <td className="py-2 pr-4">
                          <span className="px-2 py-1 bg-primary/10 text-primary rounded font-semibold">
                            {day.recommendedStaff}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top items */}
            <div className="bg-white dark:bg-neutral-900 border rounded-xl p-5">
              <h3 className="font-semibold mb-4">
                {t("reports:forecast.topItems", { defaultValue: "Top Items (7-day prediction)" })}
              </h3>
              <div className="space-y-2">
                {forecast.topItems.map((item, i) => (
                  <div
                    key={item.dishId}
                    className="flex items-center justify-between p-2 border-b"
                    data-testid={`forecast-item-${i}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="font-medium">{item.dishName}</span>
                    </div>
                    <span className="font-bold text-primary">
                      {item.totalQuantity} {t("reports:forecast.units", { defaultValue: "units" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Generated timestamp */}
            <div className="text-xs text-neutral-400 text-center">
              {t("reports:forecast.generatedAt", { defaultValue: "Generated at" })}: {new Date(forecast.generatedAt).toLocaleString()}
            </div>
          </>
        )}

        {!forecast && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="forecast-empty">
            <span className="text-6xl mb-4">📊</span>
            <p className="text-lg text-neutral-400">
              {t("reports:forecast.empty", { defaultValue: "No forecast generated yet" })}
            </p>
            <p className="text-sm text-neutral-300 mt-2">
              {t("reports:forecast.emptyHint", { defaultValue: "Click 'Generate Forecast' to predict demand for the next 7 days" })}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border rounded-xl p-5">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
    </div>
  );
}
