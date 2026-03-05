"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { OpportunityScheduleOverview, Panel } from "@/components/crm"
import { listCrmActivity } from "@/lib/crm/activity"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { listCrmCalendarEvents, listCrmTasksForOpportunity } from "@/lib/crm/tasks"
import { formatDateTime, formatRelativeDate } from "@/lib/crm/presenters"
import type { CrmActivityLog, CrmCalendarEvent, CrmTask } from "@/lib/crm/types"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"

const TIMELINE_ACTIVITY_TYPES = new Set([
  "CREATED",
  "TASK_CREATED",
  "TASK_COMPLETED",
  "NOTE_CREATED",
  "EMAIL_LOGGED",
  "CALENDAR_EVENT_CREATED",
  "FILE_UPLOADED",
  "STAGE_CHANGED",
])

function formatActivityEntry(activity: CrmActivityLog) {
  const payload = (activity.payload || {}) as Record<string, unknown>

  if (activity.type === "CREATED") {
    const code = String(payload.code || "")
    const title = String(payload.title || "")
    return {
      label: "Oportunitate creată",
      detail: [code, title].filter(Boolean).join(" - "),
    }
  }

  if (activity.type === "TASK_CREATED") {
    return {
      label: "Task creat",
      detail: String(payload.title || "Task nou"),
    }
  }

  if (activity.type === "TASK_COMPLETED") {
    return {
      label: "Task completat",
      detail: String(payload.title || "Task finalizat"),
    }
  }

  if (activity.type === "NOTE_CREATED") {
    return {
      label: "Notă adăugată",
      detail: String(payload.preview || "Notă nouă în oportunitate"),
    }
  }

  if (activity.type === "EMAIL_LOGGED") {
    const direction = String(payload.direction || "")
    const subject = String(payload.subject || "")
    const directionLabel = direction === "IN" ? "Email primit" : "Email trimis"
    return {
      label: "Email logat",
      detail: [directionLabel, subject].filter(Boolean).join(" - "),
    }
  }

  if (activity.type === "CALENDAR_EVENT_CREATED") {
    return {
      label: "Eveniment creat",
      detail: String(payload.title || "Eveniment nou în calendar"),
    }
  }

  if (activity.type === "FILE_UPLOADED") {
    return {
      label: "Fișier încărcat",
      detail: String(payload.filename || "Fișier adăugat"),
    }
  }

  if (activity.type === "STAGE_CHANGED") {
    const fromLabel = String(payload.fromLabel || "")
    const toLabel = String(payload.toLabel || "")
    const transition = [fromLabel, toLabel].filter(Boolean).join(" -> ")
    return {
      label: "Stage modificat",
      detail: transition || "Stage actualizat",
    }
  }

  return {
    label: activity.type,
    detail: "",
  }
}

export default function OpportunityTimelinePage() {
  const params = useParams()
  const { user } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity, loading: opportunityLoading } = useCrmOpportunity(opportunityId, user?.uid)

  const [activities, setActivities] = useState<CrmActivityLog[]>([])
  const [events, setEvents] = useState<CrmCalendarEvent[]>([])
  const [openTasks, setOpenTasks] = useState<CrmTask[]>([])
  const [actorNameMap, setActorNameMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const visibleActivities = useMemo(
    () => activities.filter((activity) => TIMELINE_ACTIVITY_TYPES.has(activity.type)),
    [activities]
  )

  useEffect(() => {
    const load = async () => {
      if (!opportunity || !user?.uid) return

      setLoading(true)
      try {
        const [activityRows, eventRows, taskRows, userRows] = await Promise.all([
          listCrmActivity({
            opportunityId,
            userId: user.uid,
            opportunityOwnerId: opportunity.ownerId,
          }),
          listCrmCalendarEvents({
            opportunityId,
            userId: user.uid,
            opportunityOwnerId: opportunity.ownerId,
          }),
          listCrmTasksForOpportunity({
            opportunityId,
            userId: user.uid,
            opportunityOwnerId: opportunity.ownerId,
          }),
          listCrmUsers(),
        ])

        setActivities(activityRows)
        setEvents(eventRows)
        setOpenTasks(taskRows.filter((task) => task.status === "TODO" || task.status === "IN_PROGRESS"))
        setActorNameMap(
          userRows.reduce<Record<string, string>>((acc, crmUser) => {
            acc[crmUser.uid] = crmUser.displayName || crmUser.email || crmUser.uid
            return acc
          }, {})
        )
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
    <div className="space-y-3">
      <Panel
        title="Calendar și programări curente"
        subtitle="Ce este în calendar și ce avem programat acum, azi și în următoarele zile."
      >
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-700">Ce este în calendar ({events.length})</p>
            {loading ? (
              <p className="text-xs text-neutral-500">Se încarcă evenimentele...</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-neutral-500">Nu există evenimente în calendar.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <p className="text-xs font-medium text-neutral-900">{event.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatDateTime(event.startAt)} → {formatDateTime(event.endAt)}</p>
                    <p className="mt-1 text-xs text-neutral-500">{event.location || "fără locație"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <OpportunityScheduleOverview events={events} tasks={openTasks} loading={loading} />
        </div>
      </Panel>

      <Panel title="Istoric" subtitle="Inima oportunității: activitate cronologică, cu visibility aplicat">
        {loading ? (
          <p className="text-xs text-neutral-500">Se încarcă activitatea...</p>
        ) : visibleActivities.length === 0 ? (
          <p className="text-xs text-neutral-500">Nu există activitate.</p>
        ) : (
          <div className="space-y-3">
            {visibleActivities.map((activity) => {
              const entry = formatActivityEntry(activity)
              return (
                <div key={activity.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-neutral-800">{entry.label}</p>
                  <p className="text-xs text-neutral-500">{formatRelativeDate(activity.createdAt)}</p>
                </div>
                  {entry.detail ? <p className="mt-1 text-xs text-neutral-700">{entry.detail}</p> : null}
                <p className="mt-1 text-xs text-neutral-500">Actor: {actorNameMap[activity.actorId] || activity.actorId}</p>
                <p className="mt-2 text-[11px] text-neutral-400">{formatDateTime(activity.createdAt)}</p>
              </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
