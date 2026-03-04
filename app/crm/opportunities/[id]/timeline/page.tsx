"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Panel } from "@/components/crm"
import { listCrmActivity } from "@/lib/crm/activity"
import { formatDateTime, formatRelativeDate } from "@/lib/crm/presenters"
import type { CrmActivityLog } from "@/lib/crm/types"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"

export default function OpportunityTimelinePage() {
  const params = useParams()
  const { user } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity, loading: opportunityLoading } = useCrmOpportunity(opportunityId, user?.uid)

  const [activities, setActivities] = useState<CrmActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!opportunity || !user?.uid) return

      setLoading(true)
      try {
        const rows = await listCrmActivity({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        })
        setActivities(rows)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [opportunity, opportunityId, user?.uid])

  if (opportunityLoading) {
    return <Panel title="Istoric"><p className="text-xs text-neutral-500">Se încarcă...</p></Panel>
  }

  if (!opportunity) {
    return <Panel title="Istoric"><p className="text-xs text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel title="Istoric" subtitle="Inima oportunității: activitate cronologică, cu visibility aplicat">
      {loading ? (
        <p className="text-xs text-neutral-500">Se încarcă activitatea...</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-neutral-500">Nu există activitate.</p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-neutral-800">{activity.type}</p>
                <p className="text-xs text-neutral-500">{formatRelativeDate(activity.createdAt)}</p>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Actor: {activity.actorId}</p>
              {activity.payload ? (
                <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-50 p-2 text-[11px] text-neutral-600">{JSON.stringify(activity.payload, null, 2)}</pre>
              ) : null}
              <p className="mt-2 text-[11px] text-neutral-400">{formatDateTime(activity.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
