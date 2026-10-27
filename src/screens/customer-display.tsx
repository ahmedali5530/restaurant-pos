import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Layout} from "@/screens/partials/layout.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {withCurrency} from "@/lib/utils.ts";
import {
  CUSTOMER_DISPLAY_CHANNEL,
  type CustomerDisplaySnapshot,
  readCustomerDisplaySnapshot,
} from "@/lib/customer-display.ts";

const emptySnapshot = (): CustomerDisplaySnapshot => ({
  updatedAt: 0,
  lines: [],
  itemsBase: 0,
  taxTotals: [],
  total: 0,
});

export const CustomerDisplayScreen = () => {
  const {t} = useTranslation("customer-display");
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot>(() =>
    readCustomerDisplaySnapshot() ?? emptySnapshot(),
  );

  useEffect(() => {
    const apply = (next: CustomerDisplaySnapshot) => {
      if (!next || !Array.isArray(next.lines)) {
        return;
      }
      setSnapshot({
        ...next,
        itemsBase: typeof next.itemsBase === "number" ? next.itemsBase : Number(next.total) || 0,
        taxTotals: Array.isArray(next.taxTotals) ? next.taxTotals : [],
      });
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
      if (event.key !== "posr-customer-display-snapshot" || !event.newValue) {
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

  const hasLines = snapshot.lines.length > 0;
  const taxTotals = snapshot.taxTotals ?? [];

  return (
    <Layout showSidebar={false} overflowHidden containerClassName="!overflow-hidden">
      <DocumentTitle parts={[t("title")]} />
      <div
        className="flex flex-col h-full min-h-0 bg-surface p-4 md:p-8"
        data-testid="customer-display-screen"
      >
        <div className="text-sm uppercase tracking-wide text-muted mb-2">
          {t("heading")}
        </div>

        {snapshot.thankYou && !hasLines ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="text-4xl md:text-6xl font-bold text-success-700">
              {t("thankYou")}
            </div>
            <p className="text-xl text-muted">{t("thankYouHint")}</p>
          </div>
        ) : !hasLines ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="text-3xl md:text-5xl font-semibold text-foreground">
              {t("idle")}
            </div>
            <p className="text-lg text-muted">{t("idleHint")}</p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border bg-surface-elevated">
              <ul className="divide-y divide-border">
                {snapshot.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-4 px-4 md:px-6 py-4"
                    data-testid={`customer-display-line-${line.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xl md:text-3xl font-medium truncate">
                        {line.name}
                      </div>
                      <div className="text-base md:text-xl text-muted">
                        {t("qty", {count: line.quantity})}
                      </div>
                    </div>
                    <div className="text-xl md:text-3xl font-semibold tabular-nums">
                      {withCurrency(line.lineTotal)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 md:mt-6 flex flex-col gap-3 rounded-2xl bg-surface-elevated border border-border px-4 md:px-8 py-5">
              <div className="flex items-center justify-between gap-4 text-xl md:text-2xl">
                <div className="text-muted">{t("items", {count: snapshot.lines.length})}</div>
                <div className="font-semibold tabular-nums" data-testid="customer-display-items-base">
                  {withCurrency(snapshot.itemsBase)}
                </div>
              </div>

              {taxTotals.length > 0 ? (
                taxTotals.map((entry, index) => (
                  <div
                    key={`${entry.name}-${entry.rate}-${index}`}
                    className="flex items-end justify-between gap-4"
                    data-testid={`customer-display-tax-total-${index}`}
                  >
                    <div className="text-xl md:text-3xl text-muted">
                      {t("totalWithTax", {name: entry.name, rate: entry.rate})}
                    </div>
                    <div
                      className="text-4xl md:text-7xl font-bold tabular-nums text-foreground"
                      data-testid={index === 0 ? "customer-display-total" : undefined}
                    >
                      {withCurrency(entry.total)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-end justify-between gap-4">
                  <div className="text-xl md:text-3xl text-muted">{t("total")}</div>
                  <div
                    className="text-4xl md:text-7xl font-bold tabular-nums text-foreground"
                    data-testid="customer-display-total"
                  >
                    {withCurrency(snapshot.total)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};
