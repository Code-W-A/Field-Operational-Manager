"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
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
import { CRM_TASK_STATUSES, CRM_TASK_STATUS_LABELS, CRM_VISIBILITY_LABELS, CRM_VISIBILITIES } from "@/lib/crm/constants"
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
  const [assigneeId, setAssigneeId] = useState<string>("")
  const [dueAt, setDueAt] = useState("")
  const [reminderAt, setReminderAt] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("PRIVATE")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<CrmTask["status"]>("TODO")
  const [editAssigneeId, setEditAssigneeId] = useState<string>("UNASSIGNED")
  const [editDueAt, setEditDueAt] = useState("")
  const [editReminderAt, setEditReminderAt] = useState("")

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

  if (!opportunity) {
    return <Panel title="Sarcini" size="comfortable"><p className="text-sm text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel
      title="Sarcini"
      subtitle="CRUD + acțiuni rapide: completare, reasignare, reprogramare, reminder"
      size="comfortable"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      {!isTechnician ? (
        <div className="mb-4 shrink-0 flex justify-end">
          <Button size="sm" className="h-9 text-sm" onClick={() => setIsCreateOpen(true)}>
            Adaugă sarcină
          </Button>
        </div>
      ) : null}

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Assignee" />
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
                <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-9 text-sm" />
                <Input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className="h-9 text-sm" />
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
                  onClick={async () => {
                    if (!title.trim() || !user?.uid) return
                    await createCrmTask({
                      opportunityId,
                      title,
                      createdById: user.uid,
                      assigneeId,
                      dueAt: dueAt ? new Date(dueAt) : undefined,
                      reminderAt: reminderAt ? new Date(reminderAt) : undefined,
                      visibility,
                      visibleToUserIds,
                    })
                    setTitle("")
                    setAssigneeId("")
                    setDueAt("")
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
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_TASK_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {CRM_TASK_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={editAssigneeId} onValueChange={setEditAssigneeId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Reassign" />
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
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={editReminderAt}
                  onChange={(event) => setEditReminderAt(event.target.value)}
                />
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm"
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
                  onClick={async () => {
                    if (!editingTaskId) return
                    await updateCrmTask({
                      taskId: editingTaskId,
                      actorId: user?.uid || "",
                      status: editStatus,
                      assigneeId: editAssigneeId === "UNASSIGNED" ? "" : editAssigneeId,
                      dueAt: editDueAt ? new Date(editDueAt) : null,
                      reminderAt: editReminderAt ? new Date(editReminderAt) : null,
                    })
                    setEditingTaskId(null)
                    setIsEditOpen(false)
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
        {loading ? (
          <p className="text-sm text-neutral-500">Se încarcă sarcinile...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-neutral-500">Nu există sarcini vizibile.</p>
        ) : (
          <div className="space-y-2 pb-1">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-neutral-900">{task.title}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {formatDateTime(task.dueAt)} • Reminder: {formatDateTime(task.reminderAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <SubtleBadge tone={task.status === "DONE" ? "success" : task.status === "CANCELED" ? "danger" : "neutral"}>
                      {taskStatusLabel(task.status)}
                    </SubtleBadge>
                    <SubtleBadge tone="neutral">{CRM_VISIBILITY_LABELS[task.visibility]}</SubtleBadge>
                  </div>
                </div>

                <div className="mt-3 grid gap-1 text-sm text-neutral-600 md:grid-cols-2">
                  <p>Status: {taskStatusLabel(task.status)}</p>
                  <p>Responsabil: {task.assigneeId ? userNameMap[task.assigneeId] || task.assigneeId : "Neasignat"}</p>
                  <p>Termen: {formatDateTime(task.dueAt)}</p>
                  <p>Reminder: {formatDateTime(task.reminderAt)}</p>
                </div>

                <div className="mt-2 flex justify-end">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm"
                      onClick={() => {
                        setEditingTaskId(task.id)
                        setEditStatus(task.status)
                        setEditAssigneeId(task.assigneeId || "UNASSIGNED")
                        setEditDueAt(toDateTimeLocal(task.dueAt))
                        setEditReminderAt(toDateTimeLocal(task.reminderAt))
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
                        await completeCrmTask(task.id, user?.uid || "")
                        await load()
                      }}
                      disabled={task.status === "DONE"}
                    >
                      Marchează completat
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-sm text-rose-600"
                      onClick={async () => {
                        await deleteCrmTask(task.id, user?.uid || "")
                        await load()
                      }}
                    >
                      Șterge
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
