import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx'
import { Input } from '@/components/common/input/input.tsx'
import type { DiscountScope } from '@/api/model/discount.ts'
import type { DiscountTargets } from '@/api/model/discount.ts'
import { useDiscountEntityOptions } from '@/hooks/useDiscountEntityOptions.ts'
import { idsFromOptions, optionsFromIds } from '@/lib/discount-engine/target-ids.ts'

interface Props {
  open: boolean
  scope: DiscountScope | string
  value: DiscountTargets
  onChange: (value: DiscountTargets) => void
}

export const DiscountTargetsEditor = ({ open, scope, value, onChange }: Props) => {
  const { t } = useTranslation('admin')
  const {
    categoryOptions,
    dishOptions,
    floorOptions,
    categoryLabelById,
    dishLabelById,
    floorLabelById,
    loading,
  } = useDiscountEntityOptions(open)

  const categorySelected = useMemo(
    () => optionsFromIds(value.category_ids, categoryLabelById),
    [value.category_ids, categoryLabelById]
  )

  const itemSelected = useMemo(
    () => optionsFromIds(value.item_ids, dishLabelById),
    [value.item_ids, dishLabelById]
  )

  const floorSelected = useMemo(
    () => optionsFromIds(value.floor_ids, floorLabelById),
    [value.floor_ids, floorLabelById]
  )

  const patch = (partial: Partial<DiscountTargets>) => onChange({ ...value, ...partial })

  if (scope === 'item') {
    return (
      <div>
        <label>{t('discountEngine.fields.targetItems')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={dishOptions}
          value={itemSelected}
          onChange={opts => patch({ item_ids: idsFromOptions(opts as { value: string; label: string }[]) })}
        />
      </div>
    )
  }

  if (scope === 'category') {
    return (
      <div>
        <label>{t('discountEngine.fields.targetCategories')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={categoryOptions}
          value={categorySelected}
          onChange={opts => patch({ category_ids: idsFromOptions(opts as { value: string; label: string }[]) })}
        />
      </div>
    )
  }

  if (scope === 'floor') {
    return (
      <div>
        <label>{t('discountEngine.fields.targetFloors')}</label>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={floorOptions}
          value={floorSelected}
          onChange={opts => patch({ floor_ids: idsFromOptions(opts as { value: string; label: string }[]) })}
        />
      </div>
    )
  }

  if (scope === 'customer') {
    return (
      <div className="flex flex-col gap-2">
        <Input
          label={t('discountEngine.fields.customerTags')}
          value={(value.customer_tags || []).join(', ')}
          onChange={e => patch({
            customer_tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
          })}
        />
        <p className="text-sm text-neutral-500">{t('discountEngine.fields.customerTagsHint')}</p>
      </div>
    )
  }

  if (scope === 'cart') {
    return (
      <div>
        <label>{t('discountEngine.fields.targetFloors')}</label>
        <p className="text-sm text-neutral-500 mb-2">{t('discountEngine.fields.targetFloorsOptional')}</p>
        <ReactSelect
          isMulti
          isLoading={loading}
          options={floorOptions}
          value={floorSelected}
          onChange={opts => patch({ floor_ids: idsFromOptions(opts as { value: string; label: string }[]) })}
        />
      </div>
    )
  }

  return null
}
