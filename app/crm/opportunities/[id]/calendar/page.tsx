"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { OpportunityScheduleOverview, Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { createCrmCalendarEvent, deleteCrmCalendarEvent, listCrmCalendarEvents, listCrmTasksForOpportunity } from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import { CRM_VISIBILITIES, CRM_VISIBILITY_LABELS } from "@/lib/crm/constants"
import { formatDateTime } from "@/lib/crm/presenters"
import type { CrmCalendarEvent, CrmTask } from "@/lib/crm/types"

export default function OpportunityCalendarPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [events, setEvents] = useState<CrmCalendarEvent[]>([])
  const [openTasks, setOpenTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState("")
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [location, setLocation] = useState("")
  const [reminderAt, setReminderAt] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)

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

  if (!opportunity) {
    return <Panel title="Calendar" size="comfortable"><p className="text-sm text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Calendar"
      subtitle={isTechnician ? "Vizualizare read-only: evenimentele vizibile în oportunitate." : "MVP evenimente + upcoming (events + due sarcini)"}
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {!isTechnician ? (
        <div className="mb-4 shrink-0 flex justify-end">
          <Button size="sm" className="h-9 text-sm" onClick={() => setIsCreateOpen(true)}>
            Adaugă eveniment
          </Button>
        </div>
      ) : null}

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Eveniment nou</SheetTitle>
              <SheetDescription>Programează un eveniment în calendarul oportunității.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titlu eveniment" className="h-9 text-sm" />
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Locație" className="h-9 text-sm" />
            <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="h-9 text-sm" />
            <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="h-9 text-sm" />
            <Input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className="h-9 text-sm" />
            <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
              <SelectTrigger className="h-9 text-sm">
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
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-sm"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Anulează
                </Button>
            <Button
              size="sm"
              className="h-9 text-sm"
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
                    setVisibility("PRIVATE")
                setVisibleToUserIds([])
                    setIsCreateOpen(false)
                await load()
              }}
            >
                  Salvează
            </Button>
          </div>
        </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 pb-1">
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">Ce este în calendar</p>
            {loading ? (
              <p className="text-sm text-neutral-500">Se încarcă...</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-neutral-500">Nu există evenimente.</p>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold text-neutral-900">{event.title}</p>
                      <div className="flex items-center gap-1">
                        <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[event.visibility as keyof typeof CRM_VISIBILITY_LABELS]}</SubtleBadge>
                        {!isTechnician ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-sm text-rose-600"
                            onClick={async () => {
                              await deleteCrmCalendarEvent(event.id, user?.uid || "")
                              await load()
                            }}
                          >
                            Șterge
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">{formatDateTime(event.startAt)} → {formatDateTime(event.endAt)}</p>
                    <p className="mt-1 text-sm text-neutral-500">{event.location || "fără locație"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">Ce avem programat acum</p>
            <OpportunityScheduleOverview events={events} tasks={openTasks} loading={loading} />
          </div>
        </div>
      </div>
    </Panel>
  )
}
