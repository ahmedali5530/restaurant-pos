import {Layout} from "@/screens/partials/layout.tsx";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {Button} from "@/components/common/input/button.tsx";
import {DENOMINATION_COINS, DENOMINATION_NOTES, formatNumber, toRecordId, withCurrency, safeNumber} from "@/lib/utils.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faPrint, faSave, faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  Closing as ClosingModel,
  Expense,
  PaymentSummary,
  BatchTotal,
  ShiftRecap,
  OpenCheckRow,
  TerminalCash,
  TerminalDenomination
} from "@/api/model/closing.ts";
import {PaymentType} from "@/api/model/payment_type.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {nanoid} from "nanoid";
import {toast} from "sonner";
import {Input} from "@/components/common/input/input.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import ScrollContainer from "react-indiana-drag-scroll";
import {nowSurrealDateTime, toSurrealDateTime} from "@/lib/datetime.ts";
import {DateTime as LuxonDateTime} from "luxon";
import {appPage} from "@/store/jotai.ts";
import {useAtom} from "jotai";
import {dispatchPrint} from "@/lib/print.service.ts";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import {ClosingCycleWindow, resolveClosingWindow} from "@/lib/closing-cycle.ts";
import {
  getCurrentCycleClosing,
  getPreviousClosingBalance,
  hasOpenOrdersInCurrentCycle,
  listOpenOrdersInCurrentCycle,
} from "@/lib/closing.guard.ts";
import {aggregateAppliedPaymentsByTypeId, isCashPaymentType} from "@/lib/order.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from "react-i18next";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { publishDayClosed } from "@/integrations/events/publish/ops.ts";
import { entityAfterWrite } from "@/integrations/events/publish/entity.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import {OrderStatus} from "@/api/model/order.ts";

const DEFAULT_TERMINALS: TerminalCash[] = [
  {terminal_id: "terminal_1", terminal_name: "Terminal 1", cash_amount: 0},
];

const DEFAULT_CLOSING_WINDOW: ClosingCycleWindow = {
  date_from: new Date(),
  date_to: new Date(),
};

const createEmptyDenomination = (): TerminalDenomination => ({
  notes: DENOMINATION_NOTES.reduce((acc, value) => {
    acc[String(value)] = 0;
    return acc;
  }, {} as Record<string, number>),
  coins: DENOMINATION_COINS.reduce((acc, value) => {
    acc[String(value)] = 0;
    return acc;
  }, {} as Record<string, number>),
});

const normalizeDenominationValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
};

const normalizeTerminalDenomination = (input?: Partial<TerminalDenomination>): TerminalDenomination => {
  const empty = createEmptyDenomination();
  return {
    notes: Object.keys(empty.notes).reduce((acc, denomination) => {
      acc[denomination] = normalizeDenominationValue(input?.notes?.[denomination]);
      return acc;
    }, {} as Record<string, number>),
    coins: Object.keys(empty.coins).reduce((acc, denomination) => {
      acc[denomination] = normalizeDenominationValue(input?.coins?.[denomination]);
      return acc;
    }, {} as Record<string, number>),
  };
};

