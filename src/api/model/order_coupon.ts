import { Coupon } from "./coupon";
import { DateTime } from "surrealdb";

export interface OrderCoupon {
  id: string;
  coupon: Coupon;
  discount: number;
  created_at: DateTime;
}