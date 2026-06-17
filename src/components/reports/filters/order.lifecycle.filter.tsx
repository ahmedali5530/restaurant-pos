import { useTranslation } from 'react-i18next';
import {REPORTS_ORDER_LIFECYCLE} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";

export const OrderLifecycleFilter = () => {
  const { t } = useTranslation('reports');
  return (
    <form action={REPORTS_ORDER_LIFECYCLE} className="flex flex-col gap-3 items-start w-full" target="_blank">
      <div className="w-full">
        <label htmlFor="order-id">{t('filters.orderId')}</label>
        <input
          id="order-id"
          name="order_id"
          className="form-control"
          required
        />
      </div>
      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
