import { ID } from '@/api/model/common.ts';
import { Order } from '@/api/model/order.ts';
import { Tax } from '@/api/model/tax.ts';

export interface OrderTax extends ID {
  order: Order | string;
  tax: Tax | string;
  amount: number;
}
