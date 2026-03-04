"use client"

import { useEffect, useState } from "react"
import type { CrmOpportunity } from "@/lib/crm/types"
import { getCrmOpportunityById } from "@/lib/crm/opportunities"

export function useCrmOpportunity(opportunityId: string, userId?: string) {
  const [opportunity, setOpportunity] = useState<CrmOpportunity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!opportunityId || !userId) {
        setOpportunity(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const row = await getCrmOpportunityById(opportunityId, userId)
        setOpportunity(row)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [opportunityId, userId])

  return { opportunity, loading }
}
