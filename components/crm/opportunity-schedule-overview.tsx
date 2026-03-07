"use client"

import { useMemo } from "react"
import { SubtleBadge } from "@/components/crm/subtle-badge"
import { getDateValue } from "@/lib/crm/activity"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmCalendarEvent, CrmTask } from "@/lib/crm/types"

interface OpportunityScheduleOverviewProps {
  events: CrmCalendarEvent[]
  tasks: CrmTask[]
  loading?: boolean
  maxItemsPerSection?: number
}

type ScheduleItem = {
  id: string
  type: "EVENT" | "SARCINA"
  title: string
  when: Date
  until?: Date
  location?: string
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function getEndOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999)
}

function isOpenTask(task: CrmTask) {
  return task.status === "TODO" || task.status === "IN_PROGRESS"
}

function renderScheduleItem(item: ScheduleItem) {
  return (
    <div key={item.id} className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <SubtleBadge tone={item.type === "EVENT" ? "neutral" : "warning"}>[{item.type}]</SubtleBadge>
        <p className="min-w-0 truncate text-sm font-medium text-neutral-900" title={item.title}>
          {item.title}
        </p>
      </div>
      <p className="text-sm text-neutral-600">
        {formatDateTime(item.when)}
        {item.until ? ` → ${formatDateTime(item.until)}` : ""}
      </p>
      {item.location ? <p className="mt-1 truncate text-sm text-neutral-500">Locație: {item.location}</p> : null}
    </div>
  )
}

export function OpportunityScheduleOverview({
  events,
  tasks,
  loading = false,
  maxItemsPerSection = 8,
}: OpportunityScheduleOverviewProps) {
  const buckets = useMemo(() => {
    const now = new Date()
    const endOfToday = getEndOfDay(now)

    const eventNow: ScheduleItem[] = []
    const eventToday: ScheduleItem[] = []
    const eventUpcoming: ScheduleItem[] = []

    events.forEach((event) => {
      const startAt = getDateValue(event.startAt)
      if (!startAt) return
      const endAt = getDateValue(event.endAt) || startAt

      const item: ScheduleItem = {
        id: `event_${event.id}`,
        type: "EVENT",
        title: event.title,
        when: startAt,
        until: endAt,
        location: event.location,
      }

      if (startAt <= now && now < endAt) {
        eventNow.push(item)
        return
      }

      if (isSameDay(startAt, now) && startAt >= now) {
        eventToday.push(item)
        return
      }

      if (startAt > endOfToday) {
        eventUpcoming.push(item)
      }
    })

    const taskToday: ScheduleItem[] = []
    const taskUpcoming: ScheduleItem[] = []

    tasks.forEach((task) => {
      if (!isOpenTask(task)) return
      const dueAt = getDateValue(task.dueAt)
      if (!dueAt) return

      const item: ScheduleItem = {
        id: `task_${task.id}`,
        type: "SARCINA",
        title: task.title,
        when: dueAt,
      }

      if (isSameDay(dueAt, now) && dueAt >= now) {
        taskToday.push(item)
        return
      }

      if (dueAt > endOfToday) {
        taskUpcoming.push(item)
      }
    })

    const sortByDate = (left: ScheduleItem, right: ScheduleItem) => left.when.getTime() - right.when.getTime()

    const inProgressNow = eventNow.sort(sortByDate).slice(0, maxItemsPerSection)
    const scheduledToday = [...eventToday, ...taskToday].sort(sortByDate).slice(0, maxItemsPerSection)
    const upcoming = [...eventUpcoming, ...taskUpcoming].sort(sortByDate).slice(0, maxItemsPerSection)

    return { inProgressNow, scheduledToday, upcoming }
  }, [events, maxItemsPerSection, tasks])

  if (loading) {
    return <p className="text-sm text-neutral-500">Se încarcă programările...</p>
  }

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-2 text-sm font-medium text-neutral-700">În desfășurare acum ({buckets.inProgressNow.length})</p>
        {buckets.inProgressNow.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există evenimente active acum.</p>
        ) : (
          <div className="space-y-2">{buckets.inProgressNow.map(renderScheduleItem)}</div>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-2 text-sm font-medium text-neutral-700">Programate azi ({buckets.scheduledToday.length})</p>
        {buckets.scheduledToday.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există programări pentru restul zilei.</p>
        ) : (
          <div className="space-y-2">{buckets.scheduledToday.map(renderScheduleItem)}</div>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-2 text-sm font-medium text-neutral-700">Următoarele programări ({buckets.upcoming.length})</p>
        {buckets.upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există programări viitoare.</p>
        ) : (
          <div className="space-y-2">{buckets.upcoming.map(renderScheduleItem)}</div>
        )}
      </div>
    </div>
  )
}
