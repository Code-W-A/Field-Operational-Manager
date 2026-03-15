"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Plus } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Panel, SubtleBadge } from "@/components/crm"
import { useCrmOpportunity } from "@/hooks/use-crm-opportunity"
import {
  createCrmTask,
  listCrmTasksForOpportunity,
  completeCrmTask,
  updateCrmTask,
  deleteCrmTask,
} from "@/lib/crm/tasks"
import { listCrmUsers } from "@/lib/crm/opportunities"
import {
  CRM_TASK_STATUSES,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPES,
  CRM_TASK_TYPE_LABELS,
  CRM_VISIBILITY_LABELS,
  CRM_VISIBILITIES,
} from "@/lib/crm/constants"
import { formatDateTime, taskStatusLabel } from "@/lib/crm/presenters"
import { getDateValue } from "@/lib/crm/activity"
import type { CrmTask } from "@/lib/crm/types"

function toDateTimeLocal(value: unknown) {
  const date = getDateValue(value)
  if (!date) return ""
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function defaultDueAtPlusTwoHours() {
  const date = new Date()
  date.setHours(date.getHours() + 2)
  return toDateTimeLocal(date)
}

export default function OpportunityTasksPage() {
  const params = useParams()
  const { user, userData } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)
  const isTechnician = userData?.role === "tehnician"

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState("")
  const [taskType, setTaskType] = useState<(typeof CRM_TASK_TYPES)[number]>("PROSPECTARE")
  const [taskTypeFilter, setTaskTypeFilter] = useState<"ALL" | (typeof CRM_TASK_TYPES)[number]>("ALL")
  const [assigneeId, setAssigneeId] = useState<string>("")
  const [dueAt, setDueAt] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSavingTaskEdit, setIsSavingTaskEdit] = useState(false)
  const [actingTaskId, setActingTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<CrmTask["status"]>("TODO")
  const [editTaskType, setEditTaskType] = useState<(typeof CRM_TASK_TYPES)[number]>("PROSPECTARE")
  const [editAssigneeId, setEditAssigneeId] = useState<string>("UNASSIGNED")
  const [editDueAt, setEditDueAt] = useState("")

  const userOptions = useMemo(() => users.map((row) => ({ value: row.uid, label: row.displayName })), [users])
  const userNameMap = useMemo(
    () =>
      users.reduce<Record<string, string>>((acc, row) => {
        acc[row.uid] = row.displayName
        return acc
      }, {}),
    [users]
  )

  const load = async () => {
    if (!opportunity || !user?.uid) return

    setLoading(true)
    try {
      const [taskRows, userRows] = await Promise.all([
        listCrmTasksForOpportunity({
          opportunityId,
          userId: user.uid,
          opportunityOwnerId: opportunity.ownerId,
          assigneeOnlyUserId: userData?.role === "admin" ? undefined : user.uid,
        }),
        listCrmUsers(),
      ])
      setTasks(taskRows)
      setUsers(userRows.map((row) => ({ uid: row.uid, displayName: row.displayName || row.email || row.uid })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, user?.uid])

  const filteredTasks = useMemo(
    () => (taskTypeFilter === "ALL" ? tasks : tasks.filter((task) => task.taskType === taskTypeFilter)),
    [taskTypeFilter, tasks]
  )

  if (!opportunity) {
    return (
      <Panel
        title="Sarcini"
        size="comfortable"
        className="[&>header]:hidden xl:[&>header]:block"
      >
        <p className="text-sm text-neutral-500">Fără acces la oportunitate.</p>
      </Panel>
    )
  }

  const resetCreateForm = () => {
    setTitle("")
    setTaskType("PROSPECTARE")
    setAssigneeId(opportunity.ownerId || "")
    setDueAt(defaultDueAtPlusTwoHours())
    setVisibility("PRIVATE")
    setVisibleToUserIds([])
  }

  return (
    <Panel
      title="Sarcini"
      subtitle=""
      headerAction={
        !isTechnician ? (
          <Button
            size="sm"
            className="hidden h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm xl:inline-flex"
            onClick={() => {
              resetCreateForm()
              setIsCreateOpen(true)
            }}
            aria-label="Adaugă sarcină"
          >
            <Plus className="h-4 w-4" />
            <span>Adaugă sarcină</span>
          </Button>
        ) : undefined
      }
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:hidden xl:[&>header]:block"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-[220px]">
          <Select value={taskTypeFilter} onValueChange={(value) => setTaskTypeFilter(value as "ALL" | (typeof CRM_TASK_TYPES)[number])}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Filtru tip sarcină" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toate tipurile</SelectItem>
              {CRM_TASK_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {CRM_TASK_TYPE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isTechnician ? (
          <Button
            size="sm"
            className="h-8 w-8 p-0 text-sm sm:h-9 sm:w-auto sm:px-3 xl:hidden"
            onClick={() => {
              resetCreateForm()
              setIsCreateOpen(true)
            }}
            aria-label="Adaugă sarcină"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Adaugă sarcină</span>
          </Button>
        ) : null}
      </div>

      <Sheet
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) resetCreateForm()
        }}
      >
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Sarcină nouă</SheetTitle>
              <SheetDescription>Completează detaliile și salvează sarcina.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-2">
                <Label>Titlu</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titlu sarcină" className="h-9 text-sm" />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Select value={taskType} onValueChange={(value) => setTaskType(value as (typeof CRM_TASK_TYPES)[number])}>
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
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Responsabil" />
            </SelectTrigger>
            <SelectContent>
              {users.map((item) => (
                <SelectItem key={item.uid} value={item.uid}>
                  {item.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
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
                <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-9 text-sm" />
              </div>
          {visibility === "CUSTOM" ? (
                <div className="mt-2">
            <MultiSelect options={userOptions} selected={visibleToUserIds} onChange={setVisibleToUserIds} placeholder="Visible pentru" />
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
            disabled={isCreatingTask}
            onClick={async () => {
              if (!title.trim() || !user?.uid || isCreatingTask) return
              setIsCreatingTask(true)
              try {
                await createCrmTask({
                  opportunityId,
                  title,
                  taskType,
                  createdById: user.uid,
                  assigneeId,
                  dueAt: dueAt ? new Date(dueAt) : new Date(Date.now() + 2 * 60 * 60 * 1000),
                  visibility,
                  visibleToUserIds,
                })
                resetCreateForm()
                setIsCreateOpen(false)
                await load()
              } finally {
                setIsCreatingTask(false)
              }
            }}
          >
                  {isCreatingTask ? "Se salvează..." : "Salvează"}
          </Button>
        </div>
      </div>
                  </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>Editează sarcina</SheetTitle>
              <SheetDescription>Actualizează statusul, responsabilul și datele.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={editStatus} onValueChange={(status) => setEditStatus(status as CrmTask["status"])}>
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

                    <Select value={editTaskType} onValueChange={(value) => setEditTaskType(value as (typeof CRM_TASK_TYPES)[number])}>
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

                    <Select value={editAssigneeId} onValueChange={setEditAssigneeId}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Reatribuire" />
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

                    <Input
                      type="datetime-local"
                      className="h-9 text-sm"
                      value={editDueAt}
                      onChange={(event) => setEditDueAt(event.target.value)}
                    />
                  </div>
                  </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                  className="h-9 text-sm"
                  disabled={isSavingTaskEdit}
                  onClick={() => {
                    setIsEditOpen(false)
                    setEditingTaskId(null)
                  }}
                >
                  Anulează
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-sm"
                  disabled={isSavingTaskEdit || !editingTaskId}
                          onClick={async () => {
                    if (!editingTaskId || isSavingTaskEdit) return
                            setIsSavingTaskEdit(true)
                            try {
                            await updateCrmTask({
                      taskId: editingTaskId,
                              actorId: user?.uid || "",
                              status: editStatus,
                              taskType: editTaskType,
                              assigneeId: editAssigneeId === "UNASSIGNED" ? "" : editAssigneeId,
                              dueAt: editDueAt ? new Date(editDueAt) : null,
                            })
                            setEditingTaskId(null)
                    setIsEditOpen(false)
                            await load()
                            } finally {
                              setIsSavingTaskEdit(false)
                            }
                          }}
                        >
                          {isSavingTaskEdit ? "Se salvează..." : "Salvează"}
                        </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă sarcinile...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există sarcini vizibile.</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există sarcini pentru tipul selectat.</p>
        ) : (
          <div className="space-y-2 pb-1">
            {filteredTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-neutral-900">{task.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-500">Creată la: {formatDateTime(task.createdAt)}</p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <SubtleBadge tone={task.status === "CU_SUCCES" ? "success" : task.status === "FARA_SUCCES" ? "danger" : "neutral"}>
                        {taskStatusLabel(task.status)}
                      </SubtleBadge>
                      <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[task.visibility]}</SubtleBadge>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-1 text-sm text-neutral-600 md:grid-cols-2">
                  <p>Status: {taskStatusLabel(task.status)}</p>
                  <p>Tip sarcină: {task.taskType ? CRM_TASK_TYPE_LABELS[task.taskType] || task.taskType : "-"}</p>
                  <p>Responsabil: {task.assigneeId ? userNameMap[task.assigneeId] || task.assigneeId : "Neasignat"}</p>
                  <p>Termen: {formatDateTime(task.dueAt)}</p>
                </div>

                <div className="mt-2 flex justify-end">
                  <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-sm"
                        disabled={actingTaskId === task.id}
                        onClick={() => {
                          setEditingTaskId(task.id)
                          setEditStatus(task.status)
                          setEditTaskType((task.taskType as (typeof CRM_TASK_TYPES)[number]) || "PROSPECTARE")
                          setEditAssigneeId(task.assigneeId || "UNASSIGNED")
                          setEditDueAt(toDateTimeLocal(task.dueAt))
                        setIsEditOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm"
                      onClick={async () => {
                        if (actingTaskId === task.id) return
                        setActingTaskId(task.id)
                        try {
                        await completeCrmTask(task.id, user?.uid || "")
                        setTasks((prev) =>
                          prev.map((row) => (row.id === task.id ? { ...row, status: "CU_SUCCES" } : row))
                        )
                        await load()
                        } finally {
                          setActingTaskId(null)
                        }
                      }}
                      disabled={task.status === "CU_SUCCES" || task.status === "FARA_SUCCES" || actingTaskId === task.id}
                    >
                      {actingTaskId === task.id ? "Se salvează..." : "Închide cu succes"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm"
                      onClick={async () => {
                        if (actingTaskId === task.id) return
                        setActingTaskId(task.id)
                        try {
                        await updateCrmTask({
                          taskId: task.id,
                          actorId: user?.uid || "",
                          status: "FARA_SUCCES",
                        })
                        setTasks((prev) =>
                          prev.map((row) => (row.id === task.id ? { ...row, status: "FARA_SUCCES" } : row))
                        )
                        await load()
                        } finally {
                          setActingTaskId(null)
                        }
                      }}
                      disabled={task.status === "CU_SUCCES" || task.status === "FARA_SUCCES" || actingTaskId === task.id}
                    >
                      {actingTaskId === task.id ? "Se salvează..." : "Închide fără succes"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-sm text-rose-600"
                      onClick={async () => {
                        if (actingTaskId === task.id) return
                        setActingTaskId(task.id)
                        try {
                        await deleteCrmTask(task.id, user?.uid || "")
                        setTasks((prev) => prev.filter((row) => row.id !== task.id))
                        await load()
                        } finally {
                          setActingTaskId(null)
                        }
                      }}
                      disabled={actingTaskId === task.id}
                    >
                      {actingTaskId === task.id ? "Se șterge..." : "Șterge"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
