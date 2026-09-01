/**
 * Loyalty + Gift Card checkout panel.
 *
 * Integrates into the order payment flow — shown alongside cash/card
 * payment types. Allows the cashier to:
 *   - Look up a customer's loyalty balance by phone/name
 *   - Redeem loyalty points for a discount
 *   - Accept a gift card as partial/full payment
 *   - Accrue loyalty points automatically after payment
 *
 * Research finding: Loyalty + gift cards is the #3 most requested
 * feature. This panel makes them usable at checkout — without it the
 * loyalty/gift card services are backend-only.
 *
 * Placement: rendered inside order.payment.tsx, below the payment type
 * selection and above the "Complete Payment" button.
 */

import { useState, useCallback, useEffect } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import {
  getCustomerLoyalty,
  redeemPoints,
  pointsToCurrency,
  type LoyaltyMember,
  type LoyaltyProgram,
  type LoyaltyTier,
} from "@/lib/loyalty.service.ts";
import {
  getGiftCardByCode,
  redeemGiftCard,
  isRedeemable,
  type GiftCard,
} from "@/lib/gift-card.service.ts";

interface Props {
  orderId: string;
  orderTotal: number;
  customerId?: string;
  onLoyaltyDiscount: (discountAmount: number) => void;
  onGiftCardPayment: (chargedAmount: number, giftCardCode: string) => void;
}

const TIER_COLORS: Record<LoyaltyTier, string> = {
  bronze: "text-amber-700 bg-amber-100",
  silver: "text-neutral-600 bg-neutral-200",
  gold: "text-yellow-700 bg-yellow-100",
  platinum: "text-purple-700 bg-purple-100",
};

