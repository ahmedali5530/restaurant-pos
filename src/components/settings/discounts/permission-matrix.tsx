import { useTranslation } from 'react-i18next'
import { Tables } from '@/api/db/tables.ts'
import useApi, { SettingsData } from '@/api/db/use.api.ts'
import { RoleDiscountPolicy } from '@/api/model/role_discount_policy.ts'
import { UserRole } from '@/api/model/user_role.ts'
import { useDB } from '@/api/db/db.ts'
import { Input } from '@/components/common/input/input.tsx'
import { Checkbox } from '@/components/common/input/checkbox.tsx'
import { DISCOUNT_CATEGORIES } from '@/lib/discount-engine/types.ts'
import { toast } from 'sonner'
import { translatedSelectOptions } from '@/lib/discount-engine/i18n-options.ts'

export const DiscountPermissionMatrix = () => {
  const { t } = useTranslation('admin')
  const db = useDB()
  const { data: roles } = useApi<SettingsData<UserRole>>(Tables.user_roles, ['deleted_at = none'])
  const loadHook = useApi<SettingsData<RoleDiscountPolicy>>(Tables.role_discount_policies, [], ['user_role asc'])
  const policies = loadHook.data?.data || []

  const categoryLabels = translatedSelectOptions(DISCOUNT_CATEGORIES, t, 'discountEngine.categories')
    .map(o => o.label)
    .join(', ')

  const getPolicy = (roleId: string) =>
    policies.find(p => {
      const pid = typeof p.user_role === 'string' ? p.user_role : p.user_role?.id
      return pid === roleId
    })

  const savePolicy = async (role: UserRole, patch: Partial<RoleDiscountPolicy>) => {
    const existing = getPolicy(role.id)
    try {
      if (existing?.id) {
        await db.merge(existing.id, patch)
      } else {
        await db.create(Tables.role_discount_policies, {
          user_role: role.id,
          can_apply_manual: true,
          can_override_approval: false,
          allowed_categories: [],
          ...patch,
        })
      }
      loadHook.fetchData()
      toast.success(t('discountEngine.permissions.policySaved'))
    } catch (e) {
      toast.error(t('discountEngine.errors.saveFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {(roles?.data || []).map(role => {
        const policy = getPolicy(role.id)
        return (
          <div key={role.id} className="border rounded-lg p-4 grid grid-cols-4 gap-3 items-end">
            <div className="font-semibold col-span-4">{role.name}</div>
            <Input
              label={t('discountEngine.fields.maxPercentRole')}
              type="number"
              defaultValue={policy?.max_percent ?? ''}
              onBlur={e => savePolicy(role, {
                max_percent: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
            <Input
              label={t('discountEngine.fields.maxFixedAmount')}
              type="number"
              defaultValue={policy?.max_fixed_amount ?? ''}
              onBlur={e => savePolicy(role, {
                max_fixed_amount: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
            <Checkbox
              label={t('discountEngine.fields.canApplyManual')}
              defaultChecked={policy?.can_apply_manual !== false}
              onChange={e => savePolicy(role, { can_apply_manual: (e.target as HTMLInputElement).checked })}
            />
            <Checkbox
              label={t('discountEngine.fields.canOverrideApproval')}
              defaultChecked={policy?.can_override_approval === true}
              onChange={e => savePolicy(role, { can_override_approval: (e.target as HTMLInputElement).checked })}
            />
          </div>
        )
      })}
      <p className="text-sm text-neutral-500">
        {t('discountEngine.fields.allowedCategoriesHint')}: {categoryLabels}
      </p>
    </div>
  )
}
