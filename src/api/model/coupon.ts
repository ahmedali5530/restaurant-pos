import { DateTime } from "surrealdb";
export type CouponType = 'order' | 'product' | 'shipping';
export type CouponDiscountType = 'fixed' | 'percent';

export type WeekDay =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

export interface Coupon {
  id: string;

  code: string;
  description?: string;

  discount_type: CouponDiscountType;
  discount_value: number;

  coupon_type: CouponType;

  min_order_amount?: number;
  max_discount_amount?: number;

  usage_limit?: number;
  usage_limit_per_user?: number;
  used_count: number;

  valid_days?: WeekDay[];

  start_time?: string; // "HH:mm:ss"
  end_time?: string;

  start_date?: DateTime;
  end_date?: DateTime;

  stackable: boolean;
  first_order_only: boolean;
  priority: number;

  is_active: boolean;

  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime
}

export interface CouponRedemption {
  id: string;

  coupon: string; // record<coupons>
  user?: string;  // record<users>
  order: string;  // record<orders>

  discount_amount: number;

  redeemed_at: DateTime;
}