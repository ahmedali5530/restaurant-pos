import { useTranslation } from 'react-i18next';
import {OrderFinanceReport} from "@/screens/reports/order.finance.shared.tsx";

export const CouponReport = () => {
  const { t } = useTranslation('reports');
  return <OrderFinanceReport title={t('titles.coupon')} metric="coupon_discount" metricHeader="Coupon discount" />;
};
