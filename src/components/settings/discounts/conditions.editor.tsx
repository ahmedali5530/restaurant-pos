import { useTranslation } from 'react-i18next'
import { Input } from '@/components/common/input/input.tsx'
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx'
import type { BuyXGetYCondition } from '@/api/model/discount.ts'
import { translatedSelectOptions } from '@/lib/discount-engine/i18n-options.ts'
import { useDiscountEntityOptions } from '@/hooks/useDiscountEntityOptions.ts'
import { idsFromOptions, optionsFromIds } from '@/lib/discount-engine/target-ids.ts'

interface Props {
  open?: boolean
  value?: BuyXGetYCondition
  onChange: (value?: BuyXGetYCondition) => void
}

const GET_VALUE_TYPES = ['free', 'percent', 'fixed_amount'] as const

export const DiscountConditionsEditor = ({ open = true, value, onChange }: Props) => {
  const { t } = useTranslation('admin')
  const {
    categoryOptions,
    dishOptions,
    categoryLabelById,
    dishLabelById,
    loading,
  } = useDiscountEntityOptions(open)

  const conditions = value || {
    buy_quantity: 2,
    get_quantity: 1,
    buy_targets: {},
    get_targets: {},
    get_value_type: 'free' as const,
    get_value: 100,
  }

  const patch = (p: Partial<BuyXGetYCondition>) => onChange({ ...conditions, ...p })

  const getValueTypeOptions = translatedSelectOptions(
    [...GET_VALUE_TYPES],
    t,
    'discountEngine.getValueTypes'
  )

  const buyCategorySelected = optionsFromIds(
    conditions.buy_targets.category_ids,
    categoryLabelById
  )
  const buyItemSelected = optionsFromIds(
    conditions.buy_targets.item_ids,
    dishLabelById
  )
  const getCategorySelected = optionsFromIds(
    conditions.get_targets.category_ids,
    categoryLabelById
  )
  const getItemSelected = optionsFromIds(
    conditions.get_targets.item_ids,
    dishLabelById
  )

  return (
    <div className="flex flex-col gap-3 border rounded-lg p-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('discountEngine.fields.buyQuantity')}
          type="number"
          value={conditions.buy_quantity}
          onChange={e => patch({ buy_quantity: Number(e.target.value) })}
        />
        <Input
          label={t('discountEngine.fields.getQuantity')}
          type="number"
          value={conditions.get_quantity}
          onChange={e => patch({ get_quantity: Number(e.target.value) })}
        />
      </div>

      <div>
        <label>{t('discountEngine.fields.buyCategories')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={categoryOptions}
          value={buyCategorySelected}
          onChange={opts => patch({
            buy_targets: {
              ...conditions.buy_targets,
              category_ids: idsFromOptions(opts as { value: string; label: string }[]),
            },
          })}
        />
      </div>
      <div>
        <label>{t('discountEngine.fields.buyItems')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={dishOptions}
          value={buyItemSelected}
          onChange={opts => patch({
            buy_targets: {
              ...conditions.buy_targets,
              item_ids: idsFromOptions(opts as { value: string; label: string }[]),
            },
          })}
        />
      </div>

      <div>
        <label>{t('discountEngine.fields.getCategories')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={categoryOptions}
          value={getCategorySelected}
          onChange={opts => patch({
            get_targets: {
              ...conditions.get_targets,
              category_ids: idsFromOptions(opts as { value: string; label: string }[]),
            },
          })}
        />
      </div>
      <div>
        <label>{t('discountEngine.fields.getItems')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={dishOptions}
          value={getItemSelected}
          onChange={opts => patch({
            get_targets: {
              ...conditions.get_targets,
              item_ids: idsFromOptions(opts as { value: string; label: string }[]),
            },
          })}
        />
      </div>

      <div>
        <label>{t('discountEngine.fields.getValueType')}</label>
        <ReactSelect
          value={getValueTypeOptions.find(o => o.value === conditions.get_value_type)}
          onChange={(opt: { value: string } | null) => {
            if (opt) {
              patch({ get_value_type: opt.value as BuyXGetYCondition['get_value_type'] })
            }
          }}
          options={getValueTypeOptions}
        />
      </div>
    </div>
  )
}
