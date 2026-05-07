import {OrderFinanceReport} from "@/screens/reports/order.finance.shared.tsx";

export const DiscountsReport = () => {
  return (
    <OrderFinanceReport title="Discount report" metric="discount_amount" metricHeader="Discount" />
  );
};