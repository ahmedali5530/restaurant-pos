import {OrderFinanceReport} from "@/screens/reports/order.finance.shared.tsx";

export const TaxReport = () => {
  return <OrderFinanceReport title="Tax report" metric="tax_amount" metricHeader="Tax" />;
};
