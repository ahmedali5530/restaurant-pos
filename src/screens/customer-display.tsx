import {Fragment, useEffect, useRef, useState} from "react";
import {useSearchParams} from "react-router";
import {useTranslation} from "react-i18next";
import {Layout} from "@/screens/partials/layout.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {withCurrency} from "@/lib/utils.ts";
import {getGatewayBaseUrl, getSessionToken, isGatewayAuthEnabled} from "@/lib/session.ts";
import {
  CUSTOMER_DISPLAY_CHANNEL,
  CUSTOMER_DISPLAY_STORAGE_KEY,
  customerDisplayRecordId,
  fetchCustomerDisplayPublicSnapshot,
  type CustomerDisplayAdjustment,
  type CustomerDisplaySnapshot,
  readCustomerDisplaySnapshot,
  snapshotFromCustomerDisplayRecord,
} from "@/lib/customer-display.ts";
import {CustomerDisplayIdleMedia} from "@/components/customer-display/idle-media.tsx";

const PUBLIC_POLL_MS = 500;

const emptySnapshot = (): CustomerDisplaySnapshot => ({
  updatedAt: 0,
  lines: [],
  itemsBase: 0,
  taxTotals: [],
  adjustments: [],
  total: 0,
});

const normalizeSnapshot = (next: CustomerDisplaySnapshot): CustomerDisplaySnapshot => ({
  ...next,
  itemsBase: typeof next.itemsBase === "number" ? next.itemsBase : Number(next.total) || 0,
  taxTotals: Array.isArray(next.taxTotals) ? next.taxTotals : [],
  adjustments: Array.isArray(next.adjustments) ? next.adjustments : [],
  lines: (next.lines ?? []).map((line) => ({
    ...line,
    unitPrice: typeof line.unitPrice === "number" ? line.unitPrice : 0,
    modifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
  })),
});

const adjustmentLabel = (
  t: (key: string, opts?: any) => string,
  row: CustomerDisplayAdjustment,
): string => {
  switch (row.kind) {
    case "tax":
      return row.rate
        ? t("adjTaxNamed", {name: row.label, rate: row.rate})
        : t("adjTax", {name: row.label});
    case "discount":
      return t("adjDiscount", {name: row.label});
    case "coupon":
      return t("adjCoupon", {name: row.label});
    case "service":
      return row.rate != null
        ? t("adjService", {value: row.rate, unit: row.unit ?? ""})
        : t("adjServicePlain");
    case "tip":
      return row.unit === "%"
        ? t("adjTipPercent")
        : t("adjTip");
    case "extra":
    default:
      return row.label || t("adjExtra");
  }
};

