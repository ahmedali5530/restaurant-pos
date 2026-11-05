import type {
  BatchTotal,
  Expense,
  ShiftRecap,
  TerminalCash,
  TerminalDenomination,
} from "@/api/model/closing.ts";
import {DENOMINATION_COINS, DENOMINATION_NOTES, formatNumber, safeNumber} from "@/lib/utils.ts";

export type ClosingPrintCell = {
  text: string;
  align: "LEFT" | "RIGHT" | "CENTER";
  width: number;
  style?: string;
};

export type ClosingPrintRow = ClosingPrintCell[];

const blankRow = (): ClosingPrintRow => [{text: " ", align: "LEFT", width: 1}];

const pairRow = (
  label: string,
  value: string | number,
  opts?: {bold?: boolean},
): ClosingPrintRow => [
  {
    text: label,
    align: "LEFT",
    width: 0.6,
    ...(opts?.bold ? {style: "B"} : {}),
  },
  {
    text: typeof value === "number" ? formatNumber(value) : value,
    align: "RIGHT",
    width: 0.4,
    ...(opts?.bold ? {style: "B"} : {}),
  },
];

const threeCol = (
  left: string,
  mid: string,
  right: string,
  opts?: {bold?: boolean},
): ClosingPrintRow => [
  {
    text: left,
    align: "LEFT",
    width: 0.4,
    ...(opts?.bold ? {style: "B"} : {}),
  },
  {
    text: mid,
    align: "RIGHT",
    width: 0.2,
    ...(opts?.bold ? {style: "B"} : {}),
  },
  {
    text: right,
    align: "RIGHT",
    width: 0.4,
    ...(opts?.bold ? {style: "B"} : {}),
  },
];

const fourCol = (
  a: string,
  b: string,
  c: string,
  d: string,
  opts?: {bold?: boolean},
): ClosingPrintRow => [
  {
    text: a,
    align: "LEFT",
    width: 0.34,
    ...(opts?.bold ? {style: "B"} : {}),
  },
  {
    text: b,
    align: "RIGHT",
    width: 0.22,
    ...(opts?.bold ? {style: "B"} : {}),
  },
  {
    text: c,
    align: "RIGHT",
    width: 0.22,
    ...(opts?.bold ? {style: "B"} : {}),
  },
  {
    text: d,
    align: "RIGHT",
    width: 0.22,
    ...(opts?.bold ? {style: "B"} : {}),
  },
];

/** Denomination | Qty | Total for one terminal (zeros omitted). */
export const denominationPrintRows = (
  terminal: TerminalCash,
  denomination: TerminalDenomination | undefined,
): ClosingPrintRow[] => {
  const rows: ClosingPrintRow[] = [
    [
      {
        text: `Cash Denominations — ${terminal.terminal_name}`,
        align: "LEFT",
        width: 1,
        style: "B",
      },
    ],
  ];

  const denoms = denomination ?? {
    notes: {},
    coins: {},
    manual_total: null,
  };

  if (denoms.manual_total != null) {
    rows.push(threeCol("Denomination", "Qty", "Total", {bold: true}));
    rows.push(threeCol("Entered total", "—", formatNumber(safeNumber(denoms.manual_total))));
    rows.push(threeCol("Terminal total", "", formatNumber(terminal.cash_amount), {bold: true}));
    return rows;
  }

  rows.push(threeCol("Denomination", "Qty", "Total", {bold: true}));

  let hasAny = false;
  for (const value of [...DENOMINATION_NOTES].sort((a, b) => b - a)) {
    const qty = Number(denoms.notes?.[String(value)] || 0);
    if (qty <= 0) {
      continue;
    }
    hasAny = true;
    rows.push(
      threeCol(`${value} Notes`, String(qty), formatNumber(value * qty)),
    );
  }
  for (const value of [...DENOMINATION_COINS].sort((a, b) => b - a)) {
    const qty = Number(denoms.coins?.[String(value)] || 0);
    if (qty <= 0) {
      continue;
    }
    hasAny = true;
    rows.push(
      threeCol(`${value} Coins`, String(qty), formatNumber(value * qty)),
    );
  }

  if (!hasAny) {
    rows.push(threeCol("—", "0", formatNumber(0)));
  }

  rows.push(threeCol("Terminal total", "", formatNumber(terminal.cash_amount), {bold: true}));
  return rows;
};

