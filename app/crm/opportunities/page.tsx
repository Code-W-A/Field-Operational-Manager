"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, Inbox, LayoutGrid, List, Search, UserRound } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OpportunityTypeSidebar, PageShell, Panel, SegmentedControl, TaskCounterRing } from "@/components/crm"
import {
  CRM_OPPORTUNITY_SELECTABLE_TYPES,
  CRM_OPPORTUNITY_TYPE_LABELS,
  CRM_PIPELINE_STAGE_LABELS,
  CRM_OPPORTUNITY_TYPES,
  getPipelineStagesForOpportunityType,
  isLostPipelineStage,
  isTerminalPipelineStageForOpportunityType,
  isWonPipelineStageForOpportunityType,
  CRM_PRIORITIES,
  CRM_PRIORITY_LABELS,
  CRM_WORK_STATUSES,
  CRM_WORK_STATUS_LABELS,
} from "@/lib/crm/constants"
import { getDateValue } from "@/lib/crm/activity"
import { listCrmOpportunitiesForUser, listCrmClients, listCrmUsers } from "@/lib/crm/opportunities"
import { listCrmTasksForOpportunityIds } from "@/lib/crm/tasks"
import { formatDateTime, priorityLabel, stageLabel, taskStatusLabel, workStatusLabel } from "@/lib/crm/presenters"
import type { CrmFilters, CrmOpportunity, CrmTask } from "@/lib/crm/types"
import { CreateOpportunityDialog } from "@/components/crm/create-opportunity-dialog"
import { OpportunitiesKanban } from "@/components/crm/opportunities-kanban"
import { changeCrmOpportunityStage } from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"
import { crmUi } from "@/components/crm/ui"
import { cn } from "@/lib/utils"

const LEFT_FILTER_ITEMS = CRM_OPPORTUNITY_SELECTABLE_TYPES
type OpportunityTypeFilter = (typeof LEFT_FILTER_ITEMS)[number] | "ALL"

type TaskQuickFilterKey = "ACTIVE" | "IN_PROGRESS" | "DONE" | "OVERDUE"
type LeftTypeItem = {
  key: (typeof LEFT_FILTER_ITEMS)[number]
  label: string
  count: number
}

const TASK_QUICK_FILTER_LABELS: Record<TaskQuickFilterKey, string> = {
  ACTIVE: "Active",
  IN_PROGRESS: "In lucru",
  DONE: "Indeplinite",
  OVERDUE: "Intarziate",
}

const STAGE_DOT_CLASS = ["bg-slate-300", "bg-sky-400", "bg-blue-500", "bg-violet-500", "bg-lime-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-amber-500", "bg-teal-500"]

function isTaskOverdue(task: CrmTask, referenceDate = new Date()) {
  if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return false
  const dueDate = getDateValue(task.dueAt)
  if (!dueDate) return false
  return dueDate.getTime() < referenceDate.getTime()
}

function matchesTaskQuickFilter(task: CrmTask, filter: TaskQuickFilterKey) {
  if (filter === "ACTIVE") return task.status === "TODO"
  if (filter === "IN_PROGRESS") return task.status === "IN_PROGRESS"
  if (filter === "DONE") return task.status === "DONE"
  return isTaskOverdue(task)
}

