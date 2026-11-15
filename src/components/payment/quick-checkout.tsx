import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import type {PaymentType} from "@/api/model/payment_type.ts";
import {cn, withCurrency} from "@/lib/utils.ts";
import {useTranslation} from "react-i18next";
import {faCancel, faCheck, faCreditCard} from "@fortawesome/free-solid-svg-icons";
import ScrollContainer from "react-indiana-drag-scroll";

interface Props {
  paymentTypes: PaymentType[];
  selectedPaymentTypeId: string | null;
  onSelectPaymentType: (paymentType: PaymentType) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  payable: number;
  disabled?: boolean;
  isLoading?: boolean;
  onComplete: () => void;
  onFullPayment: () => void;
  onCancel: () => void;
}

export const QuickCheckout = ({
  paymentTypes,
  selectedPaymentTypeId,
  onSelectPaymentType,
  amount,
  onAmountChange,
  payable,
  disabled,
  isLoading,
  onComplete,
  onFullPayment,
  onCancel,
}: Props) => {
  const {t} = useTranslation(["payment", "common"]);
  const amountNum = Number(amount);
  const canComplete =
    !disabled &&
    !isLoading &&
    !!selectedPaymentTypeId &&
    Number.isFinite(amountNum) &&
    amountNum >= payable - 0.0001 &&
    amountNum > 0;

  const changeDue = Number.isFinite(amountNum) ? amountNum - payable : 0;

  return (
    <div className="flex flex-col gap-3" data-testid="quick-checkout">
      <ScrollContainer className="flex gap-2" data-testid="quick-checkout-payment-types">
        {paymentTypes.map((pt) => {
          const id = String(pt.id);
          const selected = id === selectedPaymentTypeId;
          return (
            <Button
              key={id}
              type="button"
              variant="primary"
              filled={selected}
              className={cn(
                selected && "ring-2 ring-primary-500 ring-offset-1 ring-offset-surface",
              )}
              onClick={() => onSelectPaymentType(pt)}
              disabled={disabled || isLoading}
              data-testid={`quick-checkout-payment-type-${id}`}
              data-selected={selected ? "true" : undefined}
            >
              {pt.name}
            </Button>
          );
        })}
        {paymentTypes.length === 0 && (
        <p className="text-sm text-muted">{t("payment:quickCheckout.noPaymentTypes")}</p>
      )}
      </ScrollContainer>

      <div>
        <Input
          type="number"
          label={t("payment:quickCheckout.amount")}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          disabled={disabled || isLoading}
          data-testid="quick-checkout-amount"
          enableKeyboard={true}
          placeholder={t("payment:quickCheckout.amount")}
        />
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted">
          <span>
            {t("payment:quickCheckout.payable")}: {withCurrency(payable)}
          </span>
          {changeDue > 0.0001 && (
            <span className="text-success-700" data-testid="quick-checkout-change">
              {t("payment:quickCheckout.change")}: {withCurrency(changeDue)}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="success"
          filled
          className="flex-1"
          size="lg"
          icon={faCheck}
          onClick={onComplete}
          disabled={!canComplete}
          isLoading={isLoading}
          data-testid="quick-checkout-complete"
        >
          {t("payment:quickCheckout.complete")}
        </Button>
        <Button
          variant="warning"
          filled
          className="flex-1"
          size="lg"
          icon={faCreditCard}
          onClick={onFullPayment}
          disabled={disabled || isLoading}
          isLoading={isLoading}
          data-testid="quick-checkout-full-payment"
        >
          {t("payment:quickCheckout.fullPayment")}
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          size="lg"
          icon={faCancel}
          onClick={onCancel}
          disabled={isLoading}
          data-testid="cart-cancel"
        >
          {t("payment:actions.cancel")}
        </Button>
      </div>
    </div>
  );
};
