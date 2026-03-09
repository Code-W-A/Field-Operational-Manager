"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowRight, CalendarClock, KanbanSquare, ListChecks, TrendingUp } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageShell, Panel, SectionHeader, SubtleBadge } from "@/components/crm"
import { listCrmDashboardStats, listCrmOpportunitiesForUser } from "@/lib/crm/opportunities"
import { listCrmTasksForOpportunityIds } from "@/lib/crm/tasks"
import { formatDateTime, priorityLabel, stageLabel, taskStatusLabel } from "@/lib/crm/presenters"
import type { CrmOpportunity, CrmTask } from "@/lib/crm/types"
import { getDateValue } from "@/lib/crm/activity"

function getTaskPriorityBucket(task?: CrmTask | null) {
  if (!task?.dueAt) return 3
  const due = getDateValue(task.dueAt)
  if (!due) return 3

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  if (due < startOfToday) return 0
  if (due >= startOfToday && due <= endOfToday) return 1
  return 2
}

function getMostUrgentOpenTask(tasks: CrmTask[]) {
  const openTasks = tasks.filter((task) => task.status === "TODO" || task.status === "IN_PROGRESS")
  if (!openTasks.length) return null

  return [...openTasks].sort((a, b) => {
    const bucketA = getTaskPriorityBucket(a)
    const bucketB = getTaskPriorityBucket(b)
    if (bucketA !== bucketB) return bucketA - bucketB

    const dueA = getDateValue(a.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER
    const dueB = getDateValue(b.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER
    return dueA - dueB
  })[0]
}

export default function CrmDashboardPage() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([])
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [stats, setStats] = useState<{ total: number; won: number; lost: number; stageStats: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return

      setLoading(true)
      try {
        const [opportunityRows, dashboardStats] = await Promise.all([
          listCrmOpportunitiesForUser(user.uid),
          listCrmDashboardStats(user.uid),
        ])

        const ownerByOpportunityId = opportunityRows.reduce<Record<string, string>>((acc, row) => {
          acc[row.id] = row.ownerId
          return acc
        }, {})

        const taskRows = await listCrmTasksForOpportunityIds({
          opportunityIds: opportunityRows.map((row) => row.id),
          userId: user.uid,
          ownerByOpportunityId,
          assigneeOnlyUserId: userData?.role === "admin" ? undefined : user.uid,
        })

        setOpportunities(opportunityRows)
        setTasks(taskRows)
        setStats(dashboardStats)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.uid, userData?.role])

  const opportunitiesWithUrgency = useMemo(() => {
    const groupedTasks = tasks.reduce<Record<string, CrmTask[]>>((acc, task) => {
      if (!acc[task.opportunityId]) acc[task.opportunityId] = []
      acc[task.opportunityId].push(task)
      return acc
    }, {})

    return opportunities
      .map((opportunity) => {
        const urgentTask = getMostUrgentOpenTask(groupedTasks[opportunity.id] || [])
        return { opportunity, urgentTask }
      })
      .sort((a, b) => {
        const bucketA = getTaskPriorityBucket(a.urgentTask)
        const bucketB = getTaskPriorityBucket(b.urgentTask)
        if (bucketA !== bucketB) return bucketA - bucketB

        const dueA = getDateValue(a.urgentTask?.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER
        const dueB = getDateValue(b.urgentTask?.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER
        return dueA - dueB
      })
  }, [opportunities, tasks])

  const taskBuckets = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const overdue = tasks.filter((task) => {
      const due = getDateValue(task.dueAt)
      return (task.status === "TODO" || task.status === "IN_PROGRESS") && due && due < startOfToday
    })

    const today = tasks.filter((task) => {
      const due = getDateValue(task.dueAt)
      return (task.status === "TODO" || task.status === "IN_PROGRESS") && due && due >= startOfToday && due <= endOfToday
    })

    const upcoming = tasks.filter((task) => {
      const due = getDateValue(task.dueAt)
      return (task.status === "TODO" || task.status === "IN_PROGRESS") && due && due > endOfToday
    })

    return { overdue, today, upcoming }
  }, [tasks])

  return (
    <PageShell>
      <SectionHeader
        title="Tablou de bord CRM"
        description="KPI-uri, oportunități prioritizate după ToDo și sarcini curente"
        action={
          <Button
            size="sm"
            className="h-10 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold shadow-sm shadow-blue-600/10 hover:bg-blue-700"
            onClick={() => router.push("/crm/opportunities")}
          >
            Vezi oportunitățile
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="crm-card">
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Total oportunități</p>
            <p className="mt-1 text-lg font-medium text-neutral-900">{stats?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="crm-card">
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Câștigate</p>
            <p className="mt-1 text-lg font-medium text-neutral-900">{stats?.won ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="crm-card">
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Pierdute</p>
            <p className="mt-1 text-lg font-medium text-neutral-900">{stats?.lost ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="crm-card">
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Sarcini deschise</p>
            <p className="mt-1 text-lg font-medium text-neutral-900">{tasks.filter((task) => task.status === "TODO" || task.status === "IN_PROGRESS").length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Oportunități prioritizate" subtitle="Ordine: Overdue → Today → Upcoming → fără ToDo">
          {loading ? (
            <p className="text-xs text-neutral-500">Se încarcă...</p>
          ) : opportunitiesWithUrgency.length === 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-neutral-500">Nu există oportunități vizibile.</p>
              <Link href="/crm/opportunities" className="text-xs font-medium text-blue-700 hover:underline">
                Deschide lista de oportunități
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {opportunitiesWithUrgency.slice(0, 8).map(({ opportunity, urgentTask }) => (
                <Link
                  key={opportunity.id}
                  href={`/crm/opportunities/${opportunity.id}/timeline`}
                  className="block rounded-lg border border-neutral-200 bg-white p-3 transition hover:border-neutral-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{opportunity.displayTitle}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {stageLabel(opportunity.pipelineStage)} • {priorityLabel(opportunity.priority)}
                      </p>
                    </div>
                    {urgentTask ? (
                      <SubtleBadge tone={getTaskPriorityBucket(urgentTask) === 0 ? "danger" : getTaskPriorityBucket(urgentTask) === 1 ? "warning" : "neutral"}>
                        {urgentTask.title}
                      </SubtleBadge>
                    ) : (
                      <SubtleBadge tone="neutral">Fără ToDo</SubtleBadge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Sarcini" subtitle="Overdue / Today / Upcoming">
          {loading ? (
            <p className="text-xs text-neutral-500">Se încarcă...</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                <p className="text-xs font-medium text-rose-700">Overdue ({taskBuckets.overdue.length})</p>
                <div className="mt-2 space-y-1">
                  {taskBuckets.overdue.slice(0, 3).map((task) => (
                    <p key={task.id} className="text-xs text-rose-700">{task.title}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                <p className="text-xs font-medium text-amber-700">Today ({taskBuckets.today.length})</p>
                <div className="mt-2 space-y-1">
                  {taskBuckets.today.slice(0, 3).map((task) => (
                    <p key={task.id} className="text-xs text-amber-700">{task.title}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-medium text-neutral-700">Upcoming ({taskBuckets.upcoming.length})</p>
                <div className="mt-2 space-y-1">
                  {taskBuckets.upcoming.slice(0, 3).map((task) => (
                    <p key={task.id} className="text-xs text-neutral-600">{task.title}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/crm/opportunities?view=list" className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600 hover:bg-neutral-50">
          <KanbanSquare className="mb-1 h-4 w-4 text-neutral-500" />
          Listă + Kanban
        </Link>
        <Link href="/crm/opportunities" className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600 hover:bg-neutral-50">
          <ListChecks className="mb-1 h-4 w-4 text-neutral-500" />
          Sarcini și reminder-e
        </Link>
        <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600">
          <CalendarClock className="mb-1 h-4 w-4 text-neutral-500" />
          Ultima actualizare: {formatDateTime(new Date())}
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600">
          <TrendingUp className="mb-1 h-4 w-4 text-neutral-500" />
          Pipeline activ
        </div>
      </div>

      {loading ? null : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
          <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
          Sarcinile și oportunitățile afișate respectă filtrele de acces proprietar/share/custom.
          <span className="ml-1 font-medium text-neutral-700">Status most recent: {tasks[0] ? taskStatusLabel(tasks[0].status) : "-"}</span>
        </div>
      )}
    </PageShell>
  )
}
