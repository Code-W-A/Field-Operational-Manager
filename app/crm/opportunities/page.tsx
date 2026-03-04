"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Inbox, LayoutGrid, List, Search, UserRound } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageShell, Panel, SectionHeader, SegmentedControl, SubtleBadge } from "@/components/crm"
import { CRM_OPPORTUNITY_TYPES, CRM_OPPORTUNITY_TYPE_LABELS, CRM_PIPELINE_STAGES, CRM_PIPELINE_STAGE_LABELS, CRM_PRIORITIES, CRM_PRIORITY_LABELS, CRM_WORK_STATUSES, CRM_WORK_STATUS_LABELS } from "@/lib/crm/constants"
import { listCrmOpportunitiesForUser, listCrmDashboardStats, listCrmClients, listCrmUsers } from "@/lib/crm/opportunities"
import { priorityLabel, stageLabel, workStatusLabel } from "@/lib/crm/presenters"
import type { CrmFilters, CrmOpportunity } from "@/lib/crm/types"
import { CreateOpportunityDialog } from "@/components/crm/create-opportunity-dialog"
import { OpportunitiesKanban } from "@/components/crm/opportunities-kanban"
import { changeCrmOpportunityStage } from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"
import { crmUi } from "@/components/crm/ui"

const LEFT_FILTER_ITEMS = CRM_OPPORTUNITY_TYPES

