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
  const { user } = useAuth()
  const opportunityId = String(params?.id || "")
  const { opportunity } = useCrmOpportunity(opportunityId, user?.uid)

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState("")
  const [assigneeId, setAssigneeId] = useState<string>("")
  const [dueAt, setDueAt] = useState("")
  const [reminderAt, setReminderAt] = useState("")
  const [visibility, setVisibility] = useState<(typeof CRM_VISIBILITIES)[number]>("GENERAL")
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([])

  const userOptions = useMemo(() => users.map((row) => ({ value: row.uid, label: row.displayName })), [users])

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
    return <Panel title="Taskuri"><p className="text-xs text-neutral-500">Fără acces la oportunitate.</p></Panel>
  }

  return (
    <Panel title="Taskuri" subtitle="CRUD + quick actions: complete, reassign, reschedule, reminder">
      <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-2 text-xs font-medium text-neutral-700">Task nou</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titlu task" className="h-8 text-xs" />
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="h-8 text-xs">
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
          <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-8 text-xs" />
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
          {visibility === "CUSTOM" ? (
            <MultiSelect options={userOptions} selected={visibleToUserIds} onChange={setVisibleToUserIds} placeholder="Visible pentru" />
          ) : null}
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            className="h-8 text-xs"
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
              setVisibility("GENERAL")
              setVisibleToUserIds([])
              await load()
            }}
          >
            Adaugă task
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-neutral-500">Se încarcă taskurile...</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-neutral-500">Nu există taskuri vizibile.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{task.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">
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

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <Select
                  value={task.status}
                  onValueChange={async (status) => {
                    await updateCrmTask({ taskId: task.id, actorId: user?.uid || "", status: status as CrmTask["status"] })
                    await load()
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
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

                <Select
                  value={task.assigneeId || "UNASSIGNED"}
                  onValueChange={async (nextAssignee) => {
                    await updateCrmTask({
                      taskId: task.id,
                      actorId: user?.uid || "",
                      assigneeId: nextAssignee === "UNASSIGNED" ? "" : nextAssignee,
                    })
                    await load()
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
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
                  className="h-8 text-xs"
                  defaultValue={toDateTimeLocal(task.dueAt)}
                  onBlur={async (event) => {
                    if (!event.target.value) return
                    await updateCrmTask({
                      taskId: task.id,
                      actorId: user?.uid || "",
                      dueAt: new Date(event.target.value),
                    })
                    await load()
                  }}
                />

                <Input
                  type="datetime-local"
                  className="h-8 text-xs"
                  defaultValue={toDateTimeLocal(task.reminderAt)}
                  onBlur={async (event) => {
                    if (!event.target.value) return
                    await updateCrmTask({
                      taskId: task.id,
                      actorId: user?.uid || "",
                      reminderAt: new Date(event.target.value),
                    })
                    await load()
                  }}
                />
              </div>

              <div className="mt-2 flex justify-end">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
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
                    className="h-7 text-xs text-rose-600"
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
    </Panel>
  )
}
