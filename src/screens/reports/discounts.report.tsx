import { useTranslation } from 'react-i18next';
import {OrderFinanceReport} from "@/screens/reports/order.finance.shared.tsx";

export const DiscountsReport = () => {
  const { t } = useTranslation('reports');
  return (
    <OrderFinanceReport title={t('titles.discount')} metric="discount_amount" metricHeader="Discount" />
  );
};