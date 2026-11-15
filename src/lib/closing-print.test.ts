import {describe, expect, it} from "vitest";
import {
  buildClosingPrintRows,
  cashSummaryPrintRows,
  denominationPrintRows,
} from "@/lib/closing-print.ts";

describe("closing-print", () => {
  it("prints denomination rows for a terminal and skips zero qty", () => {
    const rows = denominationPrintRows(
      {terminal_id: "t1", terminal_name: "Terminal 1", cash_amount: 20410},
      {
        notes: {"5000": 4, "1000": 0, "100": 4, "50": 1, "10": 1},
        coins: {"2": 4, "1": 1, "5": 0},
      },
    );

    const texts = rows.map((row) => row.map((c) => c.text).join("|"));
    expect(texts[0]).toContain("Cash Denominations — Terminal 1");
    expect(texts.some((t) => t.includes("5000 Notes") && t.includes("4"))).toBe(true);
    expect(texts.some((t) => t.includes("1000 Notes"))).toBe(false);
    expect(texts.some((t) => t.includes("Terminal total"))).toBe(true);
  });

  it("prints entered total when manual_total is set", () => {
    const rows = denominationPrintRows(
      {terminal_id: "t2", terminal_name: "Bar", cash_amount: 500},
      {notes: {}, coins: {}, manual_total: 500},
    );
    const flat = rows.flatMap((r) => r.map((c) => c.text)).join(" ");
    expect(flat).toContain("Entered total");
    expect(flat).toContain("Bar");
  });

  it("builds cash summary with cash + batch diffs", () => {
    const rows = cashSummaryPrintRows({
      totalCash: 23469,
      totalSystemCash: 8467.6,
      batchTotals: [
        {
          payment_type_id: "pt:card",
          payment_type_name: "Credit Card",
          system_amount: 96136.2,
          batch_amount: 96145,
        },
      ],
    });
    const flat = rows.flatMap((r) => r.map((c) => c.text)).join(" | ");
    expect(flat).toContain("Cash Summary");
    expect(flat).toContain("Cash");
    expect(flat).toContain("Credit Card");
  });

  it("includes a denomination block per terminal in the full slip", () => {
    const rows = buildClosingPrintRows({
      titleDate: "2026-11-05",
      closingWindowLabel: "Cycle 06:00–05:59",
      previousDayBalance: 15000,
      pettyCash: 0,
      cashDrop: 0,
      totalExpenses: 0,
      totalCash: 300,
      totalSystemCash: 200,
      drawerFloat: 300,
      terminals: [
        {terminal_id: "t1", terminal_name: "Terminal 1", cash_amount: 100},
        {terminal_id: "t2", terminal_name: "Terminal 2", cash_amount: 200},
      ],
      denominations: {
        t1: {notes: {"100": 1}, coins: {}},
        t2: {notes: {"100": 2}, coins: {}},
      },
      expenses: [],
      batchTotals: [],
      shiftRecap: {
        paid_orders: 3,
        discounts: 0,
        tax: 10,
        service_charge: 0,
        tips: 0,
        voids: 0,
        refunds: 0,
      },
    });

    const headers = rows
      .map((r) => r[0]?.text ?? "")
      .filter((t) => t.startsWith("Cash Denominations"));
    expect(headers).toEqual([
      "Cash Denominations — Terminal 1",
      "Cash Denominations — Terminal 2",
    ]);
    expect(rows.some((r) => r[0]?.text === "Shift summary")).toBe(true);
  });
});
