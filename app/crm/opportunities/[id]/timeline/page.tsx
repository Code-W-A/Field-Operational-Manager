"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import {
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileText,
  Handshake,
  Mail,
  MessageSquare,
  Milestone,
  PencilLine,
  PlusCircle,
  Trash2,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { OpportunityScheduleOverview, Panel } from "@/components/crm"
import { getDateValue, listCrmActivity } from "@/lib/crm/activity"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { listCrmCalendarEvents, listCrmTasksForOpportunity } from "@/lib/crm/tasks"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmActivityLog, CrmCalendarEvent, CrmTask } from "@/lib/crm/types"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"

function formatDayLabel(value: unknown) {
  const parsed = getDateValue(value)
  if (!parsed) return "Fără dată"
  return parsed.toLocaleDateString("ro-RO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function formatHour(value: unknown) {
  const parsed = getDateValue(value)
  if (!parsed) return "--:--"
  return parsed.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getActivityLabel(activityType: string) {
  const labelMap: Record<string, string> = {
    CREATED: "Oportunitate creată",
    UPDATED: "Date oportunitate modificate",
    STAGE_CHANGED: "Schimbare status",
    TASK_AUTO_CREATED: "Task automat",
    TASK_CREATED: "Task creat",
    TASK_UPDATED: "Task modificat",
    TASK_COMPLETED: "Task completat",
    TASK_DELETED: "Task șters",
    NOTE_CREATED: "Notă adăugată",
    NOTE_DELETED: "Notă ștearsă",
    FILE_UPLOADED: "Fișier adăugat",
    FILE_DELETED: "Fișier șters",
    EMAIL_LOGGED: "Email logat",
    CALENDAR_EVENT_CREATED: "Eveniment calendar creat",
    CALENDAR_EVENT_DELETED: "Eveniment calendar șters",
    INTERNAL_HANDOFF_CREATED: "Predare internă",
    INTERNAL_HANDOFF_CONFIRMED: "Confirmare predare internă",
  }
  return labelMap[activityType] || activityType
}

function getActivityVisual(activityType: string) {
  const styles: Record<string, { icon: typeof PlusCircle; dotClass: string; lineClass: string }> = {
    CREATED: { icon: PlusCircle, dotClass: "border-emerald-200 bg-emerald-50 text-emerald-700", lineClass: "bg-emerald-200" },
    UPDATED: { icon: PencilLine, dotClass: "border-sky-200 bg-sky-50 text-sky-700", lineClass: "bg-sky-200" },
    STAGE_CHANGED: { icon: Milestone, dotClass: "border-violet-200 bg-violet-50 text-violet-700", lineClass: "bg-violet-200" },
    TASK_AUTO_CREATED: { icon: ClipboardList, dotClass: "border-blue-200 bg-blue-50 text-blue-700", lineClass: "bg-blue-200" },
    TASK_CREATED: { icon: ClipboardList, dotClass: "border-blue-200 bg-blue-50 text-blue-700", lineClass: "bg-blue-200" },
    TASK_UPDATED: { icon: PencilLine, dotClass: "border-blue-200 bg-blue-50 text-blue-700", lineClass: "bg-blue-200" },
    TASK_COMPLETED: { icon: CheckCheck, dotClass: "border-lime-200 bg-lime-50 text-lime-700", lineClass: "bg-lime-200" },
    TASK_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    NOTE_CREATED: { icon: MessageSquare, dotClass: "border-cyan-200 bg-cyan-50 text-cyan-700", lineClass: "bg-cyan-200" },
    NOTE_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    FILE_UPLOADED: { icon: FileText, dotClass: "border-indigo-200 bg-indigo-50 text-indigo-700", lineClass: "bg-indigo-200" },
    FILE_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    EMAIL_LOGGED: { icon: Mail, dotClass: "border-amber-200 bg-amber-50 text-amber-700", lineClass: "bg-amber-200" },
    CALENDAR_EVENT_CREATED: { icon: CalendarDays, dotClass: "border-teal-200 bg-teal-50 text-teal-700", lineClass: "bg-teal-200" },
    CALENDAR_EVENT_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    INTERNAL_HANDOFF_CREATED: { icon: Handshake, dotClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700", lineClass: "bg-fuchsia-200" },
    INTERNAL_HANDOFF_CONFIRMED: { icon: CheckCheck, dotClass: "border-emerald-200 bg-emerald-50 text-emerald-700", lineClass: "bg-emerald-200" },
  }
  return styles[activityType] || { icon: ClipboardList, dotClass: "border-neutral-200 bg-neutral-50 text-neutral-700", lineClass: "bg-neutral-200" }
}

function renderKeyValueRow(label: string, value: ReactNode) {
  return (
    <p className="text-xs text-neutral-700">
      <span className="font-medium text-neutral-800">{label}:</span> {value}
    </p>
  )
}

function renderActivityContent(activity: CrmActivityLog, userNameMap: Record<string, string>) {
  const payload = (activity.payload || {}) as Record<string, unknown>
  const mapUser = (userId?: string | null) => {
    if (!userId) return "Neasignat"
    return userNameMap[userId] || "Utilizator necunoscut"
  }

  if (activity.type === "CREATED") {
    const opportunity = (payload.opportunity || {}) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Cod", String(payload.code || "-"))}
        {renderKeyValueRow("Titlu", String(opportunity.title || "-"))}
        {renderKeyValueRow("Owner", mapUser(String(opportunity.ownerId || "")))}
      </div>
    )
  }

  if (activity.type === "UPDATED") {
    const changes = (payload.changes || {}) as Record<string, unknown>
    const nonEmpty = Object.entries(changes).filter(([, value]) => value !== undefined)
    if (nonEmpty.length === 0) return <p className="text-xs text-neutral-500">Fără detalii suplimentare.</p>
    return (
      <div className="space-y-1.5">
        {nonEmpty.map(([key, value]) => renderKeyValueRow(key, String(value)))}
      </div>
    )
  }

  if (activity.type === "STAGE_CHANGED") {
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Din", String(payload.fromLabel || "-"))}
        {renderKeyValueRow("În", String(payload.toLabel || "-"))}
        {payload.lostReason ? renderKeyValueRow("Motiv", String(payload.lostReason)) : null}
      </div>
    )
  }

  if (activity.type === "NOTE_CREATED" || activity.type === "NOTE_DELETED") {
    const note = (payload.note || {}) as Record<string, unknown>
    const fullContent = String(payload.content || note.content || payload.preview || "").trim()
    return <p className="whitespace-pre-wrap text-xs text-neutral-700">{fullContent || "Notă fără conținut."}</p>
  }

  if (activity.type === "TASK_CREATED" || activity.type === "TASK_UPDATED" || activity.type === "TASK_COMPLETED" || activity.type === "TASK_DELETED") {
    const task = (payload.task || payload.before || {}) as Record<string, unknown>
    const changes = (payload.changes || {}) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Titlu", String(task.title || changes.title || "-"))}
        {renderKeyValueRow("Status", String(changes.status || task.status || "-"))}
        {renderKeyValueRow("Asignee", mapUser(String(changes.assigneeId || task.assigneeId || "")))}
        {(changes.dueAt || task.dueAt) ? renderKeyValueRow("Termen", formatDateTime(changes.dueAt || task.dueAt)) : null}
      </div>
    )
  }

  if (activity.type === "FILE_UPLOADED" || activity.type === "FILE_DELETED") {
    const filesRaw = Array.isArray(payload.files) ? payload.files : []
    const fallbackFile = payload.file
      ? [payload.file]
      : payload.filename
        ? [{ filename: payload.filename, size: payload.size, mime: payload.mime, url: payload.url }]
        : []
    const files = [...filesRaw, ...fallbackFile] as Array<Record<string, unknown>>
    if (files.length === 0) return <p className="text-xs text-neutral-500">Fără detalii fișier.</p>
    return (
      <div className="space-y-2">
        {files.map((file, idx) => (
          <div key={`${String(file.filename || "file")}-${idx}`} className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2">
            {renderKeyValueRow("Nume", String(file.filename || "-"))}
            {renderKeyValueRow("Tip", String(file.mime || "-"))}
            {renderKeyValueRow("Dimensiune", file.size ? `${Number(file.size).toLocaleString("ro-RO")} B` : "-")}
            {file.url ? (
              <p className="text-xs text-blue-700 break-all">
                <a href={String(file.url)} target="_blank" rel="noreferrer" className="hover:underline">
                  {String(file.url)}
                </a>
              </p>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  if (activity.type === "EMAIL_LOGGED") {
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Direcție", String(payload.direction || "-"))}
        {renderKeyValueRow("Subiect", String(payload.subject || "-"))}
        {renderKeyValueRow("From", String(payload.from || "-"))}
        {renderKeyValueRow("To", Array.isArray(payload.to) ? (payload.to as string[]).join(", ") : "-")}
        <p className="whitespace-pre-wrap text-xs text-neutral-700">{String(payload.bodySnippet || "") || "-"}</p>
      </div>
    )
  }

  if (activity.type === "CALENDAR_EVENT_CREATED" || activity.type === "CALENDAR_EVENT_DELETED") {
    const event = (payload.event || payload) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Titlu", String(event.title || "-"))}
        {renderKeyValueRow("Start", formatDateTime(event.startAt))}
        {renderKeyValueRow("Sfârșit", formatDateTime(event.endAt))}
        {renderKeyValueRow("Locație", String(event.location || "-"))}
      </div>
    )
  }

  if (activity.type === "INTERNAL_HANDOFF_CREATED" || activity.type === "INTERNAL_HANDOFF_CONFIRMED") {
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("De la", mapUser(String(payload.fromUserId || "")))}
        {renderKeyValueRow("Către", mapUser(String(payload.toUserId || "")))}
        {renderKeyValueRow("Sumă", `${String(payload.amount || 0)} ${String(payload.currency || "RON")}`)}
        {payload.note ? <p className="whitespace-pre-wrap text-xs text-neutral-700">{String(payload.note)}</p> : null}
      </div>
    )
  }

  if (activity.type === "TASK_AUTO_CREATED") {
    const task = (payload.task || {}) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Titlu", String(task.title || "-"))}
        {renderKeyValueRow("Termen", formatDateTime(task.dueAt))}
      </div>
    )
  }

  return (
    <pre className="overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-2 text-[11px] text-neutral-700">
      {JSON.stringify(payload, null, 2)}
    </pre>
  )
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
  const groupedActivities = useMemo(() => {
    const sorted = [...activities].sort((a, b) => {
      const aMs = getDateValue(a.createdAt)?.getTime() || 0
      const bMs = getDateValue(b.createdAt)?.getTime() || 0
      return bMs - aMs
    })
    const groups: Array<{ key: string; label: string; items: CrmActivityLog[] }> = []
    const byKey = new Map<string, number>()
    sorted.forEach((activity) => {
      const parsed = getDateValue(activity.createdAt)
      const key = parsed ? parsed.toISOString().slice(0, 10) : "fara-data"
      const index = byKey.get(key)
      if (index === undefined) {
        byKey.set(key, groups.length)
        groups.push({
          key,
          label: formatDayLabel(activity.createdAt),
          items: [activity],
        })
      } else {
        groups[index].items.push(activity)
      }
    })
    return groups
  }, [activities])

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
        ) : activities.length === 0 ? (
          <p className="text-xs text-neutral-500">Nu există activitate.</p>
        ) : (
          <div className="space-y-4">
            {groupedActivities.map((group) => (
              <div key={group.key} className="space-y-2">
                <p className="border-b border-neutral-200 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">{group.label}</p>
                <div className="space-y-2.5">
                  {group.items.map((activity, index) => {
                    const visual = getActivityVisual(activity.type)
                    const Icon = visual.icon
                    return (
                      <div key={activity.id} className="relative pl-10">
                      {index < group.items.length - 1 ? (
                          <span className={`absolute left-[15px] top-8 bottom-[-12px] w-px ${visual.lineClass}`} />
                      ) : null}
                        <span className={`absolute left-0 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border ${visual.dotClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                      </span>
                        <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-800">{getActivityLabel(activity.type)}</p>
                            <div className="mt-1.5">{renderActivityContent(activity, actorNameMap)}</div>
                            <p className="mt-1.5 text-[11px] text-neutral-500">
                              Actor: {actorNameMap[activity.actorId] || "Utilizator necunoscut"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium tabular-nums text-neutral-600">{formatHour(activity.createdAt)}</p>
                            <p className="mt-1 text-[11px] leading-4 text-neutral-400">{formatDateTime(activity.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
