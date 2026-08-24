import { ID, Name } from "@/api/model/common.ts";

export interface Customer extends ID, Name{
  address?: string
  email?: string
  lat?: number
  lng?: number
  phone?: number
  secondary_address?: string
  postal_code?: number
  points?: number
  tags?: string[]
  /** Optional guest/room code when name is absent (display via formatGuestLabel). */
  guest_code?: string
}
