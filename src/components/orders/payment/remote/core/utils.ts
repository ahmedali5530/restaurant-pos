import { PaymentType } from "@/api/model/payment_type.ts";

export function isRemotePaymentType(paymentType: PaymentType): boolean {
  return String(paymentType.type || "").toLowerCase() === "remote";
}

export function getOrderCustomerPhone(order: { customer?: { phone?: unknown } }): string | undefined {
  if (order?.customer?.phone === undefined) return undefined;
  return String(order.customer.phone);
}
