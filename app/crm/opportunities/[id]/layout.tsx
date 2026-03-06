"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { CalendarDays, Check, ClipboardCheck, FileText, Loader2, Mail, MessageSquare, Pencil, Timer, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Panel, TabsHeader } from "@/components/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getCrmClientById,
  getCrmOpportunityById,
  listCrmClientContacts,
  listCrmOpportunitiesForUser,
  listCrmOpportunityContacts,
  listCrmUsers,
} from "@/lib/crm/opportunities"
import { formatDateTime, priorityLabel, stageLabel, workStatusLabel } from "@/lib/crm/presenters"
import {
  CRM_OPPORTUNITY_SELECTABLE_TYPES,
  CRM_OPPORTUNITY_TYPE_LABELS,
  CRM_PIPELINE_STAGES,
  CRM_PIPELINE_STAGE_LABELS,
} from "@/lib/crm/constants"
import type { CrmClient, CrmOpportunity } from "@/lib/crm/types"
import { updateCrmOpportunity } from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"

interface OpportunityLayoutProps {
  children: import("react").ReactNode
}

const LEFT_FILTER_ITEMS = CRM_OPPORTUNITY_SELECTABLE_TYPES

function isOpportunityActive(opportunity: CrmOpportunity) {
  return opportunity.pipelineStage !== "CASTIGAT" && opportunity.pipelineStage !== "PIERDUT" && opportunity.workStatus !== "DONE"
}

