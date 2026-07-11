import { ID } from '@/api/model/common.ts';
import { Order } from '@/api/model/order.ts';
import { DateTime } from 'surrealdb';

export type OrderFiscalSubmissionStatus = 'completed' | 'failed' | 'skipped';

export interface OrderFiscalSubmission extends ID {
  order: Order | string;
  provider_id: string;
  invoice_number?: string | null;
  qrcode?: string | null;
  status: OrderFiscalSubmissionStatus;
  code?: number | string | null;
  error?: string | null;
  selected_for_print?: boolean;
  qr_priority?: number;
  request_payload?: unknown;
  response_payload?: unknown;
  submitted_at?: DateTime | string;
  created_at?: DateTime | string;
}
