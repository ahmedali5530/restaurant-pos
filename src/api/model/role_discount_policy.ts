import { ID } from "@/api/model/common.ts";
import { UserRole } from "@/api/model/user_role.ts";

export interface RoleDiscountPolicy extends ID {
  user_role: UserRole | string
  max_percent?: number | null
  max_fixed_amount?: number | null
  can_apply_manual: boolean
  can_override_approval: boolean
  allowed_categories?: string[]
}
