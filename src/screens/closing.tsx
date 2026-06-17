import {Layout} from "@/screens/partials/layout.tsx";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {Button} from "@/components/common/input/button.tsx";
import {DENOMINATION_COINS, DENOMINATION_NOTES, formatNumber, withCurrency} from "@/lib/utils.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faPrint, faSave, faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  Closing as ClosingModel,
  Expense,
  PaymentSummary,
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
import {getCurrentCycleClosing, hasOpenOrdersInCurrentCycle} from "@/lib/closing.guard.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from "react-i18next";

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
  const {t} = useTranslation(["closing", "toast"]);
  const db = useDB();
  const [page] = useAtom(appPage);
  const {protectAction} = useSecurity();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingClosing, setExistingClosing] = useState<ClosingModel | null>(null);
  const [isClosingCompleted, setIsClosingCompleted] = useState(false);

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

  const fetchCyclePayments = useCallback(async () => {
    try {
      const [result] = await db.query(`
          SELECT payments.*
          FROM order
          WHERE created_at >= $start
            AND created_at <= $end
            AND status = 'Paid'
              FETCH payments
              , payments.payment_type
      `, {
        start: toSurrealDateTime(closingWindow.date_from),
        end: toSurrealDateTime(closingWindow.date_to),
      });

      const orders = result as any[];
      const paymentTotals = new Map<string, number>();

      orders.forEach((order: any) => {
        if (!order.payments) return;
        order.payments.forEach((payment: any) => {
          const paymentTypeId = payment.payment_type?.id?.toString();
          if (!paymentTypeId) return;
          const current = paymentTotals.get(paymentTypeId) || 0;
          paymentTotals.set(paymentTypeId, current + Number(payment.amount || 0));
        });
      });

      return paymentTotals;
    } catch (error) {
      console.error("Error fetching closing-window payments:", error);
      return new Map<string, number>();
    }
  }, [closingWindow.date_from, closingWindow.date_to]);

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

  const hydratePayments = useCallback(async (source: ClosingModel | null) => {
    const systemPayments = await fetchCyclePayments();
    const savedPaymentsMap = new Map<string, number>(
      (source?.payments_data || []).map((entry) => {
        const typeRaw = entry.payment_type as PaymentType | string | undefined;
        const paymentTypeId = typeof typeRaw === "object" && typeRaw
          ? String(typeRaw.id)
          : String(typeRaw || "");
        return [paymentTypeId, Number(entry.amount || 0)];
      })
    );

    setPaymentSummaries(paymentTypes.map(pt => ({
      payment_type: pt,
      amount: savedPaymentsMap.get(String(pt.id)) ?? systemPayments.get(String(pt.id)) ?? 0,
    })));
  }, [fetchCyclePayments, paymentTypes]);

  const loadClosingData = useCallback(async () => {
    if (paymentTypes.length === 0) return;

    setLoading(true);
    try {
      const cycleClosing = await getCurrentCycleClosing(db);
      setExistingClosing(cycleClosing);
      setIsClosingCompleted(cycleClosing?.status === "completed");

      setPreviousDayBalance(Number((cycleClosing as any)?.previous_day_balance ?? 0));
      setPettyCash(Number(cycleClosing?.cash_added ?? 0));
      setExpenses(cycleClosing?.expenses_data || []);
      setNotes(cycleClosing?.notes || "");
      hydrateTerminals(cycleClosing);
      await hydratePayments(cycleClosing);
    } catch (error) {
      console.error("Error loading closing data:", error);
      toast.error(t("toast:closing.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [hydratePayments, hydrateTerminals, paymentTypes.length]);

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
      .filter(ps => ps.payment_type.type?.toLowerCase() === "cash")
      .reduce((sum, ps) => sum + ps.amount, 0);
  }, [paymentSummaries]);

  const cashDifference = useMemo(() => {
    return totalCash - totalSystemCash;
  }, [totalCash, totalSystemCash]);

  const totalOtherPayments = useMemo(() => {
    return paymentSummaries
      .filter(ps => ps.payment_type.type?.toLowerCase() !== "cash")
      .reduce((sum, ps) => sum + ps.amount, 0);
  }, [paymentSummaries]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses]);

  const netAmount = useMemo(() => {
    return previousDayBalance + totalCash + pettyCash + totalOtherPayments - totalExpenses;
  }, [previousDayBalance, totalCash, pettyCash, totalOtherPayments, totalExpenses]);
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
      [{text: "Total Cash", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(totalCash),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: " ", align: "LEFT", width: 1}],
      [{text: "Payment Summary", align: "LEFT", width: 0.6, style: "B"}, {
        text: "Amount",
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      ...paymentSummaries.map(ps => ([
        {text: ps.payment_type.name, align: "LEFT", width: 0.6},
        {text: formatNumber(ps.amount), align: "RIGHT", width: 0.4}
      ])),
      [{text: "Other Payments", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(totalOtherPayments),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: "Expenses", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(totalExpenses),
        align: "RIGHT",
        width: 0.4,
        style: "B"
      }],
      [{text: "Net Amount", align: "LEFT", width: 0.6, style: "B"}, {
        text: formatNumber(netAmount),
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
        const hasOpenOrders = await hasOpenOrdersInCurrentCycle(db);
        if (hasOpenOrders) {
          toast.error(t("toast:closing.openOrders"));
          return;
        }
      }

      const resolved = await resolveClosingWindow(db, new Date());
      const windowForSave = resolved.window;

      const closingData: Omit<ClosingModel, "id"> = {
        date_from: windowForSave.date_from,
        date_to: windowForSave.date_to,
        cash_added: pettyCash,
        cash_withdrawn: 0,
        closing_balance: netAmount,
        denominations: terminalDenominations,
        terminal_cash: computedTerminalCash,
        payments_data: paymentSummaries,
        expenses_data: expenses,
        expenses: totalExpenses,
        notes,
        created_at: existingClosing?.created_at || nowSurrealDateTime(),
        status: complete ? "completed" : "draft",
        previous_day_balance: previousDayBalance,
        total_cash: totalCash,
        total_other_payments: totalOtherPayments,
        net_amount: netAmount,
        ...(complete ? {closed_at: nowSurrealDateTime()} : {}),
      };

      if (existingClosing?.id) {
        await db.update(existingClosing.id, closingData);
      } else {
        await db.create(Tables.closings, closingData);
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
        <div className="h-[calc(100vh_-_30px)] flex justify-center items-center text-xl font-semibold">
          {t("closing:loading")}
        </div>
      </Layout>
    );
  }

  return (
    <Layout overflowHidden>
      <ScrollContainer className="overflow-y-auto h-[calc(100vh_-_30px)] select-none">
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-3 text-center">{t("closing:title", {date: today})}</h1>
          <div className="text-center mb-6 text-sm text-neutral-600">{closingWindowLabel}</div>

          {!cycleEnabled && (
            <div className="alert alert-warning mb-6 bg-white">
              {t("closing:alerts.cycleDisabled")}
            </div>
          )}

          {cycleEnabled && isClosingCompleted && (
            <div className="alert alert-success mb-6 bg-white">
              {t("closing:alerts.cycleCompleted")}
            </div>
          )}

          {!cycleEnabled && isClosingCompleted && (
            <div className="alert alert-success mb-6 bg-white">
              {t("closing:alerts.periodCompleted")}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">{t("closing:sections.previousDayBalance")}</h2>
              <Input
                type="number"
                value={previousDayBalance}
                onChange={(e) => setPreviousDayBalance(Number(e.target.value))}
                placeholder={t("closing:fields.previousDayBalance")}
                step="0.01"
                enableKeyboard
                inputSize="lg"
                disabled={isReadOnly}
              />
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">{t("closing:sections.pettyCash")}</h2>
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

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
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
                    <Button
                      icon={faTrash}
                      size="lg"
                      iconButton
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

                  <div className="mt-4 p-3 bg-gray-100 rounded-lg font-semibold">
                    {t("closing:terminal.total", {amount: withCurrency(getTerminalAmount(terminal.terminal_id))})}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <span className="text-lg font-semibold">{t("closing:totals.totalCash", {amount: withCurrency(totalCash)})}</span>
            </div>
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <div className="text-sm text-gray-600">{t("closing:totals.cashFromPayments")}</div>
              <div className="text-lg font-semibold">{withCurrency(totalSystemCash)}</div>
              <div
                className={`mt-2 text-lg font-semibold ${cashDifference === 0 ? "text-gray-700" : cashDifference > 0 ? "text-success-600" : "text-danger-600"}`}
              >
                {t("closing:totals.difference", {amount: withCurrency(cashDifference)})}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("closing:sections.paymentTypesSummary")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentSummaries.map((ps) => (
                <div key={ps.payment_type.id} className="border rounded-lg p-4">
                  <label className="block text-sm font-medium mb-2">{ps.payment_type.name}</label>
                  <Input
                    type="number"
                    value={ps.amount}
                    placeholder={ps.payment_type.name}
                    inputSize="lg"
                    disabled
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <span className="text-lg font-semibold">{t("closing:totals.totalOtherPayments", {amount: withCurrency(totalOtherPayments)})}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
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
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <span className="text-lg font-semibold">{t("closing:totals.totalExpenses", {amount: withCurrency(totalExpenses)})}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("closing:sections.notes")}</h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              placeholder={t("closing:fields.notesPlaceholder")}
              enableKeyboard
              disabled={isReadOnly}
            />
          </div>

          {isClosingCompleted && (
            <div className="bg-primary-100 rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold mb-4 text-center">{t("closing:sections.summary")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-sm text-gray-600">{t("closing:totals.previousBalance")}</div>
                  <div className="text-xl font-semibold">{withCurrency(previousDayBalance)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t("closing:totals.totalCashShort")}</div>
                  <div className="text-xl font-semibold">{withCurrency(totalCash + pettyCash)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t("closing:totals.otherPayments")}</div>
                  <div className="text-xl font-semibold">{withCurrency(totalOtherPayments)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t("closing:totals.totalExpensesShort")}</div>
                  <div className="text-xl font-semibold text-red-600">-{withCurrency(totalExpenses)}</div>
                </div>
              </div>
              <div className="mt-6 p-4 bg-white rounded-lg border-2 border-blue-200">
                <div className="text-center">
                  <div className="text-lg text-gray-600">{t("closing:totals.netAmount")}</div>
                  <div className="text-3xl font-bold text-green-600">{withCurrency(netAmount)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="text-center flex justify-center items-center gap-4">
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
              <>
                <Button
                  onClick={() => {
                    void protectAction(() => {
                      void reopenClosing();
                    }, {
                      description: t("closing:security.reopenDescription"),
                      module: 'Edit Closing',
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
              </>
            )}
          </div>
        </div>
      </ScrollContainer>
    </Layout>
  );
};
