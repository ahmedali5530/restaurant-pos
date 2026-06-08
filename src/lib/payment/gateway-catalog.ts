import type { PaymentGatewayConfig } from "@/api/model/payment_type.ts";

export type GatewayConfigKey = keyof Pick<
  PaymentGatewayConfig,
  | "public_key"
  | "secret_key"
  | "webhook_secret"
  | "client_id"
  | "client_secret"
  | "merchant_id"
  | "integrity_salt"
>;

export type GatewayFieldDescriptor = {
  configKey: GatewayConfigKey;
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  required?: boolean;
};

export type GatewayDescriptor = {
  id: string;
  label: string;
  currency?: string;
  supportsModes?: boolean;
  requiresCustomerPhone?: boolean;
  fields: GatewayFieldDescriptor[];
  helpText?: string;
};

const DEFAULT_GATEWAY_FIELDS: GatewayFieldDescriptor[] = [
  { configKey: "public_key", label: "Public Key" },
  { configKey: "secret_key", label: "Secret Key", type: "password" },
  { configKey: "webhook_secret", label: "Webhook Secret", type: "password" },
  { configKey: "client_id", label: "Client ID" },
  { configKey: "client_secret", label: "Client Secret", type: "password" },
  { configKey: "merchant_id", label: "Merchant ID" },
  { configKey: "integrity_salt", label: "Integrity Salt", type: "password" },
];

const MPESA_GATEWAY_FIELDS: GatewayFieldDescriptor[] = [
  { configKey: "client_id", label: "Consumer Key", required: true },
  { configKey: "client_secret", label: "Consumer Secret", type: "password", required: true },
  {
    configKey: "integrity_salt",
    label: "Lipa na M-Pesa Passkey",
    type: "password",
    required: true,
  },
  { configKey: "merchant_id", label: "Business ShortCode", required: true },
  {
    configKey: "public_key",
    label: "Transaction Type (optional)",
    placeholder: "CustomerPayBillOnline",
  },
];

export const GATEWAY_CATALOG: GatewayDescriptor[] = [
  {
    id: "stripe",
    label: "Stripe",
    supportsModes: true,
    fields: DEFAULT_GATEWAY_FIELDS,
    helpText: "Keys are saved with payment type for server-side gateway mapping later.",
  },
  {
    id: "paypal",
    label: "PayPal",
    supportsModes: true,
    fields: DEFAULT_GATEWAY_FIELDS,
    helpText: "Keys are saved with payment type for server-side gateway mapping later.",
  },
  {
    id: "razorpay",
    label: "Razorpay",
    supportsModes: true,
    fields: DEFAULT_GATEWAY_FIELDS,
    helpText: "Keys are saved with payment type for server-side gateway mapping later.",
  },
  {
    id: "jazzcash",
    label: "JazzCash",
    supportsModes: true,
    fields: DEFAULT_GATEWAY_FIELDS,
    helpText: "Keys are saved with payment type for server-side gateway mapping later.",
  },
  {
    id: "mpesa",
    label: "M-Pesa",
    currency: "KES",
    supportsModes: true,
    requiresCustomerPhone: true,
    fields: MPESA_GATEWAY_FIELDS,
    helpText: "Used by the payment server for Daraja STK Push. Set gateway mode to sandbox or live.",
  },
  {
    id: "telebirr",
    label: "Telebirr",
    currency: "ETB",
    supportsModes: true,
    fields: [
      { configKey: "client_id", label: "Fabric App ID", required: true },
      { configKey: "client_secret", label: "App Secret", type: "password", required: true },
      { configKey: "public_key", label: "Merchant App ID", required: true },
      { configKey: "merchant_id", label: "Merchant Code", required: true },
      {
        configKey: "secret_key",
        label: "RSA Private Key (PEM)",
        type: "password",
        required: true,
      },
      { configKey: "integrity_salt", label: "Web Base URL override (optional)" },
      {
        configKey: "webhook_secret",
        label: "Notify verification key (optional)",
        type: "password",
      },
    ],
    helpText:
      "Creates a Telebirr checkout URL shown as QR on POS. Set gateway mode to sandbox or live.",
  },
];

export const GATEWAY_IDS = GATEWAY_CATALOG.map((gateway) => gateway.id) as [
  string,
  ...string[],
];

export type GatewayId = (typeof GATEWAY_IDS)[number];

export function getGatewayDescriptor(id?: string | null): GatewayDescriptor | undefined {
  if (!id) return undefined;
  return GATEWAY_CATALOG.find((gateway) => gateway.id === id);
}

export function isKnownGateway(id?: string | null): id is GatewayId {
  return !!id && GATEWAY_IDS.includes(id as GatewayId);
}