export const CustomerDisplayScreen = () => {
  const {t} = useTranslation("customer-display");
  const [searchParams] = useSearchParams();
  const terminalParam = searchParams.get("terminal")?.trim() || "";
  const pairParam = searchParams.get("pair")?.trim() || "";
  const hasSession = !isGatewayAuthEnabled() || Boolean(getSessionToken());
  const usePublicPoll = Boolean(terminalParam && pairParam);
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;

  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot>(() =>
    normalizeSnapshot(readCustomerDisplaySnapshot() ?? emptySnapshot()),
  );

  useEffect(() => {
    const apply = (next: CustomerDisplaySnapshot) => {
      if (!next || !Array.isArray(next.lines)) {
        return;
      }
      setSnapshot(normalizeSnapshot(next));
    };

    apply(readCustomerDisplaySnapshot() ?? emptySnapshot());

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      channel.onmessage = (event) => {
        apply(event.data as CustomerDisplaySnapshot);
      };
    } catch {
      // unsupported
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMER_DISPLAY_STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        apply(JSON.parse(event.newValue) as CustomerDisplaySnapshot);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, []);

  // Public gateway poll — works in another browser without Surreal login.
  useEffect(() => {
    if (!usePublicPoll) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const snap = await fetchCustomerDisplayPublicSnapshot(
          getGatewayBaseUrl(),
          terminalParam,
          pairParam,
        );
        if (cancelled) {
          return;
        }
        if (snap) {
          setSnapshot(normalizeSnapshot(snap));
        }
      } catch {
        // transient — keep last snapshot
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, PUBLIC_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [usePublicPoll, terminalParam, pairParam]);

  // Surreal live path when logged in and paired via ?terminal= (same-LAN POS session).
  useEffect(() => {
    if (!terminalParam || usePublicPoll || !hasSession) {
      return;
    }

    let cancelled = false;
    let subscription: {kill: () => Promise<void>} | null = null;
    const recordId = customerDisplayRecordId(terminalParam);
    const recordKey = String(recordId);

    const applyRecord = (record: any) => {
      const snap = snapshotFromCustomerDisplayRecord(record);
      if (snap) {
        setSnapshot(normalizeSnapshot(snap));
      }
    };

    const setup = async () => {
      try {
        const existing = await dbRef.current.select(recordId);
        if (cancelled) {
          return;
        }
        if (existing) {
          applyRecord(existing);
        }
      } catch {
        // offline / missing — keep local listeners
      }

      try {
        subscription = await dbRef.current.live(Tables.customer_display, (action, value) => {
          if (cancelled || !value) {
            return;
          }
          const row = value as any;
          const idKey = String(row.id ?? "");
          const matches =
            row.terminal_id === terminalParam ||
            idKey === recordKey ||
            idKey.includes(terminalParam);
          if (!matches) {
            return;
          }
          if (action === "DELETE") {
            setSnapshot(emptySnapshot());
            return;
          }
          applyRecord(value);
        });
      } catch {
        // live unavailable — BroadcastChannel / storage still apply
      }
    };

    void setup();

    return () => {
      cancelled = true;
      void subscription?.kill().catch(() => undefined);
    };
  }, [terminalParam, usePublicPoll, hasSession]);

  const hasLines = snapshot.lines.length > 0;
  const adjustments = snapshot.adjustments ?? [];

  return (
    <Layout showSidebar={false} overflowHidden containerClassName="!overflow-hidden">
      <DocumentTitle parts={[t("title")]} />
      <div
        className="flex flex-col h-full min-h-0 bg-surface p-3 md:p-5"
        data-testid="customer-display-screen"
      >
        <div className="text-xs uppercase tracking-wide text-muted mb-1">
          {t("heading")}
        </div>

        {!hasLines ? (
          <CustomerDisplayIdleMedia
            thankYou={snapshot.thankYou === true}
            enableMedia={hasSession && !usePublicPoll}
            thankYouNode={
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <div className="text-3xl md:text-5xl font-bold text-success-700">
                  {t("thankYou")}
                </div>
                <p className="text-base md:text-lg text-muted">{t("thankYouHint")}</p>
              </div>
            }
            welcomeNode={
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                <div className="text-2xl md:text-4xl font-semibold text-foreground">
                  {t("idle")}
                </div>
                <p className="text-base text-muted">{t("idleHint")}</p>
              </div>
            }
          />
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-sm md:text-base">
                <thead>
                  <tr className="text-muted text-xs md:text-sm uppercase tracking-wide">
                    <th className="text-left font-medium pb-2 pr-3">{t("colItem")}</th>
                    <th className="text-right font-medium pb-2 px-1.5 w-[3.5rem]">{t("colQty")}</th>
                    <th className="text-right font-medium pb-2 px-1.5 w-[5.5rem]">{t("colPrice")}</th>
                    <th className="text-right font-medium pb-2 pl-1.5 w-[6rem]">{t("colTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.lines.map((line) => (
                    <Fragment key={line.id}>
                      <tr data-testid={`customer-display-line-${line.id}`}>
                        <td className="text-base md:text-xl font-medium py-1 pr-3 align-top truncate max-w-[42vw]">
                          {line.name}
                        </td>
                        <td className="text-right tabular-nums py-1 px-1.5 align-top">
                          {line.quantity}
                        </td>
                        <td className="text-right tabular-nums py-1 px-1.5 align-top">
                          {withCurrency(line.unitPrice)}
                        </td>
                        <td className="font-semibold text-right tabular-nums py-1 pl-1.5 align-top">
                          {withCurrency(line.lineTotal)}
                        </td>
                      </tr>
                      {(line.modifiers ?? []).map((mod, index) => (
                        <tr
                          key={`${line.id}-mod-${index}`}
                          className="text-muted text-xs md:text-sm"
                          data-testid={`customer-display-mod-${line.id}-${index}`}
                        >
                          <td
                            className="py-0.5 pr-3 align-top truncate max-w-[42vw]"
                            style={{paddingLeft: `${(mod.depth + 1) * 0.85}rem`}}
                          >
                            {mod.name}
                          </td>
                          <td className="text-right tabular-nums py-0.5 px-1.5 align-top">
                            {mod.quantity}
                          </td>
                          <td className="text-right tabular-nums py-0.5 px-1.5 align-top">
                            {withCurrency(mod.unitPrice)}
                          </td>
                          <td className="text-right tabular-nums py-0.5 pl-1.5 align-top">
                            {withCurrency(
                              roundMoney(mod.unitPrice * (Number(mod.quantity) || 0)),
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 md:mt-3 flex flex-col gap-1 rounded-xl bg-surface-elevated border border-border px-3 md:px-5 py-3 text-sm md:text-base">
              <div className="flex items-center justify-between gap-3">
                <div className="text-muted">{t("items", {count: snapshot.lines.length})}</div>
                <div className="font-semibold tabular-nums" data-testid="customer-display-items-base">
                  {withCurrency(snapshot.itemsBase)}
                </div>
              </div>

              {adjustments.map((row, index) => {
                const isCredit = row.kind === "discount" || row.kind === "coupon";
                return (
                  <div
                    key={`${row.kind}-${row.label}-${index}`}
                    className="flex items-center justify-between gap-3"
                    data-testid={`customer-display-adj-${row.kind}-${index}`}
                  >
                    <div className="text-muted truncate pr-2">{adjustmentLabel(t, row)}</div>
                    <div className="tabular-nums shrink-0">
                      {isCredit ? "−" : ""}
                      {withCurrency(Math.abs(row.amount))}
                    </div>
                  </div>
                );
              })}

              <div className="mt-1 pt-2 border-t border-border flex items-end justify-between gap-3">
                <div className="text-base md:text-xl text-muted">{t("total")}</div>
                <div
                  className="text-2xl md:text-4xl font-bold tabular-nums text-foreground"
                  data-testid="customer-display-total"
                >
                  {withCurrency(snapshot.total)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

const roundMoney = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;
