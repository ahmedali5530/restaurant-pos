import {describe, expect, it} from "vitest";
import {combineLiftPcts, weatherLifts} from "@/api/reports/demand/context.ts";
import {
  extractLocalEventsFromPrompt,
  isInventoryNeedPrompt,
  isStaffNeedPrompt,
} from "@/lib/ai/demand-query.ts";
import {isInventoryConsumptionForecastPrompt} from "@/lib/ai/forecast-query.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

describe("isInventoryNeedPrompt", () => {
  it("detects this Friday purchase questions", () => {
    expect(isInventoryNeedPrompt("How much inventory do I need this Friday and what should I buy?")).toBe(true);
  });

  it("detects next-days need with an inline event", () => {
    expect(
      isInventoryNeedPrompt("Forecast inventory needed for the next 7 days — cricket final on Saturday, expect 30% busier"),
    ).toBe(true);
  });

  it("does not treat consumption trend forecasts as need", () => {
    const prompt = "Forecast inventory consumption for the next 14 days";
    expect(isInventoryNeedPrompt(prompt)).toBe(false);
    expect(isInventoryConsumptionForecastPrompt(prompt)).toBe(true);
  });

  it("does not treat generic inventory reports as need", () => {
    expect(isInventoryNeedPrompt("Which inventory items are below reorder level?")).toBe(false);
    expect(isInventoryNeedPrompt("Inventory purchase movements this week")).toBe(false);
  });
});

describe("isStaffNeedPrompt", () => {
  it("detects named-day staff need", () => {
    expect(isStaffNeedPrompt("How many staff do I need this Friday?")).toBe(true);
  });

  it("does not treat labor cost reports as staff need", () => {
    expect(isStaffNeedPrompt("Labor cost percentage vs sales by hour for last Friday")).toBe(false);
    expect(isStaffNeedPrompt("Labor cost trend for the last 30 days")).toBe(false);
  });
});

describe("selectToolsForPrompt demand forecasts", () => {
  it("includes forecast_inventory_need only for need prompts", () => {
    const need = "How much inventory do I need this Friday and what should I buy?";
    expect(toolNames(need)).toContain("forecast_inventory_need");
    expect(selectToolsForPrompt(need, "table", [], true).domains).toEqual(
      expect.arrayContaining(["inventory", "analysis"]),
    );

    expect(toolNames("Which inventory items are below reorder level?")).not.toContain("forecast_inventory_need");
  });

  it("includes forecast_staff_need only for staff-need prompts", () => {
    const need = "How many staff do I need this Friday?";
    expect(toolNames(need)).toContain("forecast_staff_need");
    expect(selectToolsForPrompt(need, "table", [], true).domains).toEqual(
      expect.arrayContaining(["labor", "analysis"]),
    );

    expect(toolNames("Labor cost as a percentage of net sales this week")).not.toContain("forecast_staff_need");
  });
});

describe("extractLocalEventsFromPrompt", () => {
  it("extracts cricket final, Saturday, and 30% lift", () => {
    const events = extractLocalEventsFromPrompt(
      "Forecast inventory needed for the next 7 days — cricket final on Saturday, expect 30% busier",
    );
    expect(events).toHaveLength(1);
    expect(events[0].name.toLowerCase()).toContain("cricket");
    expect(events[0].liftPct).toBe(30);
    expect(events[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty when the prompt has no event", () => {
    expect(extractLocalEventsFromPrompt("How much inventory do I need this Friday?")).toEqual([]);
  });
});

describe("demand multipliers", () => {
  it("caps combined lifts at 1.5", () => {
    expect(combineLiftPcts([20, 20, 10, 10])).toBe(1.5);
    expect(combineLiftPcts([20])).toBe(1.2);
  });

  it("applies rain and extreme temperature lifts", () => {
    const rain = weatherLifts({date: "2026-08-21", precipitationMm: 12, summary: "Rain"});
    expect(rain.some(driver => driver.liftPct === 10 && /rain|precipitation/i.test(driver.detail || driver.name))).toBe(true);

    const heat = weatherLifts({date: "2026-08-21", tempMax: 38, tempMin: 28});
    expect(heat.some(driver => driver.name === "Extreme heat")).toBe(true);
  });
});
