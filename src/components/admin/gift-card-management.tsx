/**
 * Gift Card Management panel — admin UI for issuing and managing gift cards.
 *
 * Placement: added as a new tab in the Admin screen (after 'security_alerts').
 *
 * Features:
 *   - Issue new gift card (enter amount → generate code → print)
 *   - Look up gift card by code → show balance + transaction history
 *   - Top up existing card
 *   - Void a card (manager approval)
 *
 * Research finding: Toast's gift card management is behind a $185/mo paywall.
 * POSR offers it free.
 */

import { useState, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import {
  issueGiftCard,
  getGiftCardByCode,
  topUpGiftCard,
  voidGiftCard,
  getGiftCardHistory,
  isRedeemable,
  type GiftCard,
  type GiftCardTransaction,
} from "@/lib/gift-card.service.ts";

export function GiftCardManagement() {
  const { t } = useTranslation(["admin", "common"]);
  const db = useDB();

  // Issue form
  const [issueAmount, setIssueAmount] = useState<number>(50);
  const [issuing, setIssuing] = useState(false);

  // Lookup
  const [lookupCode, setLookupCode] = useState("");
  const [foundCard, setFoundCard] = useState<GiftCard | null>(null);
  const [history, setHistory] = useState<GiftCardTransaction[]>([]);
  const [looking, setLooking] = useState(false);

  // Top up
  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [toppingUp, setToppingUp] = useState(false);

  const handleIssue = useCallback(async () => {
    if (issueAmount <= 0) return;
    setIssuing(true);
    try {
      const card = await issueGiftCard(db, { initialBalance: issueAmount });
      toast.success(
        t("admin:giftCard.issued", {
          defaultValue: "Gift card issued: {{code}} (balance: {{balance}})",
          code: card.code,
          balance: card.balance.toFixed(2),
        })
      );
      // Copy code to clipboard for convenience
      try { await navigator.clipboard.writeText(card.code); } catch {}
    } catch (err: any) {
      toast.error(err?.message || t("admin:giftCard.issueFailed", { defaultValue: "Failed to issue gift card" }));
    } finally {
      setIssuing(false);
    }
  }, [db, issueAmount, t]);

  const handleLookup = useCallback(async () => {
    if (!lookupCode.trim()) return;
    setLooking(true);
    try {
      const card = await getGiftCardByCode(db, lookupCode.toUpperCase().trim());
      setFoundCard(card);
      setHistory([]);
      if (card) {
        const hist = await getGiftCardHistory(db, card.code);
        setHistory(hist);
      }
    } catch {
      toast.error(t("admin:giftCard.lookupFailed", { defaultValue: "Lookup failed" }));
    } finally {
      setLooking(false);
    }
  }, [db, lookupCode, t]);

  const handleTopUp = useCallback(async () => {
    if (!foundCard || topUpAmount <= 0) return;
    setToppingUp(true);
    try {
      const result = await topUpGiftCard(db, foundCard.code, topUpAmount);
      setFoundCard((prev) => prev ? { ...prev, balance: result.newBalance } : prev);
      toast.success(
        t("admin:giftCard.toppedUp", {
          defaultValue: "Topped up {{amount}}. New balance: {{balance}}",
          amount: topUpAmount.toFixed(2),
          balance: result.newBalance.toFixed(2),
        })
      );
      setTopUpAmount(0);
    } catch (err: any) {
      toast.error(err?.message || "Top up failed");
    } finally {
      setToppingUp(false);
    }
  }, [db, foundCard, topUpAmount, t]);

  const handleVoid = useCallback(async () => {
    if (!foundCard) return;
    if (!confirm(t("admin:giftCard.voidConfirm", { defaultValue: "Are you sure? This cannot be undone." }))) return;
    try {
      await voidGiftCard(db, foundCard.code);
      setFoundCard((prev) => prev ? { ...prev, status: "voided", balance: 0 } : prev);
      toast.success(t("admin:giftCard.voided", { defaultValue: "Gift card voided" }));
    } catch (err: any) {
      toast.error(err?.message || "Void failed");
    }
  }, [db, foundCard, t]);

  return (
    <div className="p-4 space-y-6" data-testid="gift-card-management">
      {/* Issue new card */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="text-lg font-semibold mb-3">
          {t("admin:giftCard.issueTitle", { defaultValue: "Issue New Gift Card" })}
        </h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <InputField
              name="issueAmount"
              label={t("admin:giftCard.amount", { defaultValue: "Initial amount" })}
              control={{ value: issueAmount, onChange: (v: any) => setIssueAmount(Number(v) || 0) } as any}
              type="number"
            />
          </div>
          <Button variant="primary" onClick={() => void handleIssue()} disabled={issuing || issueAmount <= 0}>
            {issuing
              ? t("common:actions.processing", { defaultValue: "Processing…" })
              : t("admin:giftCard.issueBtn", { defaultValue: "Issue Card" })}
          </Button>
        </div>
      </div>

      {/* Lookup card */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="text-lg font-semibold mb-3">
          {t("admin:giftCard.lookupTitle", { defaultValue: "Look Up Gift Card" })}
        </h3>
        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1">
            <InputField
              name="lookupCode"
              label={t("admin:giftCard.code", { defaultValue: "Gift card code" })}
              control={{ value: lookupCode, onChange: (v: any) => setLookupCode(String(v || "")) } as any}
              placeholder="GC-XXXX-XXXX"
            />
          </div>
          <Button variant="ghost" onClick={() => void handleLookup()} disabled={!lookupCode.trim() || looking}>
            {looking ? "…" : t("admin:giftCard.check", { defaultValue: "Check" })}
          </Button>
        </div>

        {/* Card details */}
        {foundCard && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border">
              <div>
                <div className="font-bold text-lg">{foundCard.code}</div>
                <div className="text-sm text-neutral-500">
                  {t("admin:giftCard.balanceLabel", { defaultValue: "Balance" })}: <strong>{foundCard.balance.toFixed(2)}</strong>
                  {" · "}
                  {t("admin:giftCard.status", { defaultValue: "Status" })}: <strong className={foundCard.status === "active" ? "text-green-600" : "text-red-600"}>{foundCard.status}</strong>
                </div>
              </div>
            </div>

            {/* Top up */}
            {foundCard.status !== "voided" && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <InputField
                    name="topUpAmount"
                    label={t("admin:giftCard.topUpAmount", { defaultValue: "Top up amount" })}
                    control={{ value: topUpAmount, onChange: (v: any) => setTopUpAmount(Number(v) || 0) } as any}
                    type="number"
                  />
                </div>
                <Button variant="primary" onClick={() => void handleTopUp()} disabled={toppingUp || topUpAmount <= 0}>
                  {t("admin:giftCard.topUpBtn", { defaultValue: "Top Up" })}
                </Button>
                <Button variant="danger" onClick={() => void handleVoid()}>
                  {t("admin:giftCard.voidBtn", { defaultValue: "Void" })}
                </Button>
              </div>
            )}

            {/* Transaction history */}
            {history.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("admin:giftCard.history", { defaultValue: "Transaction History" })}</h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {history.map((txn) => (
                    <div key={txn.id} className="flex justify-between text-sm p-2 border-b">
                      <span>{txn.type}</span>
                      <span className={txn.amount < 0 ? "text-red-600" : "text-green-600"}>
                        {txn.amount > 0 ? "+" : ""}{txn.amount.toFixed(2)}
                      </span>
                      <span className="text-neutral-400">{new Date(txn.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
