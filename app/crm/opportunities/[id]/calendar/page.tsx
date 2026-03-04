"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { createCrmCalendarEvent, deleteCrmCalendarEvent, listCrmCalendarEvents, listCrmTasksForOpportunity } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import { getDateValue } from "@/lib/crm/activity"

export default function OpportunityCalendarPage() {
  const params = useParams()
  const { user } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [events, setEvents] = useState<Array<{ id: string; title: string; startAt: unknown; endAt: unknown; location?: string; visibility: string; createdById: string }>>([])
  const [openTasks, setOpenTasks] = useState<Array<{ id: string; title: string; dueAt?: unknown }>>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState("")
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [location, setLocation] = useState("")
  const [reminderAt, setReminderAt] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("GENERAL")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])

  const userOptions = useMemo(() => users.map((row) => ({ value: row.uid, label: row.displayName })), [users])

  const load = async () => {
    if (!opportunity || !user?.uid) return

    setLoading(true)
    try {
      const [eventRows, taskRows, userRows] = await Promise.all([
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

      setEvents(eventRows)
      setOpenTasks(taskRows.filter((task) => task.status !== "DONE" && task.status !== "CANCELED"))
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid])

  const upcoming = useMemo(() => {
    const eventItems = events.map((event) => ({
      id: `event_${event.id}`,
      type: "EVENT",
      title: event.title,
      when: getDateValue(event.startAt),
    }))

    const taskItems = openTasks
      .filter((task) => Boolean(task.dueAt))
      .map((task) => ({
        id: `task_${task.id}`,
        type: "TASK",
        title: task.title,
        when: getDateValue(task.dueAt),
      }))

    return [...eventItems, ...taskItems]
      .filter((item) => item.when)
      .sort((a, b) => (a.when?.getTime() || 0) - (b.when?.getTime() || 0))
      .slice(0, 10)
  }, [events, openTasks])

  if (!opportunity) {
    return <Panel title="Calendar"><p className="text-xs text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel title="Calendar" subtitle="MVP evenimente + upcoming (events + due tasks)">
      <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titlu eveniment" className="h-8 text-xs" />
          <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Locație" className="h-8 text-xs" />
          <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="h-8 text-xs" />
          <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="h-8 text-xs" />
          <Input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className="h-8 text-xs" />
          <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              {CRM_VISIBILITIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {CRM_VISIBILITY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {visibility === "CUSTOM" ? (
          <div className="mt-2">
            <MultiSelect options={userOptions} selected={visibleToUserIds} onChange={setVisibleToUserIds} placeholder="Alege useri" />
          </div>
        ) : null}

        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={async () => {
              if (!title.trim() || !startAt || !endAt || !user?.uid) return
              await createCrmCalendarEvent({
                opportunityId,
                title,
                startAt: new Date(startAt),
                endAt: new Date(endAt),
                location,
                reminderAt: reminderAt ? new Date(reminderAt) : undefined,
                createdById: user.uid,
                visibility,
                visibleToUserIds,
              })
              setTitle("")
              setStartAt("")
              setEndAt("")
              setLocation("")
              setReminderAt("")
              setVisibility("GENERAL")
              setVisibleToUserIds([])
              await load()
            }}
          >
            Adaugă eveniment
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-700">Evenimente</p>
          {loading ? (
            <p className="text-xs text-neutral-500">Se încarcă...</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-neutral-500">Nu există evenimente.</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-900">{event.title}</p>
                    <div className="flex items-center gap-1">
                      <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[event.visibility as keyof typeof CRM_VISIBILITY_LABELS]}</SubtleBadge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-rose-600"
                        onClick={async () => {
                          await deleteCrmCalendarEvent(event.id, user?.uid || "")
                          await load()
                        }}
                      >
                        Șterge
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{formatDateTime(event.startAt)} → {formatDateTime(event.endAt)}</p>
                  <p className="mt-1 text-xs text-neutral-500">{event.location || "fără locație"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-neutral-700">Upcoming</p>
          {upcoming.length === 0 ? (
            <p className="text-xs text-neutral-500">Nu există iteme viitoare.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((item) => (
                <div key={item.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <p className="text-xs font-medium text-neutral-800">[{item.type}] {item.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{formatDateTime(item.when)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
