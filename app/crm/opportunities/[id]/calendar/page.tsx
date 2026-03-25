"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2, Maximize2, Minimize2, Plus } from "lucide-react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import listPlugin from "@fullcalendar/list"
import type { DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core"
import roLocale from "@fullcalendar/core/locales/ro"
import timeGridPlugin from "@fullcalendar/timegrid"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge, TaskPostponeMenu } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import { useToast } from "@/hooks/use-toast"
import { getDateValue } from "@/lib/crm/activity"
import { dispatchCrmCalendarFocusMode } from "@/lib/crm/ui-events"
import {
  completeCrmTask,
  createCrmCalendarEvent,
  deleteCrmCalendarEvent,
  deleteCrmTask,
  listCrmCalendarEvents,
  listCrmTasksForOpportunity,
  updateCrmCalendarEvent,
  updateCrmTask,
} from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import {
  CRM_TASK_STATUSES,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPES,
  CRM_TASK_TYPE_LABELS,
  CRM_VISIBILITIES,
  CRM_VISIBILITY_LABELS,
} from "@/lib/crm/constants"
import type { CrmCalendarEvent, CrmTask, CrmVisibility } from "@/lib/crm/types"

const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false })

type CalendarSheetMode = null | "create-event" | "edit-event" | "edit-task"
type CalendarEntrySource = "calendar_event" | "task"

type CalendarEntryProps = {
  sourceType: CalendarEntrySource
  calendarEventId?: string
  taskId?: string
}

type EventDraft = {
  eventId: string | null
  title: string
  startAt: string
  endAt: string
  location: string
  reminderAt: string
  visibility: CrmVisibility
  visibleToUserIds: string[]
}

type TaskDraft = {
  taskId: string
  title: string
  status: CrmTask["status"]
  taskType: (typeof CRM_TASK_TYPES)[number]
  assigneeId: string
  dueAt: string
}

type CalendarViewportMode = "desktop" | "compact" | "mobile"

function toDateTimeLocal(value: unknown) {
  const date = getDateValue(value)
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function roundUpToNextHalfHour(date: Date) {
  const next = new Date(date)
  next.setSeconds(0, 0)
  const minutes = next.getMinutes()
  if (minutes === 0 || minutes === 30) {
    return next
  }
  if (minutes < 30) {
    next.setMinutes(30)
    return next
  }
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
}

function createDefaultEventDraft(baseDate?: Date): EventDraft {
  const start = roundUpToNextHalfHour(baseDate || new Date())
  const end = new Date(start.getTime() + 60 * 60 * 1000)

  return {
    eventId: null,
    title: "",
    startAt: toDateTimeLocal(start),
    endAt: toDateTimeLocal(end),
    location: "",
    reminderAt: "",
    visibility: "PRIVATE",
    visibleToUserIds: [],
  }
}

function createEventDraftFromRow(event: CrmCalendarEvent): EventDraft {
  return {
    eventId: event.id,
    title: event.title,
    startAt: toDateTimeLocal(event.startAt),
    endAt: toDateTimeLocal(event.endAt),
    location: event.location || "",
    reminderAt: toDateTimeLocal(event.reminderAt),
    visibility: event.visibility,
    visibleToUserIds: event.visibleToUserIds,
  }
}

function createTaskDraftFromRow(task: CrmTask): TaskDraft {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    taskType: (task.taskType as (typeof CRM_TASK_TYPES)[number]) || "PROSPECTARE",
    assigneeId: task.assigneeId || "UNASSIGNED",
    dueAt: toDateTimeLocal(task.dueAt),
  }
}

function isOpenTask(task: CrmTask) {
  return task.status === "TODO" || task.status === "IN_PROGRESS"
}

