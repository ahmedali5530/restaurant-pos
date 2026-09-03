import { useEffect, useMemo } from 'react'
import useApi, { SettingsData } from '@/api/db/use.api.ts'
import { Tables } from '@/api/db/tables.ts'
import { Category } from '@/api/model/category.ts'
import { Dish } from '@/api/model/dish.ts'
import { Floor } from '@/api/model/floor.ts'
import { PaymentType } from '@/api/model/payment_type.ts'
import { toTargetId } from '@/lib/discount-engine/target-ids.ts'

export type DiscountEntityOption = { label: string; value: string }

const toOption = (id: unknown, label: string): DiscountEntityOption => ({
  label,
  value: toTargetId(id),
})

export const useDiscountEntityOptions = (open: boolean) => {
  const {
    data: categories,
    fetchData: fetchCategories,
    isFetching: loadingCategories,
  } = useApi<SettingsData<Category>>(Tables.categories, [], ['name asc'], 0, 99999, [], { enabled: false })

  const {
    data: dishes,
    fetchData: fetchDishes,
    isFetching: loadingDishes,
  } = useApi<SettingsData<Dish>>(Tables.dishes, [], ['name asc'], 0, 99999, ['categories'], { enabled: false })

  const {
    data: floors,
    fetchData: fetchFloors,
    isFetching: loadingFloors,
  } = useApi<SettingsData<Floor>>(Tables.floors, [], ['name asc'], 0, 99999, [], { enabled: false })

  const {
    data: paymentTypes,
    fetchData: fetchPaymentTypes,
    isFetching: loadingPaymentTypes,
  } = useApi<SettingsData<PaymentType>>(
    Tables.payment_types,
    ['deleted_at = none'],
    ['priority asc'],
    0,
    99999,
    [],
    { enabled: false }
  )

  useEffect(() => {
    if (open) {
      fetchCategories()
      fetchDishes()
      fetchFloors()
      fetchPaymentTypes()
    }
  }, [open, fetchCategories, fetchDishes, fetchFloors, fetchPaymentTypes])

  const categoryOptions = useMemo(
    () => (categories?.data || []).map(c => toOption(c.id, c.name)),
    [categories]
  )

  const dishOptions = useMemo(
    () => (dishes?.data || []).map(d => toOption(d.id, d.name)),
    [dishes]
  )

  const floorOptions = useMemo(
    () => (floors?.data || []).map(f => toOption(f.id, f.name)),
    [floors]
  )

  const paymentTypeOptions = useMemo(
    () => (paymentTypes?.data || []).map(p => toOption(p.id, p.name)),
    [paymentTypes]
  )

  const categoryLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories?.data || []) {
      map.set(toTargetId(c.id), c.name)
    }
    return map
  }, [categories])

  const dishLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of dishes?.data || []) {
      map.set(toTargetId(d.id), d.name)
    }
    return map
  }, [dishes])

  const floorLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of floors?.data || []) {
      map.set(toTargetId(f.id), f.name)
    }
    return map
  }, [floors])

  const paymentTypeLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of paymentTypes?.data || []) {
      map.set(toTargetId(p.id), p.name)
    }
    return map
  }, [paymentTypes])

  return {
    categoryOptions,
    dishOptions,
    floorOptions,
    paymentTypeOptions,
    categoryLabelById,
    dishLabelById,
    floorLabelById,
    paymentTypeLabelById,
    loading: loadingCategories || loadingDishes || loadingFloors || loadingPaymentTypes,
  }
}