function getPrimaryTask(tasks: CrmTask[]) {
  if (!tasks.length) return null

  return [...tasks].sort((a, b) => {
    const rankA =
      isTaskOverdue(a) ? 0 :
      a.status === "IN_PROGRESS" ? 1 :
      a.status === "TODO" ? 2 :
      a.status === "DONE" ? 3 :
      4

    const rankB =
      isTaskOverdue(b) ? 0 :
      b.status === "IN_PROGRESS" ? 1 :
      b.status === "TODO" ? 2 :
      b.status === "DONE" ? 3 :
      4

    if (rankA !== rankB) return rankA - rankB

    const dueA = getDateValue(a.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER
    const dueB = getDateValue(b.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER
    if (dueA !== dueB) return dueA - dueB

    const updatedA = getDateValue(a.updatedAt)?.getTime() || 0
    const updatedB = getDateValue(b.updatedAt)?.getTime() || 0
    return updatedB - updatedA
  })[0]
}

function getTaskStatusChipClass(task?: CrmTask | null) {
  if (!task) return "border border-neutral-200 bg-neutral-100 text-neutral-600"
  if (isTaskOverdue(task)) return "border border-red-200 bg-red-100 text-red-700"
  if (task.status === "IN_PROGRESS") return "border border-slate-200 bg-slate-100 text-slate-700"
  if (task.status === "DONE") return "border border-lime-200 bg-lime-100 text-lime-700"
  if (task.status === "TODO") return "border border-sky-200 bg-sky-100 text-sky-700"
  return "border border-neutral-200 bg-neutral-100 text-neutral-600"
}

function isOpportunityActive(opportunity: CrmOpportunity) {
  return !isTerminalPipelineStageForOpportunityType(opportunity.opportunityType, opportunity.pipelineStage) && opportunity.workStatus !== "DONE"
}

export default function CrmOpportunitiesPage() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const loadRequestVersionRef = useRef(0)
  const isTechnician = userData?.role === "tehnician"

  const typeFromUrlRaw = (searchParams.get("type") || "").toUpperCase()
  const typeFromUrl = LEFT_FILTER_ITEMS.includes(typeFromUrlRaw as (typeof LEFT_FILTER_ITEMS)[number])
    ? (typeFromUrlRaw as (typeof LEFT_FILTER_ITEMS)[number])
    : "ALL"
  const [activeType, setActiveType] = useState<OpportunityTypeFilter>(
    typeFromUrl
  )

  const [viewMode, setViewMode] = useState<"LIST" | "KANBAN">("LIST")
  const [search, setSearch] = useState("")
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL")
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL")
  const [stageFilter, setStageFilter] = useState<string>("ALL")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [taskQuickFilter, setTaskQuickFilter] = useState<TaskQuickFilterKey | null>(null)

  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([])
  const [opportunitiesForTypeCounts, setOpportunitiesForTypeCounts] = useState<CrmOpportunity[]>([])
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [clientMap, setClientMap] = useState<Record<string, string>>({})
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(true)

  const resetToHome = () => {
    setActiveType("ALL")
    setSearch("")
    setOwnerFilter("ALL")
    setPriorityFilter("ALL")
    setStageFilter("ALL")
    setStatusFilter("ALL")
    setTaskQuickFilter(null)
    setViewMode("LIST")
    router.replace("/crm/opportunities")
  }

  const filters: CrmFilters = useMemo(
    () => ({
      type: activeType,
      search,
      ownerId: ownerFilter === "ALL" ? "ALL" : ownerFilter,
      priority: priorityFilter === "ALL" ? "ALL" : (priorityFilter as CrmFilters["priority"]),
      pipelineStage: stageFilter === "ALL" ? "ALL" : stageFilter,
      workStatus: statusFilter === "ALL" ? "ALL" : (statusFilter as CrmFilters["workStatus"]),
    }),
    [activeType, search, ownerFilter, priorityFilter, stageFilter, statusFilter]
  )

  useEffect(() => {
    if (typeFromUrlRaw && typeFromUrl === "ALL") {
      router.replace("/crm/opportunities")
      return
    }
    setActiveType((current) => (current === typeFromUrl ? current : typeFromUrl))
  }, [router, typeFromUrl, typeFromUrlRaw])

  const availableStages = useMemo(() => {
    if (activeType !== "ALL") return getPipelineStagesForOpportunityType(activeType)
    return Array.from(new Set(CRM_OPPORTUNITY_TYPES.flatMap((type) => getPipelineStagesForOpportunityType(type))))
  }, [activeType])

  useEffect(() => {
    if (stageFilter === "ALL") return
    if (!availableStages.includes(stageFilter)) {
      setStageFilter("ALL")
    }
  }, [availableStages, stageFilter])

  const loadData = async () => {
    if (!user?.uid) {
      setOpportunities([])
      setOpportunitiesForTypeCounts([])
      setTasks([])
      setLoading(false)
      setTasksLoading(false)
      return
    }

    const requestVersion = ++loadRequestVersionRef.current

    setLoading(true)
    setTasksLoading(true)

    try {
      const [rows, rowsForTypeCounts, clients, users] = await Promise.all([
        listCrmOpportunitiesForUser(user.uid, filters),
        listCrmOpportunitiesForUser(user.uid, { ...filters, type: "ALL" }),
        listCrmClients(),
        listCrmUsers(),
      ])

      if (requestVersion !== loadRequestVersionRef.current) return

      const nextClientMap = clients.reduce<Record<string, string>>((acc, client) => {
        acc[client.id] = client.name
        return acc
      }, {})

      const nextOwnerMap = users.reduce<Record<string, string>>((acc, crmUser) => {
        acc[crmUser.uid] = crmUser.displayName || crmUser.email || crmUser.uid
        return acc
      }, {})

      const ownerByOpportunityId = rows.reduce<Record<string, string>>((acc, opportunity) => {
        acc[opportunity.id] = opportunity.ownerId
        return acc
      }, {})

      const taskRows = rows.length
        ? await listCrmTasksForOpportunityIds({
            opportunityIds: rows.map((opportunity) => opportunity.id),
            userId: user.uid,
            ownerByOpportunityId,
          })
        : []

      if (requestVersion !== loadRequestVersionRef.current) return

      setOpportunities(rows)
      setOpportunitiesForTypeCounts(rowsForTypeCounts)
      setTasks(taskRows)
      setClientMap(nextClientMap)
      setOwnerMap(nextOwnerMap)
    } finally {
      if (requestVersion === loadRequestVersionRef.current) {
        setLoading(false)
        setTasksLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeType, search, ownerFilter, priorityFilter, stageFilter, statusFilter])

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>()
    opportunities.forEach((opportunity) => {
      map.set(opportunity.ownerId, ownerMap[opportunity.ownerId] || opportunity.ownerId)
    })
    return Array.from(map.entries())
  }, [opportunities, ownerMap])

  const tasksByOpportunityId = useMemo(() => {
    return tasks.reduce<Record<string, CrmTask[]>>((acc, task) => {
      if (!acc[task.opportunityId]) acc[task.opportunityId] = []
      acc[task.opportunityId].push(task)
      return acc
    }, {})
  }, [tasks])

  const taskCounters = useMemo(() => {
    const now = new Date()
    return tasks.reduce(
      (acc, task) => {
        if (task.status === "TODO") acc.active += 1
        if (task.status === "IN_PROGRESS") acc.inProgress += 1
        if (task.status === "DONE") acc.done += 1
        if (isTaskOverdue(task, now)) acc.overdue += 1
        return acc
      },
      { active: 0, inProgress: 0, done: 0, overdue: 0 }
    )
  }, [tasks])

  const displayedOpportunities = useMemo(() => {
    if (!taskQuickFilter) return opportunities

    return opportunities.filter((opportunity) => {
      const opportunityTasks = tasksByOpportunityId[opportunity.id] || []
      return opportunityTasks.some((task) => matchesTaskQuickFilter(task, taskQuickFilter))
    })
  }, [opportunities, taskQuickFilter, tasksByOpportunityId])

  const displayedStageStats = useMemo(() => {
    const map: Record<string, number> = {}
    availableStages.forEach((stage) => {
      map[stage] = 0
    })

    displayedOpportunities.forEach((opportunity) => {
      map[opportunity.pipelineStage] = (map[opportunity.pipelineStage] || 0) + 1
    })

    return map
  }, [availableStages, displayedOpportunities])

  const activeOpportunityCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 }
    LEFT_FILTER_ITEMS.forEach((type) => {
      counts[type] = 0
    })

    opportunitiesForTypeCounts.forEach((opportunity) => {
      if (!isOpportunityActive(opportunity)) return
      counts.ALL += 1
      if (counts[opportunity.opportunityType] !== undefined) {
        counts[opportunity.opportunityType] += 1
      }
    })

    return counts
  }, [opportunitiesForTypeCounts])

  const leftTypeItems = useMemo<LeftTypeItem[]>(() => {
    return [
      ...LEFT_FILTER_ITEMS.map((item) => ({
        key: item,
        label: CRM_OPPORTUNITY_TYPE_LABELS[item],
        count: activeOpportunityCounts[item] || 0,
      })),
    ]
  }, [activeOpportunityCounts])
  const sidebarHomeItem = {
    key: "ALL",
    label: "Acasa",
    active: activeType === "ALL",
    onClick: resetToHome,
    title: "Acasa",
  }
  const sidebarItems = leftTypeItems.map((item) => ({
    ...item,
    active: activeType === item.key,
    onClick: () => {
      setActiveType(item.key)
      const next = new URLSearchParams(searchParams.toString())
      next.set("type", item.key)
      router.replace(`/crm/opportunities?${next.toString()}`)
    },
    title: item.label,
  }))

  const counterItems = [
    {
      key: "ACTIVE" as const,
      label: TASK_QUICK_FILTER_LABELS.ACTIVE,
      value: taskCounters.active,
      tone: "active" as const,
    },
    {
      key: "IN_PROGRESS" as const,
      label: TASK_QUICK_FILTER_LABELS.IN_PROGRESS,
      value: taskCounters.inProgress,
      tone: "inProgress" as const,
    },
    {
      key: "DONE" as const,
      label: TASK_QUICK_FILTER_LABELS.DONE,
      value: taskCounters.done,
      tone: "done" as const,
    },
    {
      key: "OVERDUE" as const,
      label: TASK_QUICK_FILTER_LABELS.OVERDUE,
      value: taskCounters.overdue,
      tone: "overdue" as const,
    },
  ]

  const isMainLoading = loading || tasksLoading

  return (
    <PageShell className="flex h-full min-h-0 flex-col space-y-0 overflow-hidden bg-[#f6f8fc]">
      <div className="grid h-full flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[216px_1fr_300px]">
        <OpportunityTypeSidebar homeItem={sidebarHomeItem} items={sidebarItems} />

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <Panel className="mt-2 rounded-md border-neutral-300 bg-white shadow-none shrink-0" contentClassName="space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cautare dupa code / titlu / client / contact"
                  className={`${crmUi.inputBase} pl-9`}
                />
              </div>

              <SegmentedControl
                value={viewMode}
                onValueChange={(value) => setViewMode(value as "LIST" | "KANBAN")}
                items={[
                  { id: "LIST", label: "Lista", icon: List },
                  { id: "KANBAN", label: "Kanban", icon: LayoutGrid },
                ]}
              />
              <CreateOpportunityDialog
                actorId={user?.uid || ""}
                iconOnly
                onCreated={(opportunityId) => router.push(`/crm/opportunities/${opportunityId}/timeline`)}
              />
            </div>

            <div className="py-1">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {counterItems.map((item) => (
                  <TaskCounterRing
                    key={item.key}
                    label={item.label}
                    value={item.value}
                    tone={item.tone}
                    loading={tasksLoading}
                    active={taskQuickFilter === item.key}
                    onClick={() => {
                      setTaskQuickFilter((current) => (current === item.key ? null : item.key))
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-1 text-xs text-neutral-500">
              <p>
                Counterele masoara sarcinile din oportunitatile filtrate curent.
                {taskQuickFilter ? <span className="ml-1 text-neutral-700">Quick-filter activ: {TASK_QUICK_FILTER_LABELS[taskQuickFilter]}.</span> : null}
              </p>
              {taskQuickFilter ? (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setTaskQuickFilter(null)}>
                  Reseteaza quick-filter
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className={crmUi.selectTrigger}>
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toti ownerii</SelectItem>
                  {ownerOptions.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className={crmUi.selectTrigger}>
                  <SelectValue placeholder="Prioritate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toate prioritatile</SelectItem>
                  {CRM_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {CRM_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className={crmUi.selectTrigger}>
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toate stage-urile</SelectItem>
                  {availableStages.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CRM_PIPELINE_STAGE_LABELS[stage] || stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={crmUi.selectTrigger}>
                  <SelectValue placeholder="Status lucru" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toate statusurile</SelectItem>
                  {CRM_WORK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CRM_WORK_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Panel>

          <Panel
            title={viewMode === "LIST" ? undefined : "Kanban pipeline"}
            className="rounded-md border-neutral-300 bg-white shadow-none flex min-h-0 flex-1 flex-col overflow-hidden"
            contentClassName="min-h-0 overflow-y-auto p-0"
          >
            {isMainLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="h-[72px] animate-pulse rounded-lg border border-neutral-200 bg-neutral-50" />
                ))}
              </div>
            ) : opportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-12 text-center">
                <div className="rounded-full border border-neutral-200 bg-neutral-50 p-3">
                  <Inbox className="h-5 w-5 text-neutral-500" />
                </div>
                <p className="text-sm font-medium text-neutral-800">Nu exista oportunitati pentru filtrele curente</p>
                <p className="text-xs text-neutral-500">
                  {isTechnician
                    ? "Ajusteaza filtrele pentru a vedea oportunitatile alocate tie."
                    : "Ajusteaza filtrele sau creeaza o oportunitate noua din butonul de sus."}
                </p>
              </div>
            ) : displayedOpportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-12 text-center">
                <div className="rounded-full border border-neutral-200 bg-neutral-50 p-3">
                  <AlertCircle className="h-5 w-5 text-neutral-500" />
                </div>
                <p className="text-sm font-medium text-neutral-800">Nicio oportunitate nu are sarcini pentru quick-filterul selectat</p>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setTaskQuickFilter(null)}>
                  Reseteaza quick-filter sarcini
                </Button>
              </div>
            ) : viewMode === "LIST" ? (
              <div>
                <div className="sticky top-0 z-10 hidden border-y border-neutral-300 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] md:gap-3">
                  <span>Oportunitate</span>
                  <span>Status sarcina</span>
                  <span>Responsabil sarcina</span>
                  <span>Termen</span>
                </div>

                <div className="divide-y divide-neutral-300">
                  {displayedOpportunities.map((opportunity) => {
                    const opportunityTasks = tasksByOpportunityId[opportunity.id] || []
                    const primaryTask = getPrimaryTask(opportunityTasks)
                    const primaryTaskOwner = primaryTask?.assigneeId
                      ? (ownerMap[primaryTask.assigneeId] || primaryTask.assigneeId)
                      : "Neasignat"

                    return (
                      <Link
                        key={opportunity.id}
                        href={`/crm/opportunities/${opportunity.id}/timeline`}
                        className="block px-4 py-2.5 transition hover:bg-[#f5f8fc]"
                      >
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] md:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-900" title={opportunity.displayTitle}>
                              {opportunity.displayTitle}
                            </p>
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-neutral-500">
                              <span className="truncate" title={clientMap[opportunity.clientId] || "Client necunoscut"}>
                                {clientMap[opportunity.clientId] || "Client necunoscut"}
                              </span>
                              <span className="text-neutral-300">•</span>
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <UserRound className="h-3.5 w-3.5" />
                                <span className="truncate" title={ownerMap[opportunity.ownerId] || opportunity.ownerId}>
                                  {ownerMap[opportunity.ownerId] || opportunity.ownerId}
                                </span>
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex rounded-sm border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                                {stageLabel(opportunity.pipelineStage)}
                              </span>
                              <span className="text-[11px] text-neutral-500">{priorityLabel(opportunity.priority)}</span>
                              <span className="text-[11px] text-neutral-500">{workStatusLabel(opportunity.workStatus)}</span>
                            </div>
                            {primaryTask ? (
                              <p className="mt-2 truncate text-xs text-neutral-500" title={primaryTask.title}>
                                Sarcina principală: {primaryTask.title}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-neutral-400">Fara sarcini asociate</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {primaryTask ? (
                              <>
                                <span className={cn("inline-flex rounded-sm px-2 py-1 text-[11px] font-semibold", getTaskStatusChipClass(primaryTask))}>
                                  {taskStatusLabel(primaryTask.status)}
                                </span>
                                {isTaskOverdue(primaryTask) ? <AlertCircle className="h-3.5 w-3.5 text-rose-600" /> : null}
                              </>
                            ) : (
                              <span className="inline-flex rounded-sm border border-neutral-200 bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">Fara sarcină</span>
                            )}
                          </div>

                          <div className="text-xs text-neutral-600">{primaryTask ? primaryTaskOwner : "-"}</div>

                          <div className="text-xs text-neutral-600">
                            {primaryTask?.dueAt ? formatDateTime(primaryTask.dueAt) : "Fara termen"}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <OpportunitiesKanban
                  opportunities={displayedOpportunities}
                  readOnly={isTechnician}
                  onMove={async ({ opportunityId, toStage, lostReason, createRecontactTask }) => {
                    await changeCrmOpportunityStage({
                      opportunityId,
                      actorId: user?.uid || "",
                      toStage,
                      lostReason,
                      createRecontactTask,
                    })
                    toast({
                      title: "Stage actualizat",
                      description: `Oportunitatea a fost mutata in ${CRM_PIPELINE_STAGE_LABELS[toStage] || toStage}.`,
                    })
                    await loadData()
                  }}
                />
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title="Sumar filtre curente"
          className="rounded-md border-neutral-300 bg-[#f3f4f6] shadow-none xl:h-full xl:rounded-none xl:border-y-0 xl:border-r-0 xl:border-l xl:border-neutral-300"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p className={crmUi.labelXs}>Oportunitati</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Filtrate curent</span>
                <span className="font-semibold text-neutral-900">{opportunities.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Afisate in lista/kanban</span>
                <span className="font-semibold text-neutral-900">{displayedOpportunities.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Castigate</span>
                <span className="font-semibold text-neutral-900">
                  {displayedOpportunities.filter((opportunity) => isWonPipelineStageForOpportunityType(opportunity.opportunityType, opportunity.pipelineStage)).length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Pierdute</span>
                <span className="font-semibold text-neutral-900">
                  {displayedOpportunities.filter((opportunity) => isLostPipelineStage(opportunity.pipelineStage)).length}
                </span>
              </div>
            </div>

            <div className="border-t border-neutral-300 pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Sarcini</p>
              <div className="space-y-1.5">
                <p className="flex items-center justify-between text-sm text-neutral-600">
                  <span>Active</span>
                  <span className="font-medium text-neutral-900">{taskCounters.active}</span>
                </p>
                <p className="flex items-center justify-between text-sm text-neutral-600">
                  <span>In lucru</span>
                  <span className="font-medium text-neutral-900">{taskCounters.inProgress}</span>
                </p>
                <p className="flex items-center justify-between text-sm text-neutral-600">
                  <span>Indeplinite</span>
                  <span className="font-medium text-neutral-900">{taskCounters.done}</span>
                </p>
                <p className="flex items-center justify-between text-sm text-neutral-600">
                  <span>Intarziate</span>
                  <span className="font-medium text-rose-700">{taskCounters.overdue}</span>
                </p>
              </div>
            </div>

            <div className="border-t border-neutral-300 pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">By stage</p>
              <div className="space-y-1.5">
                {availableStages.map((stage, index) => (
                  <p key={stage} className="flex items-center justify-between text-sm text-neutral-600">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-sm", STAGE_DOT_CLASS[index % STAGE_DOT_CLASS.length])} />
                      <span>{CRM_PIPELINE_STAGE_LABELS[stage] || stage}</span>
                    </span>
                    <span className="font-medium text-neutral-900">{displayedStageStats[stage] || 0}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
