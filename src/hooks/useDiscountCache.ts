import { useEffect } from 'react'
import { useDB } from '@/api/db/db.ts'
import { buildDiscountCache } from '@/lib/discount-engine/cache.ts'
import { loadActiveDiscountRules } from '@/lib/discount-engine/service.ts'
import type { LiveSubscription } from 'surrealdb'

let initPromise: Promise<void> | null = null

export const refreshDiscountCache = async (db: ReturnType<typeof useDB>): Promise<void> => {
  const rules = await loadActiveDiscountRules(db)
  buildDiscountCache(rules)
}

export const useDiscountCache = () => {
  const db = useDB()

  useEffect(() => {
    if (!initPromise) {
      initPromise = refreshDiscountCache(db).catch(() => {
        initPromise = null
      })
    }

    let liveSub: LiveSubscription | undefined
    const setup = async () => {
      await refreshDiscountCache(db)
      try {
        liveSub = await db.live('discount', () => {
          void refreshDiscountCache(db)
        })
      } catch {
        // live may not be available in all environments
      }
    }
    void setup()

    return () => {
      liveSub?.kill().catch(() => {})
    }
  }, [db])
}