export const Closing = () => {
  const {t} = useTranslation(["closing", "toast", 'common']);
  const {t: tNav} = useTranslation('navigation');
  const db = useDB();
  const [page] = useAtom(appPage);
  const {protectAction} = useSecurity();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingClosing, setExistingClosing] = useState<ClosingModel | null>(null);
  const [isClosingCompleted, setIsClosingCompleted] = useState(false);

  // Scopes the closing record to the logged-in user's shift so a second
  // shift starting a closing the same day gets its own record instead of
  // continuing (and overwriting) the first shift's.
  const currentShiftId = page.user?.user_shift?.id
    ? recordIdToString(page.user.user_shift.id)
    : null;

  const {data: paymentTypesData} = useApi<SettingsData<PaymentType>>(
    Tables.payment_types,
    ['deleted_at = none'],
    ["priority asc"]
  );
  const paymentTypes = paymentTypesData?.data || [];
  const [closingWindow, setClosingWindow] = useState<ClosingCycleWindow>(DEFAULT_CLOSING_WINDOW);
  const [cycleEnabled, setCycleEnabled] = useState(true);

  const [previousDayBalance, setPreviousDayBalance] = useState<number>(0);
  const [pettyCash, setPettyCash] = useState<number>(0);
  const [cashDrop, setCashDrop] = useState<number>(0);
  const [varianceReason, setVarianceReason] = useState<string>("");
  const [batchAmounts, setBatchAmounts] = useState<Record<string, number>>({});
  const [openChecks, setOpenChecks] = useState<OpenCheckRow[]>([]);
  const [shiftRecap, setShiftRecap] = useState<ShiftRecap | null>(null);
  const [closedByLabel, setClosedByLabel] = useState<string>("");
  const [terminalCash, setTerminalCash] = useState<TerminalCash[]>(DEFAULT_TERMINALS);
  const [terminalDenominations, setTerminalDenominations] = useState<Record<string, TerminalDenomination>>({});
  const [paymentSummaries, setPaymentSummaries] = useState<PaymentSummary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [notes, setNotes] = useState<string>("");

  const today = LuxonDateTime.now().toFormat(import.meta.env.VITE_DATE_FORMAT);
  const closingWindowLabel = useMemo(() => {
    const start = LuxonDateTime.fromJSDate(closingWindow.date_from).toFormat("dd LLL yyyy, hh:mm a");
    const end = LuxonDateTime.fromJSDate(closingWindow.date_to).toFormat("dd LLL yyyy, hh:mm a");
    const prefix = cycleEnabled ? t("closing:window.cycle") : t("closing:window.period");
    return t("closing:window.label", {prefix, start, end});
  }, [closingWindow.date_from, closingWindow.date_to, cycleEnabled, t]);

  const getTerminalAmount = useCallback((terminalId: string) => {
    const terminal = terminalDenominations[terminalId];
    if (!terminal) return 0;

    const notesAmount = Object.entries(terminal.notes).reduce((sum, [denomination, qty]) => {
      return sum + Number(denomination) * Number(qty || 0);
    }, 0);
    const coinsAmount = Object.entries(terminal.coins).reduce((sum, [denomination, qty]) => {
      return sum + Number(denomination) * Number(qty || 0);
    }, 0);
    return notesAmount + coinsAmount;
  }, [terminalDenominations]);

  const computedTerminalCash = useMemo(() => {
    return terminalCash.map(terminal => ({
      ...terminal,
      cash_amount: getTerminalAmount(terminal.terminal_id),
    }));
  }, [getTerminalAmount, terminalCash]);

  const shiftFilterSql = currentShiftId
    ? `AND (cashier.user_shift = $shiftId OR user.user_shift = $shiftId)`
    : "";

  const fetchCyclePayments = useCallback(async () => {
    try {
      const [result] = await db.query(`
          SELECT payments
          FROM order
          WHERE created_at >= $start
            AND created_at <= $end
            AND status = 'Paid'
            ${shiftFilterSql}
              FETCH payments
              , payments.payment_type
      `, {
        start: toSurrealDateTime(closingWindow.date_from),
        end: toSurrealDateTime(closingWindow.date_to),
        ...(currentShiftId ? {shiftId: toRecordId(currentShiftId)} : {}),
      });

      return aggregateAppliedPaymentsByTypeId((result as any[]) ?? []);
    } catch (error) {
      console.error("Error fetching closing-window payments:", error);
      return new Map<string, number>();
    }
  }, [closingWindow.date_from, closingWindow.date_to, currentShiftId, shiftFilterSql]);

  const fetchShiftRecap = useCallback(async (): Promise<ShiftRecap> => {
    const empty: ShiftRecap = {
      discounts: 0,
      tax: 0,
      service_charge: 0,
      tips: 0,
      voids: 0,
      refunds: 0,
      paid_orders: 0,
    };
    try {
      const params = {
        start: toSurrealDateTime(closingWindow.date_from),
        end: toSurrealDateTime(closingWindow.date_to),
        ...(currentShiftId ? {shiftId: toRecordId(currentShiftId)} : {}),
      };

      const [paidAgg] = await db.query(`
        SELECT
          math::sum(discount_amount ?? 0) AS discounts,
          math::sum(tax_amount ?? 0) AS tax,
          math::sum(service_charge_amount ?? 0) AS service_charge,
          math::sum(tip_amount ?? 0) AS tips,
          count() AS paid_orders
        FROM ${Tables.orders}
        WHERE created_at >= $start
          AND created_at <= $end
          AND status = $paid
          ${shiftFilterSql}
        GROUP ALL
      `, {...params, paid: OrderStatus.Paid});

      const paidRow = Array.isArray(paidAgg) ? paidAgg[0] as any : null;

      const [voidRows] = await db.query(`
        SELECT quantity, order_item.price AS item_price, order_item.quantity AS item_qty
        FROM ${Tables.order_voids}
        WHERE created_at >= $start AND created_at <= $end
      `, params);

      const voidsTotal = (Array.isArray(voidRows) ? voidRows : []).reduce((sum: number, row: any) => {
        const qty = safeNumber(row.quantity ?? 1);
        const price = safeNumber(row.item_price ?? 0);
        return sum + qty * price;
      }, 0);

      const [refundAgg] = await db.query(`
        SELECT count() AS refunds
        FROM ${Tables.order_refunds}
        WHERE created_at >= $start AND created_at <= $end
        GROUP ALL
      `, params);
      const refundRow = Array.isArray(refundAgg) ? refundAgg[0] as any : null;

      return {
        discounts: safeNumber(paidRow?.discounts),
        tax: safeNumber(paidRow?.tax),
        service_charge: safeNumber(paidRow?.service_charge),
        tips: safeNumber(paidRow?.tips),
        voids: voidsTotal,
        refunds: safeNumber(refundRow?.refunds),
        paid_orders: safeNumber(paidRow?.paid_orders),
      };
    } catch (error) {
      console.error("Error fetching shift recap:", error);
      return empty;
    }
  }, [closingWindow.date_from, closingWindow.date_to, currentShiftId, shiftFilterSql]);

  const hydrateTerminals = useCallback((source: ClosingModel | null) => {
    const sourceTerminals = source?.terminal_cash && source.terminal_cash.length > 0
      ? source.terminal_cash
      : DEFAULT_TERMINALS;

    const normalizedTerminals = sourceTerminals.map((terminal, index) => ({
      terminal_id: terminal.terminal_id || `terminal_${index + 1}`,
      terminal_name: terminal.terminal_name || t("closing:terminal.defaultName", {number: index + 1}),
      cash_amount: 0,
    }));
    setTerminalCash(normalizedTerminals);

    const sourceDenominations = source?.denominations || {};
    const normalizedDenominations = normalizedTerminals.reduce((acc, terminal) => {
      const existing = sourceDenominations?.[terminal.terminal_id];
      acc[terminal.terminal_id] = normalizeTerminalDenomination(existing);
      return acc;
    }, {} as Record<string, TerminalDenomination>);
    setTerminalDenominations(normalizedDenominations);
  }, [t]);

  const hydratePayments = useCallback(async () => {
    const systemPayments = await fetchCyclePayments();
    setPaymentSummaries(paymentTypes.map(pt => ({
      payment_type: pt,
      amount: systemPayments.get(String(pt.id)) ?? 0,
    })));
  }, [fetchCyclePayments, paymentTypes]);

  const loadClosingData = useCallback(async () => {
    if (paymentTypes.length === 0) return;

    setLoading(true);
    try {
      const resolvedWindow = await resolveClosingWindow(db, new Date());
      const cycleClosing = await getCurrentCycleClosing(db, new Date(), currentShiftId);
      setExistingClosing(cycleClosing);
      setIsClosingCompleted(cycleClosing?.status === "completed");

      const carriedBalance = cycleClosing?.status === "completed"
        ? Number(cycleClosing.previous_day_balance ?? 0)
        : await getPreviousClosingBalance(db, resolvedWindow.window, cycleClosing?.id);
      setPreviousDayBalance(carriedBalance);
      setPettyCash(Number(cycleClosing?.cash_added ?? 0));
      setCashDrop(Number(cycleClosing?.cash_withdrawn ?? 0));
      setVarianceReason(cycleClosing?.variance_reason || "");
      setExpenses(cycleClosing?.expenses_data || []);
      setNotes(cycleClosing?.notes || "");

      const storedBatches = cycleClosing?.batch_totals || [];
      const batchMap: Record<string, number> = {};
      for (const row of storedBatches) {
        batchMap[String(row.payment_type_id)] = Number(row.batch_amount || 0);
      }
      setBatchAmounts(batchMap);

      const closedBy = cycleClosing?.closed_by as { first_name?: string; last_name?: string; login?: string } | undefined;
      if (closedBy && typeof closedBy === "object") {
        const name = [closedBy.first_name, closedBy.last_name].filter(Boolean).join(" ").trim();
        setClosedByLabel(name || closedBy.login || "");
      } else {
        setClosedByLabel("");
      }

      hydrateTerminals(cycleClosing);
      await hydratePayments();

      if (cycleClosing?.status === "completed" && cycleClosing.shift_recap) {
        setShiftRecap(cycleClosing.shift_recap);
      } else {
        setShiftRecap(await fetchShiftRecap());
      }

      const open = await listOpenOrdersInCurrentCycle(db);
      setOpenChecks(open);
    } catch (error) {
      console.error("Error loading closing data:", error);
      toast.error(t("toast:closing.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [hydratePayments, hydrateTerminals, paymentTypes.length, currentShiftId, fetchShiftRecap, t]);

  const refreshClosingWindow = useCallback(async () => {
    const resolved = await resolveClosingWindow(db, new Date());
    setClosingWindow(resolved.window);
    setCycleEnabled(resolved.cycleEnabled);
    return resolved;
  }, []);

  useEffect(() => {
    void refreshClosingWindow();
  }, [refreshClosingWindow]);

  useEffect(() => {
    void loadClosingData();
  }, [paymentTypes.length, closingWindow.date_from.getTime(), closingWindow.date_to.getTime()]);

  const totalCash = useMemo(() => {
    return computedTerminalCash.reduce((sum, terminal) => sum + terminal.cash_amount, 0);
  }, [computedTerminalCash]);

  const totalSystemCash = useMemo(() => {
    return paymentSummaries
      .filter(ps => isCashPaymentType(ps.payment_type))
      .reduce((sum, ps) => sum + ps.amount, 0);
  }, [paymentSummaries]);

  const nonCashSummaries = useMemo(() => {
    return paymentSummaries.filter(ps => !isCashPaymentType(ps.payment_type));
  }, [paymentSummaries]);

  const totalOtherPayments = useMemo(() => {
    return nonCashSummaries.reduce((sum, ps) => sum + ps.amount, 0);
  }, [nonCashSummaries]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses]);

  /** Expected cash in the drawer (cash only — cards stay out). */
  const expectedInDrawer = useMemo(() => {
    return previousDayBalance + totalSystemCash + pettyCash - totalExpenses - cashDrop;
  }, [previousDayBalance, totalSystemCash, pettyCash, totalExpenses, cashDrop]);

  /** Counted cash vs expected. */
  const overShort = useMemo(() => {
    return totalCash - expectedInDrawer;
  }, [totalCash, expectedInDrawer]);

  /** Cash left for the next shift after the drop. */
  const drawerFloat = useMemo(() => {
    return totalCash - cashDrop;
  }, [totalCash, cashDrop]);

  const batchTotals = useMemo((): BatchTotal[] => {
    return nonCashSummaries.map(ps => {
      const id = String(ps.payment_type.id);
      return {
        payment_type_id: id,
        payment_type_name: ps.payment_type.name,
        system_amount: ps.amount,
        batch_amount: Number(batchAmounts[id] ?? 0),
      };
    });
  }, [nonCashSummaries, batchAmounts]);

  const isReadOnly = isClosingCompleted;

  const updateTerminalDenomination = (
    terminalId: string,
    type: "notes" | "coins",
    denomination: number,
    value: number
  ) => {
    if (isReadOnly) return;

    setTerminalDenominations(prev => {
      const current = normalizeTerminalDenomination(prev[terminalId]);
      return {
        ...prev,
        [terminalId]: {
          ...current,
          [type]: {
            ...current[type],
            [String(denomination)]: normalizeDenominationValue(value),
          }
        }
      };
    });
  };

  const addTerminal = () => {
    if (isReadOnly) return;

    const terminalId = nanoid();
    setTerminalCash(prev => [
      ...prev,
      {
        terminal_id: terminalId,
        terminal_name: t("closing:terminal.defaultName", {number: prev.length + 1}),
        cash_amount: 0,
      }
    ]);
    setTerminalDenominations(prev => ({
      ...prev,
      [terminalId]: createEmptyDenomination(),
    }));
  };

  const removeTerminal = (id: string) => {
    if (isReadOnly) return;

    setTerminalCash(prev => prev.filter(terminal => terminal.terminal_id !== id));
    setTerminalDenominations(prev => {
      const next = {...prev};
      delete next[id];
      return next;
    });
  };

  const addExpense = () => {
    if (isReadOnly) return;

    setExpenses(prev => [
      ...prev,
      {
        id: nanoid(),
        description: "",
        amount: 0,
        category: ""
      }
    ]);
  };

  const updateExpense = (id: string, field: keyof Expense, value: string | number) => {
    if (isReadOnly) return;

    setExpenses(prev =>
      prev.map(expense =>
        expense.id === id
          ? {...expense, [field]: value}
          : expense
      )
    );
  };

  const removeExpense = (id: string) => {
    if (isReadOnly) return;
    setExpenses(prev => prev.filter(expense => expense.id !== id));
  };

  const buildClosingPrintRows = () => {
    return [
      [{text: `CLOSING SUMMARY (${today})`, align: "CENTER", width: 1, style: "B"}],
      [{text: closingWindowLabel, align: "LEFT", width: 1}],
      [{text: " ", align: "LEFT", width: 1}],
      [{text: "Previous float", align: "LEFT", width: 0.6}, {
        text: formatNumber(previousDayBalance),
        align: "RIGHT",
        width: 0.4
      }],
      [{text: "Cash sales", align: "LEFT", width: 0.6}, {
        text: formatNumber(totalSystemCash),
        align: "RIGHT",
        width: 0.4
      }],
      [{text: "Petty cash in", align: "LEFT", width: 0.6}, {
        text: formatNumber(pettyCash),
        align: "RIGHT",
        width: 0.4
      }],
      [{text: "Expenses", align: "LEFT", width: 0.6}, {
        text: formatNumber(totalExpenses),
        align: "RIGHT",
        width: 0.4
      }],
      [{text: "Cash drop", align: "LEFT", width: 0.6}, {
        text: formatNumber(cashDrop),
        align: "RIGHT",
        width: 0.4
      }],
      [{text: "Expected in drawer", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(expectedInDrawer),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: "Counted cash", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(totalCash),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: "Over / short", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(overShort),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: "Cash left for next shift", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(drawerFloat),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: " ", align: "LEFT", width: 1}],
      [{text: "Terminal Cash", align: "LEFT", width: 0.6, style: "B"}, {
        text: "Amount",
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      ...computedTerminalCash.map(terminal => ([
        {text: terminal.terminal_name, align: "LEFT", width: 0.6},
        {text: formatNumber(terminal.cash_amount), align: "RIGHT", width: 0.4}
      ])),
      [{text: " ", align: "LEFT", width: 1}],
      [{text: "Non-cash (system)", align: "LEFT", width: 0.6, style: "B"}, {
        text: "Batch",
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      ...batchTotals.map(row => ([
        {text: `${row.payment_type_name} (${formatNumber(row.system_amount)})`, align: "LEFT", width: 0.6},
        {text: formatNumber(row.batch_amount), align: "RIGHT", width: 0.4}
      ])),
      [{text: "Other Payments", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(totalOtherPayments),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
    ];
  };

  const saveClosing = async (complete = false) => {
    if (isReadOnly) {
      toast.info(t("toast:closing.alreadyClosed"));
      return;
    }

    setSaving(true);
    try {
      if (complete) {
        if (openChecks.length > 0 || await hasOpenOrdersInCurrentCycle(db)) {
          const open = await listOpenOrdersInCurrentCycle(db);
          setOpenChecks(open);
          toast.error(t("toast:closing.openOrders"));
          return;
        }
        if (Math.abs(overShort) > 0.009 && !varianceReason.trim()) {
          toast.error(t("closing:alerts.varianceReasonRequired"));
          return;
        }
      }

      const resolved = await resolveClosingWindow(db, new Date());
      const windowForSave = resolved.window;
      const recap = shiftRecap || await fetchShiftRecap();

      const closingData: Omit<ClosingModel, "id" | "shift" | "closed_by"> & {
        shift?: unknown;
        closed_by?: unknown;
      } = {
        date_from: windowForSave.date_from,
        date_to: windowForSave.date_to,
        cash_added: pettyCash,
        cash_withdrawn: cashDrop,
        drawer_float: drawerFloat,
        closing_balance: drawerFloat,
        denominations: terminalDenominations,
        terminal_cash: computedTerminalCash,
        payments_data: paymentSummaries,
        batch_totals: batchTotals,
        shift_recap: recap,
        variance_reason: varianceReason.trim() || null,
        expenses_data: expenses,
        expenses: totalExpenses,
        notes,
        created_at: existingClosing?.created_at || nowSurrealDateTime(),
        status: complete ? "completed" : "draft",
        previous_day_balance: previousDayBalance,
        total_cash: totalCash,
        total_other_payments: totalOtherPayments,
        net_amount: drawerFloat,
        ...(currentShiftId ? {shift: toRecordId(currentShiftId)} : {}),
        ...(complete ? {
          closed_at: nowSurrealDateTime(),
          closed_by: page.user?.id ? toRecordId(page.user.id) : undefined,
        } : {}),
      };

      if (existingClosing?.id) {
        await db.update(existingClosing.id, closingData);
      } else {
        await db.create(Tables.closings, closingData);
      }

      const closingId = existingClosing?.id
        ? String(existingClosing.id)
        : Tables.closings;

      await entityAfterWrite({
        domain: 'ops',
        table: Tables.closings,
        entityId: closingId,
        action: complete ? 'status_change' : existingClosing?.id ? 'update' : 'create',
        after: {
          status: closingData.status,
          net_amount: closingData.net_amount,
        },
        source: 'closing',
      });

      if (complete) {
        await publishDayClosed(undefined, {
          closingId,
          businessDate: windowForSave.date_to
            ? new Date(windowForSave.date_to).toISOString()
            : undefined,
          totals: {
            net_amount: Number(drawerFloat) || 0,
            total_cash: Number(totalCash) || 0,
            total_other_payments: Number(totalOtherPayments) || 0,
            expenses: Number(totalExpenses) || 0,
          },
        });
      }

      toast.success(complete ? t("toast:closing.completed") : t("toast:closing.savedDraft"));
      await refreshClosingWindow();
      await loadClosingData();
    } catch (error) {
      console.error("Error saving closing:", error);
      toast.error(t("toast:closing.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const reopenClosing = async () => {
    if (!existingClosing?.id) {
      toast.error(t("toast:closing.notFound"));
      return;
    }

    setSaving(true);
    try {
      await db.update(existingClosing.id, {
        status: "draft",
        closed_at: null,
      });
      toast.success(t("toast:closing.reopened"));
      await loadClosingData();
    } catch (error) {
      console.error("Failed to reopen closing:", error);
      toast.error(t("toast:closing.reopenFailed"));
    } finally {
      setSaving(false);
    }
  };

  const printClosing = async () => {
    await dispatchPrint(db, PRINT_TYPE.summary, {
      printType: "table",
      rows: buildClosingPrintRows(),
      cut: true,
    }, {userId: page?.user?.id});
  };

  if (loading) {
    return (
      <Layout overflowHidden>
        <DocumentTitle parts={[tNav('sidebar.closing')]} />
        <div data-testid="closing-page" className="h-[calc(100vh_-_30px_-_var(--app-toolbar-h))] flex justify-center items-center text-xl font-semibold">
          {t("closing:loading")}
        </div>
      </Layout>
    );
  }

  return (
    <Layout overflowHidden>
      <DocumentTitle parts={[tNav('sidebar.closing')]} />
      <ScrollContainer className="overflow-y-auto h-[calc(100vh_-_30px_-_var(--app-toolbar-h))] select-none">
        <div className="p-6" data-testid="closing-page">
          <h1 className="text-3xl font-bold mb-3 text-center">{t("closing:title", {date: today})}</h1>
          <div className="text-center mb-6 text-sm text-muted">{closingWindowLabel}</div>

          {!cycleEnabled && (
            <div className="alert alert-warning mb-6 bg-surface-elevated">
              {t("closing:alerts.cycleDisabled")}
            </div>
          )}

          {cycleEnabled && isClosingCompleted && (
            <div className="alert alert-success mb-6 bg-surface-elevated">
              {t("closing:alerts.cycleCompleted")}
            </div>
          )}

          {!cycleEnabled && isClosingCompleted && (
            <div className="alert alert-success mb-6 bg-surface-elevated">
              {t("closing:alerts.periodCompleted")}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-surface-elevated rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">{t("closing:sections.previousDayBalance")}</h2>
              <div>
                <Input
                  type="number"
                  value={previousDayBalance}
                  readOnly
                  disabled
                  placeholder={t("closing:fields.previousDayBalance")}
                  step="0.01"
                  inputSize="lg"
                />
              </div>
            </div>

            <div className="bg-surface-elevated rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">{t("closing:sections.pettyCash")}</h2>
              <div>
                <Input
                  type="number"
                  value={pettyCash}
                  onChange={(e) => setPettyCash(Number(e.target.value))}
                  placeholder={t("closing:fields.pettyCash")}
                  step="0.01"
                  enableKeyboard
                  inputSize="lg"
                  disabled={isReadOnly}
                />
              </div>
            </div>

            <div className="bg-surface-elevated rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">{t("closing:sections.cashDrop")}</h2>
              <div>
                <Input
                  type="number"
                  value={cashDrop}
                  onChange={(e) => setCashDrop(Number(e.target.value))}
                  placeholder={t("closing:fields.cashDrop")}
                  step="0.01"
                  enableKeyboard
                  inputSize="lg"
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          <div className="bg-surface-elevated rounded-lg shadow-md p-6 mb-8" data-testid="closing-terminal-cash-section">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold mb-4">{t("closing:sections.terminalCash")}</h2>
              <Button onClick={addTerminal} variant="primary" size="lg" type="button" disabled={isReadOnly}>
                <FontAwesomeIcon icon={faPlus} className="mr-2"/>
                {t("closing:terminal.add")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {terminalCash.map((terminal) => (
                <div key={terminal.terminal_id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-lg font-semibold">{terminal.terminal_name}</label>
                    <IconTooltipButton
                      label={t('common:actions.remove')}
                      icon={faTrash}
                      size="lg"
                      variant="danger"
                      disabled={isReadOnly}
                      onClick={() => removeTerminal(terminal.terminal_id)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="font-semibold mb-2">{t("closing:terminal.notes")}</div>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {DENOMINATION_NOTES.map(denomination => (
                          <div key={denomination}>
                            <Input
                              key={`${terminal.terminal_id}_note_${denomination}`}
                              type="number"
                              value={terminalDenominations[terminal.terminal_id]?.notes?.[String(denomination)] ?? 0}
                              onChange={(e) => updateTerminalDenomination(
                                terminal.terminal_id,
                                "notes",
                                denomination,
                                Number(e.target.value)
                              )}
                              label={t("closing:terminal.denomination", {value: denomination})}
                              placeholder={t("closing:terminal.denomination", {value: denomination})}
                              min={0}
                              step={1}
                              enableKeyboard
                              disabled={isReadOnly}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold mb-2">{t("closing:terminal.coins")}</div>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {DENOMINATION_COINS.map(denomination => (
                          <div key={denomination}>
                            <Input
                              key={`${terminal.terminal_id}_coin_${denomination}`}
                              type="number"
                              value={terminalDenominations[terminal.terminal_id]?.coins?.[String(denomination)] ?? 0}
                              onChange={(e) => updateTerminalDenomination(
                                terminal.terminal_id,
                                "coins",
                                denomination,
                                Number(e.target.value)
                              )}
                              placeholder={t("closing:terminal.denomination", {value: denomination})}
                              label={t("closing:terminal.denomination", {value: denomination})}
                              min={0}
                              step={1}
                              enableKeyboard
                              disabled={isReadOnly}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-surface rounded-lg font-semibold text-foreground">
                    {t("closing:terminal.total", {amount: withCurrency(getTerminalAmount(terminal.terminal_id))})}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-surface rounded-lg text-foreground">
              <span className="text-lg font-semibold">{t("closing:totals.totalCash", {amount: withCurrency(totalCash)})}</span>
            </div>
            <div className="mt-4 p-4 bg-surface rounded-lg text-foreground space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t("closing:totals.cashSales")}</span>
                <span className="font-semibold">{withCurrency(totalSystemCash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t("closing:totals.expectedInDrawer")}</span>
                <span className="font-semibold">{withCurrency(expectedInDrawer)}</span>
              </div>
              <div
                className={`flex justify-between text-lg font-semibold ${overShort === 0 ? "text-foreground" : overShort > 0 ? "text-success-600" : "text-danger-600"}`}
              >
                <span>{t("closing:totals.overShort")}</span>
                <span>{withCurrency(overShort)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t("closing:totals.cashLeftNextShift")}</span>
                <span className="font-semibold">{withCurrency(drawerFloat)}</span>
              </div>
            </div>
            {Math.abs(overShort) > 0.009 && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">{t("closing:fields.varianceReason")}</label>
                <div>
                  <Textarea
                    value={varianceReason}
                    onChange={(e) => setVarianceReason(e.currentTarget.value)}
                    placeholder={t("closing:fields.varianceReasonPlaceholder")}
                    enableKeyboard
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface-elevated rounded-lg shadow-md p-6 mb-8" data-testid="closing-payment-types-section">
            <h2 className="text-xl font-semibold mb-4">{t("closing:sections.paymentTypesSummary")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentSummaries.filter(ps => isCashPaymentType(ps.payment_type)).map((ps) => (
                <div key={String(ps.payment_type.id)} className="border rounded-lg p-4">
                  <div className="text-sm font-medium mb-1">{ps.payment_type.name}</div>
                  <div className="text-lg font-semibold tabular-nums">{withCurrency(ps.amount)}</div>
                  <div className="text-xs text-muted mt-1">{t("closing:labels.cashSystemTotal")}</div>
                </div>
              ))}
            </div>
            <h3 className="text-lg font-semibold mt-6 mb-3">{t("closing:sections.nonCashBatch")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {batchTotals.map((row) => {
                const diff = row.batch_amount - row.system_amount;
                return (
                  <div key={row.payment_type_id} className="border rounded-lg p-4 space-y-2">
                    <div className="text-sm font-medium">{row.payment_type_name}</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">{t("closing:labels.systemAmount")}</span>
                      <span className="font-semibold tabular-nums">{withCurrency(row.system_amount)}</span>
                    </div>
                    <div>
                      <Input
                        type="number"
                        value={batchAmounts[row.payment_type_id] ?? 0}
                        onChange={(e) => setBatchAmounts(prev => ({
                          ...prev,
                          [row.payment_type_id]: Number(e.target.value),
                        }))}
                        label={t("closing:fields.batchAmount")}
                        step="0.01"
                        enableKeyboard
                        inputSize="lg"
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className={`text-sm font-semibold ${diff === 0 ? "text-foreground" : "text-warning-600"}`}>
                      {t("closing:totals.batchDifference", {amount: withCurrency(diff)})}
                    </div>
                  </div>
                );
              })}
              {batchTotals.length === 0 && (
                <div className="text-sm text-muted col-span-full">{t("closing:labels.noNonCash")}</div>
              )}
            </div>
            <div className="mt-4 p-4 bg-surface rounded-lg text-foreground">
              <span className="text-lg font-semibold">{t("closing:totals.totalOtherPayments", {amount: withCurrency(totalOtherPayments)})}</span>
            </div>
          </div>

          <div className="bg-surface-elevated rounded-lg shadow-md p-6 mb-8" data-testid="closing-expenses-section">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">{t("closing:sections.expenses")}</h2>
              <Button onClick={addExpense} variant="primary" size="lg" type="button" disabled={isReadOnly}>
                <FontAwesomeIcon icon={faPlus} className="mr-2"/>
                {t("closing:actions.addExpense")}
              </Button>
            </div>

            {expenses.map((expense) => (
              <div key={expense.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border rounded-lg">
                <Input
                  type="text"
                  value={expense.description}
                  onChange={(e) => updateExpense(expense.id, "description", e.target.value)}
                  placeholder={t("closing:fields.description")}
                  enableKeyboard
                  inputSize="lg"
                  disabled={isReadOnly}
                />
                <Input
                  type="text"
                  value={expense.category || ""}
                  onChange={(e) => updateExpense(expense.id, "category", e.target.value)}
                  placeholder={t("closing:fields.category")}
                  enableKeyboard
                  inputSize="lg"
                  disabled={isReadOnly}
                />
                <Input
                  type="number"
                  value={expense.amount}
                  onChange={(e) => updateExpense(expense.id, "amount", Number(e.target.value))}
                  placeholder={t("closing:fields.amount")}
                  step="0.01"
                  enableKeyboard
                  inputSize="lg"
                  disabled={isReadOnly}
                />
                <Button
                  onClick={() => removeExpense(expense.id)}
                  variant="danger"
                  size="lg"
                  type="button"
                  disabled={isReadOnly}
                >
                  <FontAwesomeIcon icon={faTrash}/>
                </Button>
              </div>
            ))}

            {expenses.length > 0 && (
              <div className="mt-4 p-4 bg-surface rounded-lg text-foreground">
                <span className="text-lg font-semibold">{t("closing:totals.totalExpenses", {amount: withCurrency(totalExpenses)})}</span>
              </div>
            )}
          </div>

          <div className="bg-surface-elevated rounded-lg shadow-md p-6 mb-8" data-testid="closing-open-checks-section">
            <h2 className="text-xl font-semibold mb-4">{t("closing:sections.openChecks")}</h2>
            {openChecks.length === 0 ? (
              <div className="text-sm text-muted">{t("closing:labels.noOpenChecks")}</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-surface">
                    <tr>
                      <th className="py-2 pl-4 pr-2 text-left text-xs font-semibold">{t("closing:columns.invoice")}</th>
                      <th className="py-2 px-2 text-left text-xs font-semibold">{t("closing:columns.table")}</th>
                      <th className="py-2 px-2 text-left text-xs font-semibold">{t("closing:columns.status")}</th>
                      <th className="py-2 px-2 text-right text-xs font-semibold">{t("closing:columns.amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                    {openChecks.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pl-4 pr-2 text-sm">#{row.invoice_number ?? "—"}</td>
                        <td className="py-2 px-2 text-sm">{row.table_name || "—"}</td>
                        <td className="py-2 px-2 text-sm capitalize">{row.status}</td>
                        <td className="py-2 px-2 text-sm text-right tabular-nums">{withCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-surface-elevated rounded-lg shadow-md p-6 mb-8" data-testid="closing-shift-recap-section">
            <h2 className="text-xl font-semibold mb-4">{t("closing:sections.shiftRecap")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.paidOrders")}</div>
                <div className="text-lg font-semibold">{shiftRecap?.paid_orders ?? 0}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.discounts")}</div>
                <div className="text-lg font-semibold">{withCurrency(shiftRecap?.discounts ?? 0)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.tax")}</div>
                <div className="text-lg font-semibold">{withCurrency(shiftRecap?.tax ?? 0)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.serviceCharge")}</div>
                <div className="text-lg font-semibold">{withCurrency(shiftRecap?.service_charge ?? 0)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.tips")}</div>
                <div className="text-lg font-semibold">{withCurrency(shiftRecap?.tips ?? 0)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.voids")}</div>
                <div className="text-lg font-semibold">{withCurrency(shiftRecap?.voids ?? 0)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted">{t("closing:recap.refunds")}</div>
                <div className="text-lg font-semibold">{shiftRecap?.refunds ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="bg-surface-elevated rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("closing:sections.notes")}</h2>
            <div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                placeholder={t("closing:fields.notesPlaceholder")}
                enableKeyboard
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div className="bg-primary-100 rounded-lg shadow-md p-6 mb-8" data-testid="closing-summary-section">
            <h2 className="text-2xl font-bold mb-4 text-center">{t("closing:sections.summary")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-sm text-muted">{t("closing:totals.previousBalance")}</div>
                <div className="text-xl font-semibold">{withCurrency(previousDayBalance)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">{t("closing:totals.expectedInDrawer")}</div>
                <div className="text-xl font-semibold">{withCurrency(expectedInDrawer)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">{t("closing:totals.countedCash")}</div>
                <div className="text-xl font-semibold">{withCurrency(totalCash)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">{t("closing:totals.overShort")}</div>
                <div className={`text-xl font-semibold ${overShort === 0 ? "" : overShort > 0 ? "text-success-600" : "text-danger-600"}`}>
                  {withCurrency(overShort)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">{t("closing:totals.otherPayments")}</div>
                <div className="text-xl font-semibold">{withCurrency(totalOtherPayments)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">{t("closing:totals.totalExpensesShort")}</div>
                <div className="text-xl font-semibold text-red-600">-{withCurrency(totalExpenses)}</div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-surface-elevated rounded-lg border-2 border-blue-200">
              <div className="text-center">
                <div className="text-lg text-muted">{t("closing:totals.cashLeftNextShift")}</div>
                <div className="text-3xl font-bold text-green-600 dark:text-success-400">{withCurrency(drawerFloat)}</div>
              </div>
              {isClosingCompleted && closedByLabel && (
                <div className="text-center mt-3 text-sm text-muted">
                  {t("closing:labels.closedBy", {name: closedByLabel})}
                </div>
              )}
            </div>
          </div>

          <div className="text-center flex justify-center items-center gap-4" data-testid="closing-actions">
            {!isClosingCompleted && (
              <>
                <Button
                  onClick={() => saveClosing(false)}
                  disabled={saving}
                  variant="secondary"
                  size="lg"
                  type="button"
                >
                  <FontAwesomeIcon icon={faSave} className="mr-2"/>
                  {saving ? t("closing:actions.saving") : t("closing:actions.saveClosing")}
                </Button>
                <Button
                  onClick={() => saveClosing(true)}
                  disabled={saving}
                  variant="primary"
                  size="lg"
                  type="button"
                >
                  <FontAwesomeIcon icon={faSave} className="mr-2"/>
                  {saving ? t("closing:actions.saving") : t("closing:actions.closeClosing")}
                </Button>
              </>
            )}
            {isClosingCompleted && (
              <Button
                onClick={() => {
                  void protectAction(() => {
                    void reopenClosing();
                  }, {
                    description: t("closing:security.reopenDescription"),
                    module: 'closing.edit',
                  });
                }}
                variant="warning"
                size="lg"
                type="button"
                disabled={saving}
              >
                <FontAwesomeIcon icon={faSave} className="mr-2"/>
                {saving ? t("closing:actions.reopening") : t("closing:actions.reopen")}
              </Button>
            )}
            <Button
              onClick={() => {
                printClosing().catch(() => toast.error(t("toast:closing.printFailed")));
              }}
              variant="primary"
              size="lg"
              type="button"
            >
              <FontAwesomeIcon icon={faPrint} className="mr-2"/>
              {t("closing:actions.printClosing")}
            </Button>
          </div>
        </div>
      </ScrollContainer>
    </Layout>
  );
};