/** Payment | Manual | System | Diff — cash uses counted total as manual. */
export const cashSummaryPrintRows = (input: {
  totalCash: number;
  totalSystemCash: number;
  batchTotals: BatchTotal[];
}): ClosingPrintRow[] => {
  const rows: ClosingPrintRow[] = [
    [{text: "Cash Summary", align: "LEFT", width: 1, style: "B"}],
    fourCol("Payment", "Manual", "System", "Diff", {bold: true}),
  ];

  const cashDiff = input.totalCash - input.totalSystemCash;
  rows.push(
    fourCol(
      "Cash",
      formatNumber(input.totalCash),
      formatNumber(input.totalSystemCash),
      formatNumber(cashDiff),
    ),
  );

  for (const row of input.batchTotals) {
    const manual = Number(row.batch_amount || 0);
    const system = Number(row.system_amount || 0);
    rows.push(
      fourCol(
        row.payment_type_name,
        formatNumber(manual),
        formatNumber(system),
        formatNumber(manual - system),
      ),
    );
  }

  return rows;
};

export const expensePrintRows = (expenses: Expense[], totalExpenses: number): ClosingPrintRow[] => {
  const rows: ClosingPrintRow[] = [
    [{text: "Expenses", align: "LEFT", width: 1, style: "B"}],
  ];
  if (expenses.length === 0) {
    rows.push(pairRow("—", "—"));
  } else {
    for (const expense of expenses) {
      const label = expense.description?.trim() || expense.category || "Expense";
      rows.push(pairRow(label, expense.amount));
    }
  }
  rows.push(pairRow("Expenses total", totalExpenses, {bold: true}));
  return rows;
};

export const shiftRecapPrintRows = (recap: ShiftRecap | null | undefined): ClosingPrintRow[] => {
  if (!recap) {
    return [];
  }
  return [
    blankRow(),
    [{text: "Shift summary", align: "LEFT", width: 1, style: "B"}],
    pairRow("Paid orders", String(recap.paid_orders ?? 0)),
    pairRow("Discounts", recap.discounts ?? 0),
    pairRow("Taxes", recap.tax ?? 0),
    pairRow("Service charges", recap.service_charge ?? 0),
    pairRow("Tips", recap.tips ?? 0),
    pairRow("Voids", recap.voids ?? 0),
    pairRow("Refunds", String(recap.refunds ?? 0)),
  ];
};

export type BuildClosingPrintRowsInput = {
  titleDate: string;
  closingWindowLabel: string;
  closedByLabel?: string;
  previousDayBalance: number;
  pettyCash: number;
  cashDrop: number;
  totalExpenses: number;
  totalCash: number;
  totalSystemCash: number;
  drawerFloat: number;
  terminals: TerminalCash[];
  denominations: Record<string, TerminalDenomination>;
  expenses: Expense[];
  batchTotals: BatchTotal[];
  shiftRecap?: ShiftRecap | null;
};

/** Full thermal closing slip — PDF-aligned sections, all terminals. */
export const buildClosingPrintRows = (input: BuildClosingPrintRowsInput): ClosingPrintRow[] => {
  const rows: ClosingPrintRow[] = [
    [
      {
        text: `CLOSING SUMMARY (${input.titleDate})`,
        align: "CENTER",
        width: 1,
        style: "B",
      },
    ],
    [{text: input.closingWindowLabel, align: "LEFT", width: 1}],
  ];

  if (input.closedByLabel?.trim()) {
    rows.push(pairRow("Closed by", input.closedByLabel.trim()));
  }

  rows.push(blankRow());
  rows.push(pairRow("Previous float", input.previousDayBalance));
  rows.push(pairRow("Petty cash in", input.pettyCash));
  rows.push(pairRow("Expenses", input.totalExpenses));
  rows.push(pairRow("Cash drop", input.cashDrop));
  rows.push(blankRow());

  for (const terminal of input.terminals) {
    rows.push(
      ...denominationPrintRows(terminal, input.denominations[terminal.terminal_id]),
    );
    rows.push(blankRow());
  }

  rows.push(...expensePrintRows(input.expenses, input.totalExpenses));
  rows.push(blankRow());
  rows.push(
    ...cashSummaryPrintRows({
      totalCash: input.totalCash,
      totalSystemCash: input.totalSystemCash,
      batchTotals: input.batchTotals,
    }),
  );
  rows.push(blankRow());
  rows.push(pairRow("Counted cash", input.totalCash, {bold: true}));
  rows.push(pairRow("Cash left for next shift", input.drawerFloat, {bold: true}));
  rows.push(...shiftRecapPrintRows(input.shiftRecap));

  return rows;
};