export default function OpportunityLayout({ children }: OpportunityLayoutProps) {
  const params = useParams()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const isTechnician = userData?.role === "tehnician"

  const [opportunity, setOpportunity] = useState<CrmOpportunity | null>(null)
  const [client, setClient] = useState<CrmClient | null>(null)
  const [clientContacts, setClientContacts] = useState<Array<{ id: string; name: string; phone: string; email?: string }>>([])
  const [opportunityContactIds, setOpportunityContactIds] = useState<string[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [activeOpportunityCounts, setActiveOpportunityCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = { ALL: 0 }
    LEFT_FILTER_ITEMS.forEach((type) => {
      counts[type] = 0
    })
    return counts
  })
  const [loading, setLoading] = useState(true)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [isSavingTitle, setIsSavingTitle] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!opportunityId || !user?.uid) return

      setLoading(true)
      try {
        const opportunityRow = await getCrmOpportunityById(opportunityId, user.uid)
        if (!opportunityRow) {
          setOpportunity(null)
          setClient(null)
          setClientContacts([])
          setOpportunityContactIds([])
          return
        }

        const [clientRow, clientContactRows, opportunityContacts, userRows, opportunitiesForCounts] = await Promise.all([
          getCrmClientById(opportunityRow.clientId),
          listCrmClientContacts(opportunityRow.clientId),
          listCrmOpportunityContacts(opportunityId),
          listCrmUsers(),
          listCrmOpportunitiesForUser(user.uid, { type: "ALL" }),
        ])

        setOpportunity(opportunityRow)
        setClient(clientRow)
        setClientContacts(clientContactRows)
        setOpportunityContactIds(opportunityContacts.map((row) => row.contactId))
        setUserMap(
          userRows.reduce<Record<string, string>>((acc, crmUser) => {
            acc[crmUser.uid] = crmUser.displayName || crmUser.email || crmUser.uid
            return acc
          }, {})
        )
        const counts: Record<string, number> = { ALL: 0 }
        LEFT_FILTER_ITEMS.forEach((type) => {
          counts[type] = 0
        })
        opportunitiesForCounts.forEach((row) => {
          if (!isOpportunityActive(row)) return
          counts.ALL += 1
          if (counts[row.opportunityType] !== undefined) {
            counts[row.opportunityType] += 1
          }
        })
        setActiveOpportunityCounts(counts)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [opportunityId, user?.uid])

  useEffect(() => {
    setTitleDraft(opportunity?.title || "")
  }, [opportunity?.title])

  const tabs = useMemo(
    () => [
      { href: `/crm/opportunities/${opportunityId}/timeline`, label: "Istoric", icon: Timer },
      { href: `/crm/opportunities/${opportunityId}/tasks`, label: "Sarcini", icon: ClipboardCheck },
      { href: `/crm/opportunities/${opportunityId}/notes`, label: "Note", icon: MessageSquare },
      { href: `/crm/opportunities/${opportunityId}/interne`, label: "Interne", icon: MessageSquare },
      { href: `/crm/opportunities/${opportunityId}/files`, label: "Fișiere", icon: FileText },
      { href: `/crm/opportunities/${opportunityId}/emails`, label: "Email", icon: Mail },
      { href: `/crm/opportunities/${opportunityId}/calendar`, label: "Calendar", icon: CalendarDays },
    ],
    [opportunityId]
  )
  const leftTypeItems = useMemo(
    () =>
      LEFT_FILTER_ITEMS.map((item) => ({
        key: item,
        label: CRM_OPPORTUNITY_TYPE_LABELS[item],
        count: activeOpportunityCounts[item] || 0,
      })),
    [activeOpportunityCounts]
  )

  const handleTitleSave = async () => {
    if (isTechnician) return
    if (!opportunity || !user?.uid) return
    const nextTitle = titleDraft.trim()

    if (!nextTitle) {
      toast({
        title: "Titlu obligatoriu",
        description: "Titlul oportunității nu poate fi gol.",
        variant: "destructive",
      })
      return
    }

    if (nextTitle === opportunity.title) {
      setIsEditingTitle(false)
      return
    }

    setIsSavingTitle(true)
    try {
      const displayTitle = `${opportunity.code} - ${nextTitle}`
      await updateCrmOpportunity(opportunity.id, user.uid, {
        title: nextTitle,
        displayTitle,
      })
      setOpportunity((prev) => (prev ? { ...prev, title: nextTitle, displayTitle } : prev))
      setIsEditingTitle(false)
      toast({
        title: "Titlu actualizat",
        description: "Titlul oportunității a fost salvat.",
      })
    } catch {
      toast({
        title: "Eroare la salvare",
        description: "Nu am putut actualiza titlul oportunității.",
        variant: "destructive",
      })
    } finally {
      setIsSavingTitle(false)
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs text-neutral-500">Se încarcă oportunitatea...</div>
  }

  if (!opportunity) {
    return <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs text-neutral-500">Nu ai acces la această oportunitate sau nu există.</div>
  }

  const selectedContacts = clientContacts.filter((contact) => opportunityContactIds.includes(contact.id))
  const createdByLabel = userMap[opportunity.createdById] || opportunity.createdById || "-"
  const ownerLabel = userMap[opportunity.ownerId] || opportunity.ownerId || "-"
  const assignedViewerIds = Array.from(
    new Set(
      opportunity.readUserIds.filter(
        (userId) => userId && userId !== opportunity.ownerId && userId !== opportunity.createdById
      )
    )
  )
  const assignedViewerLabel =
    assignedViewerIds.length > 0
      ? assignedViewerIds.map((userId) => userMap[userId] || "Utilizator necunoscut").join(", ")
      : "-"
  const activeType = opportunity.opportunityType

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid flex-1 min-h-0 gap-3 xl:grid-cols-[260px_1fr_300px]">
        <div className="xl:h-full">
          <details className="xl:hidden rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-neutral-700">Filtre CRM</summary>
            <div className="space-y-2 border-t border-neutral-100 px-4 py-3">
              <Link
                href="/crm/opportunities"
                className={`flex h-8 w-full items-center rounded-md border-l-2 px-2.5 text-left text-sm transition ${
                  activeType === "ALL"
                    ? "border-l-[#3f7fc3] bg-[#dce9f8] font-medium text-[#1f4f84]"
                    : "border-l-transparent bg-white/70 text-[#4f6075] hover:bg-white hover:text-[#1f3553]"
                }`}
              >
                Acasa
              </Link>
              <p className="border-b border-[#d4e0f0] pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#486284]">Tip oportunitate</p>
              <div className="space-y-1">
                {leftTypeItems.map((item) => (
                  <Link
                    key={item.key}
                    href={`/crm/opportunities?type=${item.key}`}
                    className={`flex h-8 items-center justify-between rounded-md border-l-2 px-2.5 text-sm transition ${
                      activeType === item.key
                        ? "border-l-[#3f7fc3] bg-[#dce9f8] font-medium text-[#1f4f84]"
                        : "border-l-transparent bg-white/70 text-[#4f6075] hover:bg-white hover:text-[#1f3553]"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="text-xs">{item.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          </details>
          <Panel
            className="hidden rounded-md border-[#d4e0f0] bg-[#eef3fa] shadow-none xl:block xl:h-full xl:rounded-none xl:border-y-0 xl:border-l-0 xl:border-r xl:border-[#ccd9ea]"
            contentClassName="flex h-full min-h-0 flex-col pt-3"
          >
            <Link
              href="/crm/opportunities"
              className={`mb-2 flex h-8 w-full items-center rounded-md border-l-2 px-2.5 text-left text-sm transition ${
                activeType === "ALL"
                  ? "border-l-[#3f7fc3] bg-[#dce9f8] font-medium text-[#1f4f84]"
                  : "border-l-transparent bg-white/70 text-[#4f6075] hover:bg-white hover:text-[#1f3553]"
              }`}
            >
              Acasa
            </Link>
            <div className="mb-2 mt-1 border-b border-[#d4e0f0] pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#486284]">Tip oportunitate</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              {leftTypeItems.map((item) => (
                <Link
                  key={item.key}
                  href={`/crm/opportunities?type=${item.key}`}
                  className={`flex min-h-8 flex-1 items-center justify-between gap-2 rounded-md border-l-2 px-2.5 text-left text-sm transition ${
                    activeType === item.key
                      ? "border-l-[#3f7fc3] bg-[#dce9f8] font-medium text-[#1f4f84]"
                      : "border-l-transparent bg-white/70 text-[#4f6075] hover:bg-white hover:text-[#1f3553]"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 text-xs">{item.count}</span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>

        <section className="min-h-0 space-y-3">
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-[280px] flex-1">
                {!isTechnician && isEditingTitle ? (
                  <Input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void handleTitleSave()
                      }
                      if (event.key === "Escape") {
                        event.preventDefault()
                        setTitleDraft(opportunity.title)
                        setIsEditingTitle(false)
                      }
                    }}
                    placeholder="Titlu oportunitate"
                    disabled={isSavingTitle}
                    className="h-9 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium text-neutral-900">{opportunity.displayTitle}</p>
                )}
              </div>
              {!isTechnician ? (
                <div className="flex items-center gap-1">
                  {isEditingTitle ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setTitleDraft(opportunity.title)
                          setIsEditingTitle(false)
                        }}
                        disabled={isSavingTitle}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => void handleTitleSave()}
                        disabled={isSavingTitle}
                      >
                        {isSavingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setIsEditingTitle(true)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Editează titlu
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {stageLabel(opportunity.pipelineStage)} • {priorityLabel(opportunity.priority)} • {workStatusLabel(opportunity.workStatus)}
            </p>
          </div>
          <TabsHeader items={tabs} />
          <div>{children}</div>
        </section>

        <div className="xl:h-full">
          <details className="xl:hidden rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-neutral-700">Client & contacte</summary>
            <div className="space-y-4 border-t border-neutral-100 px-4 py-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="text-sm font-medium text-neutral-900">{client?.name || "-"}</p>
                <p className="mt-1 text-xs text-neutral-500">{client?.address || "Adresă indisponibilă"}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-700">Contacte</p>
                {selectedContacts.length === 0 ? (
                  <p className="text-xs text-neutral-500">Nu există contacte selectate.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedContacts.map((contact) => (
                      <div key={contact.id} className="rounded-lg border border-neutral-200 bg-white p-2">
                        <p className="text-xs font-medium text-neutral-800">{contact.name}</p>
                        <p className="text-xs text-neutral-500">{contact.phone}</p>
                        <p className="text-xs text-neutral-500">{contact.email || "-"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-700">Pipeline</p>
                <div className="space-y-2">
                  {CRM_PIPELINE_STAGES.map((stage) => (
                    <div key={stage} className="flex items-center gap-2 text-xs">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          opportunity.pipelineStage === stage ? "bg-blue-500" : "bg-neutral-300"
                        }`}
                      />
                      <span className={opportunity.pipelineStage === stage ? "text-neutral-900" : "text-neutral-500"}>
                        {CRM_PIPELINE_STAGE_LABELS[stage]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-700">Fields</p>
                <div className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                  <span className="text-neutral-500">Code</span>
                  <span className="text-neutral-800">{opportunity.code}</span>

                  <span className="text-neutral-500">Titlu</span>
                  <span className="text-neutral-800">{opportunity.title}</span>

                  <span className="text-neutral-500">Amount</span>
                  <span className="text-neutral-800">{typeof opportunity.amount === "number" ? `${opportunity.amount.toLocaleString("ro-RO")} RON` : "-"}</span>

                  <span className="text-neutral-500">Close date</span>
                  <span className="text-neutral-800">{formatDateTime(opportunity.closeDate)}</span>

                  <span className="text-neutral-500">Created by</span>
                  <span className="text-neutral-800">{createdByLabel}</span>

                  <span className="text-neutral-500">Owner</span>
                  <span className="text-neutral-800">{ownerLabel}</span>

                  <span className="text-neutral-500">Asignați (view)</span>
                  <span className="text-neutral-800">{assignedViewerLabel}</span>

                  <span className="text-neutral-500">Stage</span>
                  <span className="text-neutral-800">{stageLabel(opportunity.pipelineStage)}</span>

                  <span className="text-neutral-500">Prioritate</span>
                  <span className="text-neutral-800">{priorityLabel(opportunity.priority)}</span>

                  <span className="text-neutral-500">Status</span>
                  <span className="text-neutral-800">{workStatusLabel(opportunity.workStatus)}</span>

                  <span className="text-neutral-500">Last update</span>
                  <span className="text-neutral-800">{formatDateTime(opportunity.updatedAt)}</span>
                </div>
              </div>
            </div>
          </details>
          <Panel
            title="Client"
            className="hidden bg-[#f3f4f6] shadow-none xl:block xl:h-full xl:rounded-none xl:border-y-0 xl:border-r-0 xl:border-l xl:border-neutral-300"
            contentClassName="space-y-4"
          >
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <p className="text-sm font-medium text-neutral-900">{client?.name || "-"}</p>
              <p className="mt-1 text-xs text-neutral-500">{client?.address || "Adresă indisponibilă"}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-neutral-700">Contacte</p>
              {selectedContacts.length === 0 ? (
                <p className="text-xs text-neutral-500">Nu există contacte selectate.</p>
              ) : (
                <div className="space-y-2">
                  {selectedContacts.map((contact) => (
                    <div key={contact.id} className="rounded-lg border border-neutral-200 bg-white p-2">
                      <p className="text-xs font-medium text-neutral-800">{contact.name}</p>
                      <p className="text-xs text-neutral-500">{contact.phone}</p>
                      <p className="text-xs text-neutral-500">{contact.email || "-"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-neutral-700">Pipeline</p>
              <div className="space-y-2">
                {CRM_PIPELINE_STAGES.map((stage) => (
                  <div key={stage} className="flex items-center gap-2 text-xs">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        opportunity.pipelineStage === stage ? "bg-blue-500" : "bg-neutral-300"
                      }`}
                    />
                    <span className={opportunity.pipelineStage === stage ? "text-neutral-900" : "text-neutral-500"}>
                      {CRM_PIPELINE_STAGE_LABELS[stage]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-neutral-300 pt-3">
              <p className="mb-2 text-xs font-medium text-neutral-700">Fields</p>
              <div className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                <span className="text-neutral-500">Code</span>
                <span className="text-neutral-800">{opportunity.code}</span>

                <span className="text-neutral-500">Titlu</span>
                <span className="text-neutral-800">{opportunity.title}</span>

                <span className="text-neutral-500">Amount</span>
                <span className="text-neutral-800">{typeof opportunity.amount === "number" ? `${opportunity.amount.toLocaleString("ro-RO")} RON` : "-"}</span>

                <span className="text-neutral-500">Close date</span>
                <span className="text-neutral-800">{formatDateTime(opportunity.closeDate)}</span>

                <span className="text-neutral-500">Created by</span>
                <span className="text-neutral-800">{createdByLabel}</span>

                <span className="text-neutral-500">Owner</span>
                <span className="text-neutral-800">{ownerLabel}</span>

                <span className="text-neutral-500">Asignați (view)</span>
                <span className="text-neutral-800">{assignedViewerLabel}</span>

                <span className="text-neutral-500">Stage</span>
                <span className="text-neutral-800">{stageLabel(opportunity.pipelineStage)}</span>

                <span className="text-neutral-500">Prioritate</span>
                <span className="text-neutral-800">{priorityLabel(opportunity.priority)}</span>

                <span className="text-neutral-500">Status</span>
                <span className="text-neutral-800">{workStatusLabel(opportunity.workStatus)}</span>

                <span className="text-neutral-500">Last update</span>
                <span className="text-neutral-800">{formatDateTime(opportunity.updatedAt)}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
