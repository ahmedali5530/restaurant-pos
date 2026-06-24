import i18n from '@/lib/i18n.ts'
import type { User } from '@/api/model/user.ts'
import type { Discount } from '@/api/model/discount.ts'
import { getDiscountValueType } from '@/api/model/discount.ts'
import type { RoleDiscountPolicy } from '@/api/model/role_discount_policy.ts'
import type { ApplyDiscountRequest, PermissionResult } from '@/lib/discount-engine/types.ts'

export const checkDiscountPermission = (
  user: User | undefined,
  discount: Discount,
  request: ApplyDiscountRequest,
  policies: RoleDiscountPolicy[] = []
): PermissionResult => {
  if (!user) {
    return { status: 'denied', reason: i18n.t('admin:discountEngine.permissions.denials.noUser') }
  }

  const roleId = user.user_role?.id?.toString() || (user.user_role as any)?.toString()
  const policy = policies.find(p => {
    const pid = typeof p.user_role === 'string' ? p.user_role : p.user_role?.id?.toString()
    return pid === roleId
  })

  if (policy && policy.can_apply_manual === false) {
    return {
      status: 'denied',
      reason: i18n.t('admin:discountEngine.permissions.denials.manualNotAllowed'),
    }
  }

  if (policy?.allowed_categories?.length) {
    const cat = discount.category || 'manual'
    if (!policy.allowed_categories.includes(cat)) {
      return {
        status: 'denied',
        reason: i18n.t('admin:discountEngine.permissions.denials.categoryNotAllowed'),
      }
    }
  }

  if (discount.requires_approval) {
    if (policy?.can_override_approval) {
      return { status: 'allowed', maxPercent: policy.max_percent, maxFixedAmount: policy.max_fixed_amount }
    }
    if (!request.approvedBy) {
      return {
        status: 'needs_approval',
        reason: i18n.t('admin:discountEngine.permissions.denials.approvalRequired'),
      }
    }
    return { status: 'allowed' }
  }

  const valueType = getDiscountValueType(discount)
  const rate = request.rate ?? 0
  const amount = request.amount ?? 0

  if (valueType === 'percent' && policy?.max_percent !== undefined && policy.max_percent !== null) {
    if (rate > policy.max_percent && !request.approvedBy) {
      return {
        status: 'needs_approval',
        maxPercent: policy.max_percent,
        reason: i18n.t('admin:discountEngine.permissions.denials.exceedsMaxPercent', {
          percent: policy.max_percent,
        }),
      }
    }
  }

  if (valueType === 'fixed_amount' && policy?.max_fixed_amount !== undefined && policy.max_fixed_amount !== null) {
    if (amount > policy.max_fixed_amount && !request.approvedBy) {
      return {
        status: 'needs_approval',
        maxFixedAmount: policy.max_fixed_amount,
        reason: i18n.t('admin:discountEngine.permissions.denials.exceedsMaxFixed'),
      }
    }
  }

  return {
    status: 'allowed',
    maxPercent: policy?.max_percent,
    maxFixedAmount: policy?.max_fixed_amount,
  }
}
