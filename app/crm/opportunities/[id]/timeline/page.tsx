"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import {
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
import { Panel } from "@/components/crm"
import { getDateValue, listCrmActivity } from "@/lib/crm/activity"
import { listCrmClientContacts, listCrmUsers } from "@/lib/crm/opportunities"
import { getCrmFileOpenUrl } from "@/lib/crm/file-preview"
import { formatDateTime } from "@/lib/crm/presenters"
import { CRM_PIPELINE_STAGE_LABELS, CRM_PRIORITY_LABELS, CRM_WORK_STATUS_LABELS } from "@/lib/crm/constants"
import type { CrmActivityLog } from "@/lib/crm/types"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"

const CRM_ACTIVITY_REFRESH_EVENT = "crm:activity-refresh"

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

function getActivityLabel(activityType: string) {
  const labelMap: Record<string, string> = {
    CREATED: "Oportunitate creată",
    UPDATED: "Date oportunitate modificate",
    STAGE_CHANGED: "Schimbare status",
    TASK_CREATED: "Sarcină creată",
    TASK_UPDATED: "Sarcină modificată",
    TASK_COMPLETED: "Sarcină completată",
    TASK_DELETED: "Sarcină ștearsă",
    NOTE_CREATED: "Notă adăugată",
    NOTE_UPDATED: "Notă actualizată",
    NOTE_VISIBILITY_UPDATED: "Vizibilitate notă actualizată",
    NOTE_DELETED: "Notă ștearsă",
    FILE_UPLOADED: "Fișier adăugat",
    FILE_DELETED: "Fișier șters",
    EMAIL_LOGGED: "Email logat",
    OFFER_SENT: "Ofertă emisă",
    OFFER_ACCEPTED: "Ofertă acceptată",
    OFFER_REJECTED: "Ofertă refuzată",
    CALENDAR_EVENT_CREATED: "Eveniment calendar creat",
    CALENDAR_EVENT_DELETED: "Eveniment calendar șters",
    INTERNAL_NOTE_CREATED: "Notă internă",
    INTERNAL_NOTE_CONFIRMED: "Confirmare notă internă",
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
    TASK_CREATED: { icon: ClipboardList, dotClass: "border-blue-200 bg-blue-50 text-blue-700", lineClass: "bg-blue-200" },
    TASK_UPDATED: { icon: PencilLine, dotClass: "border-blue-200 bg-blue-50 text-blue-700", lineClass: "bg-blue-200" },
    TASK_COMPLETED: { icon: CheckCheck, dotClass: "border-lime-200 bg-lime-50 text-lime-700", lineClass: "bg-lime-200" },
    TASK_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    NOTE_CREATED: { icon: MessageSquare, dotClass: "border-cyan-200 bg-cyan-50 text-cyan-700", lineClass: "bg-cyan-200" },
    NOTE_UPDATED: { icon: PencilLine, dotClass: "border-cyan-200 bg-cyan-50 text-cyan-700", lineClass: "bg-cyan-200" },
    NOTE_VISIBILITY_UPDATED: { icon: PencilLine, dotClass: "border-cyan-200 bg-cyan-50 text-cyan-700", lineClass: "bg-cyan-200" },
    NOTE_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    INTERNAL_NOTE_CREATED: { icon: MessageSquare, dotClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700", lineClass: "bg-fuchsia-200" },
    INTERNAL_NOTE_CONFIRMED: { icon: CheckCheck, dotClass: "border-emerald-200 bg-emerald-50 text-emerald-700", lineClass: "bg-emerald-200" },
    FILE_UPLOADED: { icon: FileText, dotClass: "border-indigo-200 bg-indigo-50 text-indigo-700", lineClass: "bg-indigo-200" },
    FILE_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    EMAIL_LOGGED: { icon: Mail, dotClass: "border-amber-200 bg-amber-50 text-amber-700", lineClass: "bg-amber-200" },
    OFFER_SENT: { icon: FileText, dotClass: "border-blue-200 bg-blue-50 text-blue-700", lineClass: "bg-blue-200" },
    OFFER_ACCEPTED: { icon: CheckCheck, dotClass: "border-emerald-200 bg-emerald-50 text-emerald-700", lineClass: "bg-emerald-200" },
    OFFER_REJECTED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    CALENDAR_EVENT_CREATED: { icon: ClipboardList, dotClass: "border-teal-200 bg-teal-50 text-teal-700", lineClass: "bg-teal-200" },
    CALENDAR_EVENT_DELETED: { icon: Trash2, dotClass: "border-rose-200 bg-rose-50 text-rose-700", lineClass: "bg-rose-200" },
    INTERNAL_HANDOFF_CREATED: { icon: Handshake, dotClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700", lineClass: "bg-fuchsia-200" },
    INTERNAL_HANDOFF_CONFIRMED: { icon: CheckCheck, dotClass: "border-emerald-200 bg-emerald-50 text-emerald-700", lineClass: "bg-emerald-200" },
  }
  return styles[activityType] || { icon: ClipboardList, dotClass: "border-neutral-200 bg-neutral-50 text-neutral-700", lineClass: "bg-neutral-200" }
}

function renderKeyValueRow(label: string, value: ReactNode) {
  return (
    <p className="text-sm text-neutral-700">
      <span className="font-medium text-neutral-800">{label}:</span> {value}
    </p>
  )
}

function renderActivityContent(
  activity: CrmActivityLog,
  userNameMap: Record<string, string>,
  contactNameMap: Record<string, string>
) {
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
        {renderKeyValueRow("Proprietar", mapUser(String(opportunity.ownerId || "")))}
      </div>
    )
  }

  if (activity.type === "UPDATED") {
    const changes = (payload.changes || {}) as Record<string, unknown>
    const fieldLabels: Record<string, string> = {
      title: "Titlu",
      displayTitle: "Titlu afișat",
      clientId: "Client",
      ownerId: "Proprietar",
      primaryContactId: "Contact principal",
      readUserIds: "Utilizatori cu acces",
      editUserIds: "Utilizatori cu editare",
      priority: "Prioritate",
      workStatus: "Status lucru",
      pipelineStage: "Status oportunitate",
      opportunityType: "Modul",
      amount: "Valoare",
      closeDate: "Data închiderii",
    }
    const nonEmpty = Object.entries(changes).filter(([, value]) => value !== undefined && value !== null)
    const mapValue = (key: string, value: unknown) => {
      if (key === "priority" && typeof value === "string") {
        return CRM_PRIORITY_LABELS[value as keyof typeof CRM_PRIORITY_LABELS] || value
      }
      if (key === "workStatus" && typeof value === "string") {
        return CRM_WORK_STATUS_LABELS[value as keyof typeof CRM_WORK_STATUS_LABELS] || value
      }
      if (key === "pipelineStage" && typeof value === "string") {
        return CRM_PIPELINE_STAGE_LABELS[value] || value
      }
      if ((key === "readUserIds" || key === "editUserIds") && Array.isArray(value)) {
        return value.length > 0 ? value.map((userId) => mapUser(String(userId))).join(", ") : "-"
      }
      if (key === "ownerId" && typeof value === "string") {
        return mapUser(value)
      }
      if (key === "primaryContactId") {
        if (!value) return "-"
        const contactId = String(value)
        return contactNameMap[contactId] || contactId
      }
      if (key === "closeDate" && typeof value === "string") {
        return formatDateTime(value)
      }
      return String(value)
    }

    if (nonEmpty.length === 0) return <p className="text-sm text-neutral-500">Fără detalii suplimentare.</p>
    return (
      <div className="space-y-1.5">
        {nonEmpty.map(([key, value]) => renderKeyValueRow(fieldLabels[key] || key, mapValue(key, value)))}
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
    return <p className="whitespace-pre-wrap text-sm text-neutral-700">{fullContent || "Notă fără conținut."}</p>
  }

  if (activity.type === "NOTE_UPDATED") {
    const before = (payload.before || {}) as Record<string, unknown>
    const after = (payload.after || {}) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Înainte", String(before.content || "-"))}
        {renderKeyValueRow("După", String(after.content || "-"))}
      </div>
    )
  }

  if (activity.type === "NOTE_VISIBILITY_UPDATED") {
    const before = (payload.before || {}) as Record<string, unknown>
    const after = (payload.after || {}) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Din", String(before.visibility || "-"))}
        {renderKeyValueRow("În", String(after.visibility || "-"))}
      </div>
    )
  }

  if (activity.type === "TASK_CREATED" || activity.type === "TASK_UPDATED" || activity.type === "TASK_COMPLETED" || activity.type === "TASK_DELETED") {
    const task = (payload.task || payload.before || {}) as Record<string, unknown>
    const changes = (payload.changes || {}) as Record<string, unknown>
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("Titlu", String(task.title || changes.title || "-"))}
        {renderKeyValueRow("Status", String(changes.status || task.status || "-"))}
        {renderKeyValueRow("Responsabil", mapUser(String(changes.assigneeId || task.assigneeId || "")))}
        {(changes.dueAt || task.dueAt) ? renderKeyValueRow("Termen", formatDateTime(changes.dueAt || task.dueAt)) : null}
      </div>
    )
  }

  if (activity.type === "FILE_UPLOADED" || activity.type === "FILE_DELETED") {
    const filesRaw = Array.isArray(payload.files) ? payload.files : []
    const fallbackFile = payload.file
      ? [payload.file]
      : payload.filename
        ? [{ internalCode: payload.internalCode, filename: payload.filename, size: payload.size, mime: payload.mime, url: payload.url }]
        : []
    const files = (filesRaw.length > 0 ? filesRaw : fallbackFile) as Array<Record<string, unknown>>
    if (files.length === 0) return <p className="text-sm text-neutral-500">Fără detalii fișier.</p>
    return (
      <div className="space-y-2">
        {files.map((file, idx) => (
          <div key={`${String(file.filename || "file")}-${idx}`} className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2">
            {renderKeyValueRow("Cod intern", String(file.internalCode || "-"))}
            {renderKeyValueRow("Nume", String(file.filename || "-"))}
            {renderKeyValueRow("Tip", String(file.mime || "-"))}
            {renderKeyValueRow("Dimensiune", file.size ? `${Number(file.size).toLocaleString("ro-RO")} B` : "-")}
            {file.url ? (
              <p className="text-sm text-blue-700">
                <a
                  href={getCrmFileOpenUrl({
                    url: String(file.url),
                    mime: String(file.mime || ""),
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  Deschide fișier
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
        {renderKeyValueRow("CC", Array.isArray(payload.cc) && payload.cc.length ? (payload.cc as string[]).join(", ") : "-")}
        {renderKeyValueRow("BCC", Array.isArray(payload.bcc) && payload.bcc.length ? (payload.bcc as string[]).join(", ") : "-")}
        <p className="whitespace-pre-wrap text-sm text-neutral-700">{String(payload.bodySnippet || "") || "-"}</p>
      </div>
    )
  }

  if (activity.type === "OFFER_SENT" || activity.type === "OFFER_ACCEPTED" || activity.type === "OFFER_REJECTED") {
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("ID ofertă", String(payload.offerId || "-"))}
        {renderKeyValueRow("Versiune", String(payload.version || "-"))}
        {payload.recipientEmail ? renderKeyValueRow("Destinatar", String(payload.recipientEmail)) : null}
        {payload.subject ? renderKeyValueRow("Subiect", String(payload.subject)) : null}
        {payload.total !== undefined ? renderKeyValueRow("Total", `${Number(payload.total || 0).toFixed(2)} lei`) : null}
        {payload.reason ? renderKeyValueRow("Motiv refuz", String(payload.reason)) : null}
        {payload.pdfUrl ? (
          <p className="text-sm text-blue-700">
            <a href={String(payload.pdfUrl)} target="_blank" rel="noreferrer" className="hover:underline">
              Deschide PDF ofertă
            </a>
          </p>
        ) : null}
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

  if (activity.type === "INTERNAL_NOTE_CREATED" || activity.type === "INTERNAL_NOTE_CONFIRMED") {
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("De la", mapUser(String(payload.fromUserId || "")))}
        {renderKeyValueRow("Către", mapUser(String(payload.toUserId || "")))}
        {payload.message ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{String(payload.message)}</p> : null}
        {payload.confirmationMessage ? (
          <p className="whitespace-pre-wrap text-sm text-neutral-700">
            Confirmare: {String(payload.confirmationMessage)}
          </p>
        ) : null}
      </div>
    )
  }

  if (activity.type === "INTERNAL_HANDOFF_CREATED" || activity.type === "INTERNAL_HANDOFF_CONFIRMED") {
    return (
      <div className="space-y-1.5">
        {renderKeyValueRow("De la", mapUser(String(payload.fromUserId || "")))}
        {renderKeyValueRow("Către", mapUser(String(payload.toUserId || "")))}
        {renderKeyValueRow("Sumă", `${String(payload.amount || 0)} ${String(payload.currency || "RON")}`)}
        {payload.note ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{String(payload.note)}</p> : null}
      </div>
    )
  }

  return (
    <pre className="overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
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
  const [actorNameMap, setActorNameMap] = useState<Record<string, string>>({})
  const [contactNameMap, setContactNameMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const loadActivityData = useCallback(async () => {
    if (!opportunity || !user?.uid) return

    setLoading(true)
    try {
      const [activityRows, userRows, contactRows] = await Promise.all([
        listCrmActivity({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
        }),
        listCrmUsers(),
        listCrmClientContacts(opportunity.clientId),
      ])

      setActivities(activityRows.filter((row) => row.type !== "TASK_AUTO_CREATED"))
      setActorNameMap(
        userRows.reduce<Record<string, string>>((acc, crmUser) => {
          acc[crmUser.uid] = crmUser.displayName || crmUser.email || crmUser.uid
          return acc
        }, {})
      )
      setContactNameMap(
        contactRows.reduce<Record<string, string>>((acc, contact) => {
          if (contact.id) {
            acc[contact.id] = contact.name || contact.id
          }
          return acc
        }, {})
      )
    } finally {
      setLoading(false)
    }
  }, [opportunity, opportunityId, user?.uid])
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
    void loadActivityData()
  }, [loadActivityData])

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ opportunityId?: string }>
      const targetOpportunityId = customEvent.detail?.opportunityId
      if (targetOpportunityId && targetOpportunityId !== opportunityId) return
      void loadActivityData()
    }

    if (typeof window !== "undefined") {
      window.addEventListener(CRM_ACTIVITY_REFRESH_EVENT, handleRefresh as EventListener)
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(CRM_ACTIVITY_REFRESH_EVENT, handleRefresh as EventListener)
      }
    }
  }, [loadActivityData, opportunityId])

  if (opportunityLoading) {
    return (
      <Panel
        title="Istoric"
        size="comfortable"
        className="[&>header]:hidden xl:[&>header]:block"
      >
        <p className="text-sm text-neutral-500">Se încarcă...</p>
      </Panel>
    )
  }

  if (!opportunity) {
    return (
      <Panel
        title="Istoric"
        size="comfortable"
        className="[&>header]:hidden xl:[&>header]:block"
      >
        <p className="text-sm text-neutral-500">Fără acces la oportunitate.</p>
      </Panel>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 xl:gap-3">
      <Panel
        title="Istoric"
        subtitle=""
        size="comfortable"
        className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:hidden xl:[&>header]:block"
        contentClassName="flex-1 min-h-0 overflow-y-auto p-3 xl:p-5"
      >
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă activitatea...</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există activitate.</p>
        ) : (
          <div className="space-y-3 xl:space-y-4">
            {groupedActivities.map((group) => (
              <div key={group.key} className="space-y-1.5 xl:space-y-2">
                <p className="border-b border-neutral-200 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-700 xl:text-xs xl:tracking-[0.14em]">
                  {group.label}
                </p>
                <div className="space-y-2 xl:space-y-2.5">
                  {group.items.map((activity, index) => {
                    const visual = getActivityVisual(activity.type)
                    const Icon = visual.icon
                    return (
                      <div key={activity.id} className="relative pl-9 xl:pl-10">
                        {index < group.items.length - 1 ? (
                          <span className={`absolute left-3.5 top-8 bottom-[-10px] w-px xl:left-4 xl:top-9 xl:bottom-[-12px] ${visual.lineClass}`} />
                        ) : null}
                        <span className={`absolute left-0 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border xl:h-8 xl:w-8 ${visual.dotClass}`}>
                          <Icon className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
                        </span>
                        <div className="grid grid-cols-1 gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_96px] md:gap-3 md:px-4 md:py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-800 md:text-base">{getActivityLabel(activity.type)}</p>
                            <div className="mt-1">{renderActivityContent(activity, actorNameMap, contactNameMap)}</div>
                            <p className="mt-1 text-xs text-neutral-500 md:mt-1.5 md:text-sm">
                              Actor: {actorNameMap[activity.actorId] || "Utilizator necunoscut"}
                            </p>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="text-xs leading-4 text-neutral-400">{formatDateTime(activity.createdAt)}</p>
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
