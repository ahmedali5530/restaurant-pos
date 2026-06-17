import { useTranslation } from 'react-i18next';
import {OrderFinanceReport} from "@/screens/reports/order.finance.shared.tsx";

export const TaxReport = () => {
  const { t } = useTranslation('reports');
  return <OrderFinanceReport title={t('titles.tax')} metric="tax_amount" metricHeader="Tax" />;
};