export default function OpportunityCalendarPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [events, setEvents] = useState<CrmCalendarEvent[]>([])
  const [openTasks, setOpenTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [calendarWidth, setCalendarWidth] = useState(0)
  const [calendarAnchorDate, setCalendarAnchorDate] = useState<string | null>(null)
  const [isCalendarFocusMode, setIsCalendarFocusMode] = useState(false)

  const [sheetMode, setSheetMode] = useState<CalendarSheetMode>(null)
  const [eventDraft, setEventDraft] = useState<EventDraft>(() => createDefaultEventDraft())
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null)
  const [isSavingEvent, setIsSavingEvent] = useState(false)
  const [isDeletingEvent, setIsDeletingEvent] = useState(false)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [actingTaskId, setActingTaskId] = useState<string | null>(null)
  const calendarShellRef = useRef<HTMLDivElement | null>(null)

  const userOptions = useMemo(() => users.map((row) => ({ value: row.uid, label: row.displayName })), [users])

  const calendarTaskForPostpone = useMemo(() => {
    if (!taskDraft) return null
    return openTasks.find((t) => t.id === taskDraft.taskId) ?? null
  }, [openTasks, taskDraft])

  const load = async (): Promise<CrmTask[] | null> => {
    if (!opportunity || !user?.uid) return null

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
          assigneeOnlyUserId: userData?.role === "admin" ? undefined : user.uid,
        }),
        listCrmUsers(),
      ])

      setEvents(eventRows)
      setOpenTasks(taskRows.filter(isOpenTask))
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
      return taskRows
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid, userData?.role])

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const syncViewport = () => setIsMobile(mediaQuery.matches)

    syncViewport()
    mediaQuery.addEventListener("change", syncViewport)
    return () => mediaQuery.removeEventListener("change", syncViewport)
  }, [])

  useEffect(() => {
    if (!isMobile || !isCalendarFocusMode) return
    setIsCalendarFocusMode(false)
  }, [isCalendarFocusMode, isMobile])

  useEffect(() => {
    if (!opportunityId) return
    dispatchCrmCalendarFocusMode({ opportunityId, active: isCalendarFocusMode })
  }, [isCalendarFocusMode, opportunityId])

  useEffect(
    () => () => {
      if (!opportunityId) return
      dispatchCrmCalendarFocusMode({ opportunityId, active: false })
    },
    [opportunityId]
  )

  useEffect(() => {
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return

    const node = calendarShellRef.current
    if (!node) return

    let frameId: number | null = null
    let lastWidth = Math.round(node.getBoundingClientRect().width)
    let lastHeight = Math.round(node.getBoundingClientRect().height)
    setCalendarWidth(lastWidth)

    const syncCalendarSize = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"))
        frameId = null
      })
    }

    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width || 0)
      const height = Math.round(entries[0]?.contentRect.height || 0)
      if (!width || !height) return
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height
      setCalendarWidth(width)
      syncCalendarSize()
    })

    observer.observe(node)
    syncCalendarSize()

    return () => {
      observer.disconnect()
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [])

  const calendarEntries = useMemo<EventInput[]>(() => {
    const calendarEventItems: EventInput[] = events.flatMap((event) => {
      const startAt = getDateValue(event.startAt)
      const endAt = getDateValue(event.endAt)
      if (!startAt || !endAt) return []

      return [
        {
          id: `event:${event.id}`,
          title: event.title,
          start: startAt.toISOString(),
          end: endAt.toISOString(),
          classNames: ["crm-fullcalendar-event"],
          extendedProps: {
            sourceType: "calendar_event",
            calendarEventId: event.id,
          } satisfies CalendarEntryProps,
        },
      ]
    })

    const taskItems: EventInput[] = openTasks.flatMap((task) => {
      const dueAt = getDateValue(task.dueAt)
      if (!dueAt) return []

      const endAt = new Date(dueAt.getTime() + 30 * 60 * 1000)
      return [
        {
          id: `task:${task.id}`,
          title: task.title,
          start: dueAt.toISOString(),
          end: endAt.toISOString(),
          classNames: ["crm-fullcalendar-task"],
          extendedProps: {
            sourceType: "task",
            taskId: task.id,
          } satisfies CalendarEntryProps,
        },
      ]
    })

    return [...calendarEventItems, ...taskItems]
  }, [events, openTasks])

  const calendarViewportMode = useMemo<CalendarViewportMode>(() => {
    if (isMobile) return "mobile"
    if (calendarWidth > 0 && calendarWidth < 980) return "compact"
    return "desktop"
  }, [calendarWidth, isMobile])

  const calendarInitialView = useMemo(() => {
    if (calendarViewportMode === "mobile") return "listWeek"
    if (calendarViewportMode === "compact") return "dayGridMonth"
    return "timeGridWeek"
  }, [calendarViewportMode])

  const calendarToolbar = useMemo(
    () =>
      calendarViewportMode === "mobile"
        ? {
            left: "prev,next today",
            center: "title",
            right: "listWeek,dayGridMonth",
          }
        : calendarViewportMode === "compact"
          ? {
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,listWeek",
            }
        : {
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,dayGridMonth,listWeek",
          },
    [calendarViewportMode]
  )

  const handleDatesSet = (info: DatesSetArg) => {
    const nextAnchorDate = info.view.currentStart.toISOString()
    setCalendarAnchorDate((current) => (current === nextAnchorDate ? current : nextAnchorDate))
  }

  const closeSheet = () => {
    setSheetMode(null)
    setTaskDraft(null)
    setEventDraft(createDefaultEventDraft())
  }

  const openCreateEventSheet = () => {
    setEventDraft(createDefaultEventDraft())
    setTaskDraft(null)
    setSheetMode("create-event")
  }

  const toggleCalendarFocusMode = () => {
    setIsCalendarFocusMode((current) => !current)
  }

  const handleCalendarEntryClick = (clickInfo: EventClickArg) => {
    const props = clickInfo.event.extendedProps as CalendarEntryProps

    if (props.sourceType === "calendar_event" && props.calendarEventId) {
      const event = events.find((row) => row.id === props.calendarEventId)
      if (!event) return
      setEventDraft(createEventDraftFromRow(event))
      setTaskDraft(null)
      setSheetMode("edit-event")
      return
    }

    if (props.sourceType === "task" && props.taskId) {
      const task = openTasks.find((row) => row.id === props.taskId)
      if (!task) return
      setTaskDraft(createTaskDraftFromRow(task))
      setSheetMode("edit-task")
    }
  }

  const handleEventSave = async () => {
    if (!user?.uid || isSavingEvent) return
    if (!eventDraft.title.trim() || !eventDraft.startAt || !eventDraft.endAt) return

    const startAt = new Date(eventDraft.startAt)
    const endAt = new Date(eventDraft.endAt)
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      toast({
        title: "Interval invalid",
        description: "Verifică data de început și sfârșit a evenimentului.",
        variant: "destructive",
      })
      return
    }

    setIsSavingEvent(true)
    try {
      if (sheetMode === "edit-event" && eventDraft.eventId) {
        await updateCrmCalendarEvent({
          eventId: eventDraft.eventId,
          actorId: user.uid,
          title: eventDraft.title,
          startAt,
          endAt,
          location: eventDraft.location,
          reminderAt: eventDraft.reminderAt ? new Date(eventDraft.reminderAt) : undefined,
          visibility: eventDraft.visibility,
          visibleToUserIds: eventDraft.visibleToUserIds,
        })
      } else {
        await createCrmCalendarEvent({
          opportunityId,
          title: eventDraft.title,
          startAt,
          endAt,
          location: eventDraft.location,
          reminderAt: eventDraft.reminderAt ? new Date(eventDraft.reminderAt) : undefined,
          createdById: user.uid,
          visibility: eventDraft.visibility,
          visibleToUserIds: eventDraft.visibleToUserIds,
        })
      }

      closeSheet()
      await load()
    } catch (error) {
      toast({
        title: "Eroare la salvare",
        description: error instanceof Error ? error.message : "Nu am putut salva evenimentul.",
        variant: "destructive",
      })
    } finally {
      setIsSavingEvent(false)
    }
  }

  const handleEventDelete = async () => {
    if (!user?.uid || !eventDraft.eventId || isDeletingEvent) return

    setIsDeletingEvent(true)
    try {
      await deleteCrmCalendarEvent(eventDraft.eventId, user.uid)
      closeSheet()
      await load()
    } catch (error) {
      toast({
        title: "Eroare la ștergere",
        description: error instanceof Error ? error.message : "Nu am putut șterge evenimentul.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingEvent(false)
    }
  }

  const handleTaskSave = async () => {
    if (!user?.uid || !taskDraft || isSavingTask) return

    setIsSavingTask(true)
    try {
      await updateCrmTask({
        taskId: taskDraft.taskId,
        actorId: user.uid,
        status: taskDraft.status,
        taskType: taskDraft.taskType,
        assigneeId: taskDraft.assigneeId === "UNASSIGNED" ? "" : taskDraft.assigneeId,
        dueAt: taskDraft.dueAt ? new Date(taskDraft.dueAt) : null,
      })
      closeSheet()
      await load()
    } catch (error) {
      toast({
        title: "Eroare la salvare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza sarcina.",
        variant: "destructive",
      })
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleTaskAction = async (action: "success" | "failed" | "delete") => {
    if (!user?.uid || !taskDraft || actingTaskId === taskDraft.taskId) return

    setActingTaskId(taskDraft.taskId)
    try {
      if (action === "success") {
        await completeCrmTask(taskDraft.taskId, user.uid)
      } else if (action === "failed") {
        await updateCrmTask({
          taskId: taskDraft.taskId,
          actorId: user.uid,
          status: "FARA_SUCCES",
        })
      } else {
        await deleteCrmTask(taskDraft.taskId, user.uid)
      }

      closeSheet()
      await load()
    } catch (error) {
      toast({
        title: "Eroare la actualizare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza sarcina.",
        variant: "destructive",
      })
    } finally {
      setActingTaskId(null)
    }
  }

  if (!opportunity) {
    return (
      <Panel
        title="Calendar"
        size="comfortable"
        className="[&>header]:hidden xl:[&>header]:block"
      >
        <p className="text-sm text-neutral-500">Fără acces la oportunitate.</p>
      </Panel>
    )
  }

  const eventSheetReadOnly = sheetMode === "edit-event" && isTechnician
  const sheetTitle =
    sheetMode === "create-event"
      ? "Eveniment nou"
      : sheetMode === "edit-task"
        ? "Editează sarcina"
        : eventSheetReadOnly
          ? "Detalii eveniment"
          : "Editează evenimentul"

  const sheetDescription =
    sheetMode === "create-event"
      ? "Programează un eveniment în calendarul oportunității."
      : sheetMode === "edit-task"
        ? "Actualizează statusul, responsabilul și termenul sarcinii."
        : eventSheetReadOnly
          ? "Vizualizează detaliile evenimentului din calendar."
          : "Actualizează intervalul, locația și vizibilitatea evenimentului."

  return (
    <Panel
      title={isCalendarFocusMode ? undefined : "Calendar"}
      subtitle=""
      headerAction={
        !isCalendarFocusMode ? (
          <div className="hidden items-center gap-2 xl:flex">
            <Button
              size="sm"
              variant="outline"
              className="h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm"
              onClick={toggleCalendarFocusMode}
              aria-label="Activează focus pe calendar"
            >
              <Maximize2 className="h-4 w-4" />
              <span>Focus</span>
            </Button>
            {!isTechnician ? (
              <Button
                size="sm"
                className="h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm"
                onClick={openCreateEventSheet}
                aria-label="Adaugă eveniment"
              >
                <Plus className="h-4 w-4" />
                <span>Adaugă eveniment</span>
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:hidden xl:[&>header]:block"
      contentClassName={`flex min-h-0 flex-1 flex-col ${isCalendarFocusMode ? "!p-0" : ""}`}
    >
      {!isTechnician && !isCalendarFocusMode ? (
        <div className="mb-4 shrink-0 flex justify-end xl:hidden">
          <Button
            size="sm"
            className="h-8 w-8 p-0 text-sm sm:h-9 sm:w-auto sm:px-3"
            onClick={openCreateEventSheet}
            aria-label="Adaugă eveniment"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Adaugă eveniment</span>
          </Button>
        </div>
      ) : null}

      <Sheet
        open={sheetMode !== null}
        onOpenChange={(open) => {
          if (!open) closeSheet()
        }}
      >
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>{sheetTitle}</SheetTitle>
              <SheetDescription>{sheetDescription}</SheetDescription>
            </SheetHeader>

            {sheetMode === "edit-task" && taskDraft ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <SubtleBadge tone="warning">[SARCINA]</SubtleBadge>
                    <p className="min-w-0 truncate text-sm font-medium text-neutral-900" title={taskDraft.title}>
                      {taskDraft.title}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={taskDraft.status} onValueChange={(status) => setTaskDraft((prev) => (prev ? { ...prev, status: status as CrmTask["status"] } : prev))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Stare" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRM_TASK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {CRM_TASK_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={taskDraft.taskType} onValueChange={(value) => setTaskDraft((prev) => (prev ? { ...prev, taskType: value as (typeof CRM_TASK_TYPES)[number] } : prev))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Tip sarcină" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRM_TASK_TYPES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {CRM_TASK_TYPE_LABELS[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={taskDraft.assigneeId} onValueChange={(value) => setTaskDraft((prev) => (prev ? { ...prev, assigneeId: value } : prev))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Responsabil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNASSIGNED">Neasignat</SelectItem>
                        {users.map((item) => (
                          <SelectItem key={item.uid} value={item.uid}>
                            {item.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="space-y-1.5">
                      <Label className="text-sm text-neutral-700">Termen</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="datetime-local"
                          value={taskDraft.dueAt}
                          onChange={(event) => setTaskDraft((prev) => (prev ? { ...prev, dueAt: event.target.value } : prev))}
                          className="h-9 min-w-[200px] flex-1 text-sm"
                        />
                        {user?.uid && calendarTaskForPostpone ? (
                          <TaskPostponeMenu
                            task={calendarTaskForPostpone}
                            actorId={user.uid}
                            disabled={isSavingTask || Boolean(actingTaskId)}
                            onSuccess={async () => {
                              const taskId = taskDraft?.taskId
                              const rows = await load()
                              if (!taskId) return
                              const refreshed = rows?.find((r) => r.id === taskId)
                              if (refreshed) setTaskDraft(createTaskDraftFromRow(refreshed))
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-sm text-rose-600 hover:text-rose-700"
                      disabled={actingTaskId === taskDraft.taskId}
                      onClick={async () => {
                        await handleTaskAction("delete")
                      }}
                    >
                      {actingTaskId === taskDraft.taskId ? "Se șterge..." : "Șterge"}
                    </Button>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-sm"
                        disabled={actingTaskId === taskDraft.taskId}
                        onClick={async () => {
                          await handleTaskAction("success")
                        }}
                      >
                        {actingTaskId === taskDraft.taskId ? "Se salvează..." : "Închide cu succes"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-sm"
                        disabled={actingTaskId === taskDraft.taskId}
                        onClick={async () => {
                          await handleTaskAction("failed")
                        }}
                      >
                        {actingTaskId === taskDraft.taskId ? "Se salvează..." : "Închide fără succes"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-sm"
                        disabled={isSavingTask}
                        onClick={closeSheet}
                      >
                        Anulează
                      </Button>
                      <Button
                        size="sm"
                        className="h-9 text-sm"
                        disabled={isSavingTask || actingTaskId === taskDraft.taskId}
                        onClick={handleTaskSave}
                      >
                        {isSavingTask ? "Se salvează..." : "Salvează"}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm text-neutral-700">Titlu eveniment</Label>
                      <Input
                        value={eventDraft.title}
                        onChange={(event) => setEventDraft((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Titlu eveniment"
                        className="h-9 text-sm"
                        disabled={eventSheetReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-neutral-700">Locație</Label>
                      <Input
                        value={eventDraft.location}
                        onChange={(event) => setEventDraft((prev) => ({ ...prev, location: event.target.value }))}
                        placeholder="Locație"
                        className="h-9 text-sm"
                        disabled={eventSheetReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-neutral-700">Început eveniment</Label>
                      <Input
                        type="datetime-local"
                        value={eventDraft.startAt}
                        onChange={(event) => setEventDraft((prev) => ({ ...prev, startAt: event.target.value }))}
                        className="h-9 text-sm"
                        disabled={eventSheetReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-neutral-700">Sfârșit eveniment</Label>
                      <Input
                        type="datetime-local"
                        value={eventDraft.endAt}
                        onChange={(event) => setEventDraft((prev) => ({ ...prev, endAt: event.target.value }))}
                        className="h-9 text-sm"
                        disabled={eventSheetReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-neutral-700">Reminder opțional</Label>
                      <Input
                        type="datetime-local"
                        value={eventDraft.reminderAt}
                        onChange={(event) => setEventDraft((prev) => ({ ...prev, reminderAt: event.target.value }))}
                        className="h-9 text-sm"
                        disabled={eventSheetReadOnly}
                      />
                      <p className="text-xs text-neutral-500">Lasă gol dacă nu vrei reminder.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-neutral-700">Vizibilitate</Label>
                      <Select
                        value={eventDraft.visibility}
                        onValueChange={(value) => setEventDraft((prev) => ({ ...prev, visibility: value as CrmVisibility }))}
                        disabled={eventSheetReadOnly}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Vizibilitate" />
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
                  </div>

                  {eventDraft.visibility === "CUSTOM" ? (
                    <div className="mt-2">
                      <Label className="mb-2 block text-sm text-neutral-600">Vizibil pentru</Label>
                      <MultiSelect
                        options={userOptions}
                        selected={eventDraft.visibleToUserIds}
                        onChange={(selected) => setEventDraft((prev) => ({ ...prev, visibleToUserIds: selected }))}
                        placeholder="Alege useri"
                        disabled={eventSheetReadOnly}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="border-t px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {sheetMode === "edit-event" && !eventSheetReadOnly ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 text-sm text-rose-600 hover:text-rose-700"
                        disabled={isDeletingEvent || isSavingEvent}
                        onClick={handleEventDelete}
                      >
                        {isDeletingEvent ? "Se șterge..." : "Șterge"}
                      </Button>
                    ) : (
                      <div />
                    )}

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-sm"
                        disabled={isSavingEvent || isDeletingEvent}
                        onClick={closeSheet}
                      >
                        {eventSheetReadOnly ? "Închide" : "Anulează"}
                      </Button>
                      {!eventSheetReadOnly ? (
                        <Button
                          size="sm"
                          className="h-9 text-sm"
                          disabled={isSavingEvent || isDeletingEvent}
                          onClick={handleEventSave}
                        >
                          {isSavingEvent ? "Se salvează..." : "Salvează"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${isCalendarFocusMode ? "mb-0 max-h-0 -translate-y-2 opacity-0 pointer-events-none" : "mb-3 max-h-24 translate-y-0 opacity-100"}`}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              eveniment
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              sarcină
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            {loading ? "Se încarcă programările..." : `${events.length} evenimente, ${openTasks.length} sarcini deschise`}
          </p>
        </div>
      </div>

      <div
        ref={calendarShellRef}
        className={`crm-fullcalendar relative min-h-[680px] flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-white p-3 ${isCalendarFocusMode ? "crm-fullcalendar--focus h-full rounded-none border-0" : ""}`}
      >
        {isCalendarFocusMode ? (
          <div className="absolute right-3 top-3 z-30 hidden items-center gap-2 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-lg backdrop-blur xl:flex">
            {!isTechnician ? (
              <Button
                type="button"
                size="sm"
                className="h-9 w-9 p-0 shadow-none"
                onClick={openCreateEventSheet}
                aria-label="Adaugă eveniment"
                title="Adaugă eveniment"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 border-neutral-200 bg-white shadow-none"
              onClick={toggleCalendarFocusMode}
              aria-label="Ieșire focus calendar"
              title="Ieșire focus"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Se încarcă programările...
          </div>
        ) : (
          <FullCalendar
            key={calendarViewportMode}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            locale={roLocale}
            initialView={calendarInitialView}
            initialDate={calendarAnchorDate || undefined}
            headerToolbar={calendarToolbar}
            nowIndicator
            firstDay={1}
            weekends
            allDaySlot={false}
            height={isMobile ? "auto" : "100%"}
            stickyHeaderDates={!isMobile}
            dayMaxEventRows={3}
            slotDuration="00:30:00"
            scrollTime="08:00:00"
            events={calendarEntries}
            eventClick={handleCalendarEntryClick}
            datesSet={handleDatesSet}
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }}
            slotLabelFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }}
            buttonText={{
              today: "Azi",
            }}
            views={{
              timeGridWeek: {
                buttonText: "Săptămână",
              },
              dayGridMonth: {
                buttonText: "Lună",
              },
              listWeek: {
                buttonText: "Listă",
              },
            }}
          />
        )}
      </div>

      <style jsx global>{`
        .crm-fullcalendar .fc {
          height: 100%;
          font-size: 0.875rem;
          color: #111827;
        }

        .crm-fullcalendar .fc-toolbar.fc-header-toolbar {
          margin-bottom: 1rem;
          gap: 0.75rem;
        }

        @media (min-width: 1280px) {
          .crm-fullcalendar--focus .fc-toolbar.fc-header-toolbar {
            padding-right: 6.5rem;
          }
        }

        .crm-fullcalendar .fc-toolbar-title {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }

        .crm-fullcalendar .fc-button {
          height: 2.25rem;
          border-radius: 0.625rem;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          color: #374151;
          box-shadow: none;
          padding: 0 0.75rem;
          font-size: 0.875rem;
          text-transform: none;
        }

        .crm-fullcalendar .fc-button:hover {
          border-color: #d1d5db;
          background: #f8fafc;
          color: #111827;
        }

        .crm-fullcalendar .fc-button-primary:not(:disabled).fc-button-active,
        .crm-fullcalendar .fc-button-primary:not(:disabled):active {
          border-color: #111827;
          background: #111827;
          color: #ffffff;
        }

        .crm-fullcalendar .fc-button:focus {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
        }

        .crm-fullcalendar .fc-theme-standard td,
        .crm-fullcalendar .fc-theme-standard th,
        .crm-fullcalendar .fc-scrollgrid {
          border-color: #e5e7eb;
        }

        .crm-fullcalendar .fc-col-header-cell-cushion,
        .crm-fullcalendar .fc-daygrid-day-number,
        .crm-fullcalendar .fc-timegrid-axis-cushion,
        .crm-fullcalendar .fc-timegrid-slot-label-cushion,
        .crm-fullcalendar .fc-list-day-text,
        .crm-fullcalendar .fc-list-day-side-text {
          color: #374151;
        }

        .crm-fullcalendar .fc-day-today {
          background: #fafafa !important;
        }

        .crm-fullcalendar .fc-event {
          border-width: 1px;
          border-radius: 0.625rem;
          box-shadow: none;
        }

        .crm-fullcalendar .crm-fullcalendar-event {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .crm-fullcalendar .crm-fullcalendar-task {
          border-color: #fdba74;
          background: #fff7ed;
          color: #c2410c;
        }

        .crm-fullcalendar .fc-timegrid-event .fc-event-main,
        .crm-fullcalendar .fc-daygrid-event .fc-event-main,
        .crm-fullcalendar .fc-list-event-title,
        .crm-fullcalendar .fc-list-event-time {
          color: inherit;
        }

        .crm-fullcalendar .fc-list-event:hover td {
          background: #f8fafc;
        }

        .crm-fullcalendar .fc-timegrid-now-indicator-line {
          border-color: #ef4444;
        }

        .crm-fullcalendar .fc-timegrid-now-indicator-arrow {
          border-color: #ef4444;
        }

        .crm-fullcalendar .fc-list-empty {
          background: transparent;
        }

        @media (max-width: 767px) {
          .crm-fullcalendar .fc-toolbar.fc-header-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .crm-fullcalendar .fc-toolbar-chunk {
            display: flex;
            justify-content: center;
          }

          .crm-fullcalendar .fc-toolbar-title {
            text-align: center;
          }

          .crm-fullcalendar .fc-button-group,
          .crm-fullcalendar .fc-toolbar-chunk:last-child {
            flex-wrap: wrap;
            gap: 0.5rem;
          }
        }
      `}</style>
    </Panel>
  )
}