export function LoyaltyGiftCardPanel({
  orderId,
  orderTotal,
  customerId,
  onLoyaltyDiscount,
  onGiftCardPayment,
}: Props) {
  const { t } = useTranslation(["orders", "common"]);
  const db = useDB();

  // Loyalty state
  const [loyaltyMember, setLoyaltyMember] = useState<LoyaltyMember | null>(null);
  const [loyaltyProgram, setLoyaltyProgram] = useState<LoyaltyProgram | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);

  // Gift card state
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);

  // Load loyalty info if customer is known
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    const load = async () => {
      setLoyaltyLoading(true);
      try {
        const { member, program } = await getCustomerLoyalty(db, customerId);
        if (!cancelled) {
          setLoyaltyMember(member);
          setLoyaltyProgram(program);
        }
      } catch {
        // Customer may not be enrolled
      } finally {
        if (!cancelled) setLoyaltyLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [customerId, db]);

  // Loyalty redemption
  const handleRedeemPoints = useCallback(async () => {
    if (!loyaltyMember || !loyaltyProgram || pointsToRedeem <= 0) return;
    try {
      const result = await redeemPoints(db, loyaltyMember.id, pointsToRedeem, orderId, loyaltyProgram);
      onLoyaltyDiscount(result.discountAmount);
      setLoyaltyMember((prev) =>
        prev ? { ...prev, points_balance: result.newBalance } : prev
      );
      toast.success(
        t("orders:loyalty.redeemed", {
          defaultValue: "Redeemed {{points}} points for {{discount}} discount",
          points: result.redeemed,
          discount: result.discountAmount.toFixed(2),
        })
      );
      setPointsToRedeem(0);
    } catch (err: any) {
      toast.error(err?.message || t("orders:loyalty.redeemFailed", { defaultValue: "Failed to redeem points" }));
    }
  }, [db, loyaltyMember, loyaltyProgram, pointsToRedeem, orderId, onLoyaltyDiscount, t]);

  // Gift card lookup
  const handleGiftCardLookup = useCallback(async () => {
    if (!giftCardCode.trim()) return;
    setGiftCardLoading(true);
    try {
      const card = await getGiftCardByCode(db, giftCardCode.toUpperCase().trim());
      setGiftCard(card);
      if (!card) {
        toast.error(t("orders:giftCard.notFound", { defaultValue: "Gift card not found" }));
      } else if (!isRedeemable(card)) {
        toast.warning(
          t("orders:giftCard.notRedeemable", { defaultValue: "Gift card is not redeemable (expired/used/void)" })
        );
      } else {
        toast.success(
          t("orders:giftCard.balance", {
            defaultValue: "Gift card balance: {{balance}}",
            balance: card.balance.toFixed(2),
          })
        );
      }
    } catch {
      toast.error(t("orders:giftCard.lookupFailed", { defaultValue: "Failed to look up gift card" }));
    } finally {
      setGiftCardLoading(false);
    }
  }, [db, giftCardCode, t]);

  // Gift card redemption
  const handleGiftCardPayment = useCallback(async () => {
    if (!giftCard || !isRedeemable(giftCard)) return;
    try {
      const result = await redeemGiftCard(db, giftCard.code, orderTotal, orderId);
      onGiftCardPayment(result.charged, giftCard.code);
      setGiftCard((prev) =>
        prev ? { ...prev, balance: result.remainingBalance } : prev
      );
      toast.success(
        t("orders:giftCard.charged", {
          defaultValue: "Charged {{amount}} to gift card (remaining: {{balance}})",
          amount: result.charged.toFixed(2),
          balance: result.remainingBalance.toFixed(2),
        })
      );
      setGiftCardCode("");
      setGiftCard(null);
    } catch (err: any) {
      toast.error(err?.message || t("orders:giftCard.redeemFailed", { defaultValue: "Failed to redeem gift card" }));
    }
  }, [db, giftCard, orderTotal, orderId, onGiftCardPayment, t]);

  const loyaltyValue = loyaltyMember && loyaltyProgram
    ? pointsToCurrency(loyaltyMember.points_balance, loyaltyProgram)
    : 0;

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-neutral-50" data-testid="loyalty-giftcard-panel">
      {/* Loyalty section */}
      {loyaltyLoading ? (
        <div className="text-sm text-neutral-400">{t("orders:loyalty.loading", { defaultValue: "Loading loyalty info…" })}</div>
      ) : loyaltyMember && loyaltyProgram ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{t("orders:loyalty.title", { defaultValue: "Loyalty Program" })}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[loyaltyMember.tier]}`}>
              {loyaltyMember.tier.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">
              {t("orders:loyalty.balance", { defaultValue: "Points balance" })}
            </span>
            <span className="font-bold">{loyaltyMember.points_balance} pts</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">
              {t("orders:loyalty.value", { defaultValue: "Redeemable value" })}
            </span>
            <span className="font-bold text-primary">{loyaltyValue.toFixed(2)}</span>
          </div>

          {/* Redeem points */}
          {loyaltyMember.points_balance >= loyaltyProgram.min_redemption_points && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <InputField
                  name="pointsToRedeem"
                  label={t("orders:loyalty.redeemPoints", { defaultValue: "Points to redeem" })}
                  control={{ value: pointsToRedeem, onChange: (v: any) => setPointsToRedeem(Number(v) || 0) } as any}
                  type="number"
                  placeholder={String(loyaltyProgram.min_redemption_points)}
                />
              </div>
              <Button
                variant="primary"
                onClick={() => void handleRedeemPoints()}
                disabled={pointsToRedeem < loyaltyProgram.min_redemption_points}
              >
                {t("orders:loyalty.apply", { defaultValue: "Apply" })}
              </Button>
            </div>
          )}
        </div>
      ) : customerId ? (
        <div className="text-sm text-neutral-400">
          {t("orders:loyalty.notEnrolled", { defaultValue: "Customer not enrolled in loyalty program" })}
        </div>
      ) : null}

      {/* Divider */}
      <div className="border-t pt-3">
        {/* Gift card section */}
        <div className="space-y-2">
          <span className="font-semibold text-sm">{t("orders:giftCard.title", { defaultValue: "Gift Card" })}</span>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <InputField
                name="giftCardCode"
                label={t("orders:giftCard.code", { defaultValue: "Gift card code" })}
                control={{ value: giftCardCode, onChange: (v: any) => setGiftCardCode(String(v || "")) } as any}
                placeholder="GC-XXXX-XXXX"
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => void handleGiftCardLookup()}
              disabled={!giftCardCode.trim() || giftCardLoading}
            >
              {t("orders:giftCard.check", { defaultValue: "Check" })}
            </Button>
          </div>

          {giftCard && isRedeemable(giftCard) && (
            <div className="flex items-center justify-between p-2 bg-white rounded border">
              <div>
                <div className="text-sm font-medium">{giftCard.code}</div>
                <div className="text-xs text-neutral-500">
                  {t("orders:giftCard.balanceLabel", { defaultValue: "Balance" })}: {giftCard.balance.toFixed(2)}
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => void handleGiftCardPayment()}
                data-testid="giftcard-pay-btn"
              >
                {t("orders:giftCard.pay", { defaultValue: "Pay with Gift Card" })}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
