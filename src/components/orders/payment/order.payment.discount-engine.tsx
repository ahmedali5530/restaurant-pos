import useApi, { SettingsData } from '@/api/db/use.api.ts'
import { Tables } from '@/api/db/tables.ts'
import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/common/input/button.tsx'
import {
  Discount,
  DiscountType,
  getDiscountMaxValue,
  getDiscountMinValue,
  getDiscountValueType,
} from '@/api/model/discount.ts'
import { DiscountReason } from '@/api/model/discount_reason.ts'
import { Order } from '@/api/model/order.ts'
import { withCurrency } from '@/lib/utils.ts'
import { useTranslation } from 'react-i18next'
import type { AppliedDiscountLine } from '@/lib/discount-engine/types.ts'
import { computeScopedDiscount } from '@/lib/discount-engine/calculator.ts'
import { orderItemToEvaluable } from '@/lib/discount-engine/context.ts'
import { getOrderFilteredItems } from '@/lib/order.ts'
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx'
import { matchesApplicationMode } from '@/lib/discount-engine/eligibility.ts'

interface Props {
  order: Order
  discountLines: AppliedDiscountLine[]
  onApply: (lines: AppliedDiscountLine[]) => void
}

export const OrderPaymentDiscountEngine = ({
  order,
  discountLines,
  onApply,
}: Props) => {
  const { t } = useTranslation(['payment', 'common'])

  const { data: discounts } = useApi<SettingsData<Discount>>(
    Tables.discounts,
    ['deleted_at = none and is_active != false'],
    ['priority asc'],
    0,
    99999
  )

  const { data: reasons } = useApi<SettingsData<DiscountReason>>(
    Tables.discount_reasons,
    ['deleted_at = none and is_active = true'],
    ['name asc'],
    0,
    99999
  )

  const manualDiscounts = useMemo(
    () => (discounts?.data || []).filter(d => matchesApplicationMode(d, 'manual')),
    [discounts]
  )

  const keyboardKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0]

  const [draftLines, setDraftLines] = useState<AppliedDiscountLine[]>(discountLines)
  const [draftDiscount, setDraftDiscount] = useState<Discount | undefined>()
  const [draftAmount, setDraftAmount] = useState(0)
  const [draftRate, setDraftRate] = useState(0)
  const [percentInput, setPercentInput] = useState<number | undefined>()
  const [keyboard, setKeyboard] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [reasonId, setReasonId] = useState<string | undefined>()
  const [reasonText, setReasonText] = useState('')

  useEffect(() => {
    setDraftLines(discountLines)
  }, [discountLines])

  const filteredItems = useMemo(() => getOrderFilteredItems(order), [order])

  const evalItems = useMemo(
    () => filteredItems.map(orderItemToEvaluable),
    [filteredItems]
  )

  const itemIds = useMemo(
    () => filteredItems.map(item => ({
      id: item.id?.toString() || '',
      label: item.item?.name || '',
    })),
    [filteredItems]
  )

  const addDiscount = (discount: Discount) => {
    setDraftDiscount(discount)
    setKeyboard(false)
    const minVal = getDiscountMinValue(discount)
    const maxVal = getDiscountMaxValue(discount)
    const valueType = getDiscountValueType(discount)

    if (valueType === 'percent') {
      if (minVal === maxVal) {
        setDraftRate(minVal)
        setPercentInput(undefined)
      } else {
        setKeyboard(true)
        setPercentInput(minVal)
        setDraftRate(minVal)
      }
    } else {
      if (minVal === maxVal) {
        setDraftAmount(minVal)
      } else {
        setKeyboard(true)
        setDraftAmount(minVal)
      }
    }
  }

  const manualKey = (key: number | string) => {
    if (!draftDiscount) return
    const valueType = getDiscountValueType(draftDiscount)
    const minVal = getDiscountMinValue(draftDiscount)
    const maxVal = getDiscountMaxValue(draftDiscount)

    if (valueType === 'percent' && minVal !== maxVal) {
      setPercentInput(prev => Number((prev?.toString() || '') + key))
    } else {
      setDraftAmount(prev => Number(prev.toString() + key))
    }
  }

  const resolved = useMemo(() => {
    if (!draftDiscount) {
      return { amount: 0, rate: 0 }
    }
    const computed = computeScopedDiscount(draftDiscount, evalItems, {
      rate: percentInput ?? draftRate,
      amount: draftAmount,
      targetItemIds: selectedItemIds.length ? selectedItemIds : undefined,
    })
    return { amount: computed.appliedAmount, rate: computed.appliedRate ?? 0 }
  }, [draftDiscount, evalItems, percentInput, draftRate, draftAmount, selectedItemIds])

  const reasonOptions = (reasons?.data || []).map(r => ({
    label: r.name,
    value: r.id,
  }))

  const toggleItem = (id: string) => {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="flex flex-col justify-between h-full gap-4">
      <div className="flex flex-col gap-4 overflow-auto">
        <Button
          variant="danger"
          active={draftLines.length === 0}
          onClick={() => {
            setDraftLines([])
            onApply([])
          }}
        >
          {t('discount.noDiscount')}
        </Button>

        {draftLines.length > 0 && (
          <div className="flex flex-col gap-2 border rounded-lg p-3">
            <div className="font-semibold">{t('discount.applied')}</div>
            {draftLines.map((line, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span>{line.name}</span>
                <div className="flex gap-2 items-center">
                  <span>{withCurrency(line.appliedAmount)}</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const next = draftLines.filter((_, i) => i !== idx)
                      setDraftLines(next)
                      onApply(next)
                    }}
                  >
                    {t('common:actions.remove')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {manualDiscounts.map(item => (
            <Button
              key={item.id}
              variant="primary"
              active={item.id === draftDiscount?.id}
              onClick={() => addDiscount(item)}
            >
              {item.name}
            </Button>
          ))}
        </div>

        {draftDiscount && (draftDiscount.scope === 'item' || itemIds.length > 1) && (
          <div className="flex flex-col gap-2">
            <div className="font-medium">{t('discount.selectItems')}</div>
            <div className="flex flex-wrap gap-2">
              {itemIds.map(item => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={selectedItemIds.includes(item.id) ? 'success' : 'neutral'}
                  onClick={() => toggleItem(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {draftDiscount?.requires_reason && (
          <div className="flex flex-col gap-2">
            <label>{t('discount.reason')}</label>
            <ReactSelect
              options={reasonOptions}
              value={reasonOptions.find(o => o.value === reasonId)}
              onChange={(opt: any) => setReasonId(opt?.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder={t('discount.reasonNotes')}
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="text-2xl text-center">
        {withCurrency(resolved.amount)}{' '}
        {draftDiscount && getDiscountValueType(draftDiscount) === 'percent' && (
          <>({resolved.rate}%)</>
        )}
      </div>

      {keyboard && (
        <div className="grid grid-cols-3 gap-3">
          {keyboardKeys.map(item => (
            <Button key={String(item)} size="xl" flat variant="primary" onClick={() => manualKey(item)}>
              {item}
            </Button>
          ))}
          <Button size="xl" flat variant="primary" onClick={() => {
            setDraftAmount(0)
            setPercentInput(undefined)
            setDraftRate(0)
          }}>
            {t('common:actions.clear')}
          </Button>
        </div>
      )}

      <Button
        variant="success"
        size="lg"
        filled
        className="w-full"
        disabled={!!draftDiscount?.requires_reason && !reasonId}
        onClick={() => {
          if (!draftDiscount) return

          const valueType = getDiscountValueType(draftDiscount)
          const line: AppliedDiscountLine = {
            discountId: draftDiscount.id,
            name: draftDiscount.name,
            appliedAmount: resolved.amount,
            appliedRate: resolved.rate,
            scope: (draftDiscount.scope || 'cart') as any,
            valueType: valueType as any,
            taxTreatment: (draftDiscount.tax_treatment || 'tax_before_discount') as any,
            applicationType: 'manual',
            lineAllocations: selectedItemIds.length
              ? selectedItemIds.map(id => ({ orderItemId: id, amount: resolved.amount / selectedItemIds.length }))
              : undefined,
            reasonId,
            reasonText: reasonText || undefined,
          }

          const next = [...draftLines.filter(l => l.discountId !== line.discountId), line]
          setDraftLines(next)
          onApply(next)
          setDraftDiscount(undefined)
          setSelectedItemIds([])
          setReasonId(undefined)
          setReasonText('')
        }}
      >
        {t('discount.apply')}
      </Button>
    </div>
  )
}
