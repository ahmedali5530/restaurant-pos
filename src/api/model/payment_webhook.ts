export interface PaymentWebhook {
  id: string;
  key: string;
  data: unknown;
  gateway: string;
  created_at: Date;
}