export default function CrmOpportunitiesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const typeFromUrl = (searchParams.get("type") || "ACASA").toUpperCase()
  const [activeType, setActiveType] = useState<(typeof CRM_OPPORTUNITY_TYPES)[number]>(
    LEFT_FILTER_ITEMS.includes(typeFromUrl as (typeof CRM_OPPORTUNITY_TYPES)[number])
      ? (typeFromUrl as (typeof CRM_OPPORTUNITY_TYPES)[number])
      : "ACASA"
  )

  const [viewMode, setViewMode] = useState<"LIST" | "KANBAN">("LIST")
  const [search, setSearch] = useState("")
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL")
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL")
  const [stageFilter, setStageFilter] = useState<string>("ALL")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")

  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([])
  const [clientMap, setClientMap] = useState<Record<string, string>>({})
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<{ total: number; won: number; lost: number; stageStats: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)

  const filters: CrmFilters = useMemo(
    () => ({
      type: activeType,
      search,
      ownerId: ownerFilter === "ALL" ? "ALL" : ownerFilter,
      priority: priorityFilter === "ALL" ? "ALL" : (priorityFilter as CrmFilters["priority"]),
      pipelineStage: stageFilter === "ALL" ? "ALL" : (stageFilter as CrmFilters["pipelineStage"]),
      workStatus: statusFilter === "ALL" ? "ALL" : (statusFilter as CrmFilters["workStatus"]),
    }),
    [activeType, search, ownerFilter, priorityFilter, stageFilter, statusFilter]
  )

  useEffect(() => {
    if (LEFT_FILTER_ITEMS.includes(typeFromUrl as (typeof CRM_OPPORTUNITY_TYPES)[number])) {
      setActiveType(typeFromUrl as (typeof CRM_OPPORTUNITY_TYPES)[number])
    }
  }, [typeFromUrl])

  const loadData = async () => {
    if (!user?.uid) return

    setLoading(true)
    try {
      const [rows, dashboardStats, clients, users] = await Promise.all([
        listCrmOpportunitiesForUser(user.uid, filters),
        listCrmDashboardStats(user.uid),
        listCrmClients(),
        listCrmUsers(),
      ])

      setOpportunities(rows)
      setStats(dashboardStats)
      setClientMap(
        clients.reduce<Record<string, string>>((acc, client) => {
          acc[client.id] = client.name
          return acc
        }, {})
      )
      setOwnerMap(
        users.reduce<Record<string, string>>((acc, crmUser) => {
          acc[crmUser.uid] = crmUser.displayName || crmUser.email || crmUser.uid
          return acc
        }, {})
      )
    } finally {
      setLoading(false)
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

  return (
    <PageShell>
      <SectionHeader
        title="Oportunități"
        description="Filtrează, caută și gestionează oportunități în listă sau kanban"
        action={<CreateOpportunityDialog actorId={user?.uid || ""} onCreated={(opportunityId) => router.push(`/crm/opportunities/${opportunityId}/timeline`)} />}
      />

      <div className="grid gap-4 xl:grid-cols-[220px_1fr_280px]">
        <Panel className="bg-white" contentClassName="pt-3">
          <div className="mb-2 border-b border-neutral-100 pb-2">
            <p className={crmUi.labelXs}>Tip oportunitate</p>
          </div>
          <div className="space-y-1">
            {LEFT_FILTER_ITEMS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setActiveType(item)
                  const next = new URLSearchParams(searchParams.toString())
                  next.set("type", item)
                  router.replace(`/crm/opportunities?${next.toString()}`)
                }}
                className={`flex h-9 w-full items-center truncate rounded-lg border-l-2 px-3 text-left text-sm transition ${
                  activeType === item
                    ? "border-l-blue-500 bg-neutral-100 text-neutral-900"
                    : "border-l-transparent text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
                title={CRM_OPPORTUNITY_TYPE_LABELS[item]}
              >
                <span className="truncate">{CRM_OPPORTUNITY_TYPE_LABELS[item]}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="crm-panel" contentClassName="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Caută după code/titlu/client/contact"
                  className={`${crmUi.inputBase} pl-9`}
                />
              </div>

              <SegmentedControl
                value={viewMode}
                onValueChange={(value) => setViewMode(value as "LIST" | "KANBAN")}
                items={[
                  { id: "LIST", label: "Listă", icon: List },
                  { id: "KANBAN", label: "Kanban", icon: LayoutGrid },
                ]}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className={crmUi.selectTrigger}>
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toți ownerii</SelectItem>
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
                  <SelectItem value="ALL">Toate prioritățile</SelectItem>
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
                  {CRM_PIPELINE_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CRM_PIPELINE_STAGE_LABELS[stage]}
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

          <Panel title={viewMode === "LIST" ? "Listă oportunități" : "Kanban pipeline"} contentClassName="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-[62px] animate-pulse rounded-lg border border-neutral-200 bg-neutral-50" />
                ))}
              </div>
            ) : opportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-12 text-center">
                <div className="rounded-full border border-neutral-200 bg-neutral-50 p-3">
                  <Inbox className="h-5 w-5 text-neutral-500" />
                </div>
                <p className="text-sm font-medium text-neutral-800">Nu există oportunități pentru filtrele curente</p>
                <p className="text-xs text-neutral-500">Ajustează filtrele sau creează o oportunitate nouă din butonul de sus.</p>
              </div>
            ) : viewMode === "LIST" ? (
              <div className="space-y-2 p-4">
                {opportunities.map((opportunity) => (
                  <Link
                    key={opportunity.id}
                    href={`/crm/opportunities/${opportunity.id}/timeline`}
                    className={`${crmUi.interactiveRow} block p-3`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-900" title={opportunity.displayTitle}>
                          {opportunity.displayTitle}
                        </p>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-neutral-500">
                          <span className="truncate" title={clientMap[opportunity.clientId] || "Client necunoscut"}>
                            {clientMap[opportunity.clientId] || "Client necunoscut"}
                          </span>
                          <span className="text-neutral-300">•</span>
                          <span>Next ToDo: -</span>
                          <span className="text-neutral-300">•</span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <UserRound className="h-3.5 w-3.5" />
                            <span className="truncate" title={ownerMap[opportunity.ownerId] || opportunity.ownerId}>
                              {ownerMap[opportunity.ownerId] || opportunity.ownerId}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SubtleBadge tone="neutral">{priorityLabel(opportunity.priority)}</SubtleBadge>
                        <SubtleBadge tone="accent">{stageLabel(opportunity.pipelineStage)}</SubtleBadge>
                        <SubtleBadge tone="neutral">{workStatusLabel(opportunity.workStatus)}</SubtleBadge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <OpportunitiesKanban
                  opportunities={opportunities}
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
                      description: `Oportunitatea a fost mutată în ${CRM_PIPELINE_STAGE_LABELS[toStage]}.`,
                    })
                    await loadData()
                  }}
                />
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Sumar" className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Total pipeline</span>
                <span className="font-semibold text-neutral-900">{stats?.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Câștigate</span>
                <span className="font-semibold text-neutral-900">{stats?.won ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Pierdute</span>
                <span className="font-semibold text-neutral-900">{stats?.lost ?? 0}</span>
              </div>
            </div>
            <div className="border-t border-neutral-100 pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">By stage</p>
              <div className="space-y-1.5">
                {CRM_PIPELINE_STAGES.map((stage) => (
                  <p key={stage} className="flex items-center justify-between text-sm text-neutral-600">
                    <span>{CRM_PIPELINE_STAGE_LABELS[stage]}</span>
                    <span className="font-medium text-neutral-900">{stats?.stageStats?.[stage] || 0}</span>
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
