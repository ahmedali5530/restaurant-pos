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

export const DEFAULT_BXGY_CONDITIONS: BuyXGetYCondition = {
  buy_quantity: 2,
  get_quantity: 1,
  buy_targets: {},
  get_targets: {},
  get_value_type: 'free',
  get_value: 100,
}

export const normalizeBxgyConditions = (
  value?: BuyXGetYCondition | null
): BuyXGetYCondition => {
  const base = value || DEFAULT_BXGY_CONDITIONS
  const getValueType = base.get_value_type || 'free'
  const rawValue = Number(base.get_value)
  const getValue = Number.isFinite(rawValue)
    ? rawValue
    : getValueType === 'fixed_amount'
      ? 0
      : 100

  return {
    buy_quantity: Math.max(1, Number(base.buy_quantity) || 1),
    get_quantity: Math.max(1, Number(base.get_quantity) || 1),
    buy_targets: {
      item_ids: base.buy_targets?.item_ids || [],
      category_ids: base.buy_targets?.category_ids || [],
    },
    get_targets: {
      item_ids: base.get_targets?.item_ids || [],
      category_ids: base.get_targets?.category_ids || [],
    },
    get_value_type: getValueType,
    get_value: getValue,
  }
}

const defaultGetValueForType = (
  type: BuyXGetYCondition['get_value_type'],
  previousType: BuyXGetYCondition['get_value_type'],
  previous?: number
): number => {
  if (type === 'free') return 100
  if (type === 'percent') {
    if (previousType === 'percent' && previous !== undefined && previous > 0 && previous <= 100) {
      return previous
    }
    // free is 100% off; when switching to percent, default to a typical partial promo
    return 50
  }
  if (previousType === 'fixed_amount' && previous !== undefined && previous >= 0) {
    return previous
  }
  return 0
}

export const DiscountConditionsEditor = ({ open = true, value, onChange }: Props) => {
  const { t } = useTranslation('admin')
  const {
    categoryOptions,
    dishOptions,
    categoryLabelById,
    dishLabelById,
    loading,
  } = useDiscountEntityOptions(open)

  const conditions = normalizeBxgyConditions(value)

  const patch = (p: Partial<BuyXGetYCondition>) => {
    onChange(normalizeBxgyConditions({ ...conditions, ...p }))
  }

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

  const showGetValue = conditions.get_value_type !== 'free'
  const getValueLabel = conditions.get_value_type === 'percent'
    ? t('discountEngine.fields.getValuePercent')
    : t('discountEngine.fields.getValueAmount')

  return (
    <div className="flex flex-col gap-3 border rounded-lg p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Input
            label={t('discountEngine.fields.buyQuantity')}
            type="number"
            min={1}
            value={conditions.buy_quantity}
            onChange={e => patch({ buy_quantity: Number(e.target.value) })}
          />
        </div>
        <div>
          <Input
            label={t('discountEngine.fields.getQuantity')}
            type="number"
            min={1}
            value={conditions.get_quantity}
            onChange={e => patch({ get_quantity: Number(e.target.value) })}
          />
        </div>
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label>{t('discountEngine.fields.getValueType')}</label>
          <ReactSelect
            value={getValueTypeOptions.find(o => o.value === conditions.get_value_type)}
            onChange={(opt: { value: string } | null) => {
              if (!opt) return
              const nextType = opt.value as BuyXGetYCondition['get_value_type']
              patch({
                get_value_type: nextType,
                get_value: defaultGetValueForType(
                  nextType,
                  conditions.get_value_type,
                  conditions.get_value
                ),
              })
            }}
            options={getValueTypeOptions}
          />
        </div>
        {showGetValue && (
          <div>
            <Input
              label={getValueLabel}
              type="number"
              min={0}
              max={conditions.get_value_type === 'percent' ? 100 : undefined}
              step={conditions.get_value_type === 'percent' ? 1 : 0.01}
              value={conditions.get_value}
              onChange={e => {
                const next = Number(e.target.value)
                if (!Number.isFinite(next)) {
                  patch({ get_value: 0 })
                  return
                }
                if (conditions.get_value_type === 'percent') {
                  patch({ get_value: Math.min(100, Math.max(0, next)) })
                  return
                }
                patch({ get_value: Math.max(0, next) })
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
