import {useTranslation} from "react-i18next";
import {REPORTS_ORDER_RECEIPT} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";

export const OrderReceiptFilter = () => {
  const {t} = useTranslation("reports");
  return (
    <form action={REPORTS_ORDER_RECEIPT} className="flex flex-col gap-3 items-start w-full" target="_blank">
      <div className="w-full">
        <Input
          id="order-receipt-id"
          name="order_id"
          label={t("filters.orderId")}
          required
          enableKeyboard={false}
        />
      </div>
      <Button variant="primary" filled type="submit">{t("filters.generate")}</Button>
    </form>
  );
};
