"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { CalendarDays, Check, ClipboardCheck, FileText, Loader2, Mail, MessageSquare, Pencil, Timer, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { OpportunityTypeSidebar, Panel, TabsHeader } from "@/components/crm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import type { CrmClient, CrmClientContact, CrmOpportunity } from "@/lib/crm/types"
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
  const [clientContacts, setClientContacts] = useState<CrmClientContact[]>([])
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
  const [selectedContactForDialog, setSelectedContactForDialog] = useState<CrmClientContact | null>(null)

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
    return <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">Se încarcă oportunitatea...</div>
  }

  if (!opportunity) {
    return <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">Nu ai acces la această oportunitate sau nu există.</div>
  }

  const selectedContacts = clientContacts.filter((contact) => opportunityContactIds.includes(contact.id))
  const effectivePrimaryContactId = opportunity.primaryContactId || selectedContacts[0]?.id || ""
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
  const sidebarHomeItem = {
    key: "ALL",
    label: "Acasa",
    active: false,
    href: "/crm/opportunities",
    title: "Acasa",
  }
  const sidebarItems = leftTypeItems.map((item) => ({
    ...item,
    active: activeType === item.key,
    href: `/crm/opportunities?type=${item.key}`,
    title: item.label,
  }))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[260px_1fr_300px]">
        <div className="min-h-0 xl:h-full">
          <OpportunityTypeSidebar homeItem={sidebarHomeItem} items={sidebarItems} collapsibleOnMobile />
        </div>

        <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                    className="h-11 text-base font-semibold"
                  />
                ) : (
                  <p className="text-lg font-semibold text-neutral-900">{opportunity.displayTitle}</p>
                )}
              </div>
              {!isTechnician ? (
                <div className="flex items-center gap-2">
                  {isEditingTitle ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-sm"
                        onClick={() => {
                          setTitleDraft(opportunity.title)
                          setIsEditingTitle(false)
                        }}
                        disabled={isSavingTitle}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-3 text-sm"
                        onClick={() => void handleTitleSave()}
                        disabled={isSavingTitle}
                      >
                        {isSavingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 text-sm"
                      onClick={() => setIsEditingTitle(true)}
                    >
                      <Pencil className="mr-1.5 h-4 w-4" />
                      Editează titlu
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm text-neutral-500">
              {stageLabel(opportunity.pipelineStage)} • {priorityLabel(opportunity.priority)} • {workStatusLabel(opportunity.workStatus)}
            </p>
          </div>
          <TabsHeader items={tabs} />
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </section>

        <div className="min-h-0 xl:h-full xl:overflow-hidden">
          <details className="xl:hidden rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-neutral-700">Client & contacte</summary>
            <div className="space-y-5 border-t border-neutral-100 px-5 py-4">
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="text-base font-semibold text-neutral-900">{client?.name || "-"}</p>
                <p className="mt-1 text-sm text-neutral-500">{client?.address || "Adresă indisponibilă"}</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">Contacte</p>
                {selectedContacts.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nu există contacte selectate.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedContacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:bg-neutral-50"
                        onClick={() => setSelectedContactForDialog(contact)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-neutral-800">{contact.name}</p>
                          {effectivePrimaryContactId === contact.id ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">Pipeline</p>
                <div className="space-y-2">
                  {CRM_PIPELINE_STAGES.map((stage) => (
                    <div key={stage} className="flex items-center gap-2 text-sm">
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
                <p className="mb-2 text-sm font-medium text-neutral-700">Fields</p>
                <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
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
            size="comfortable"
            className="hidden overflow-hidden bg-[#f3f4f6] shadow-none xl:flex xl:h-full xl:flex-col xl:rounded-none xl:border-y-0 xl:border-r-0 xl:border-l xl:border-neutral-300"
            contentClassName="min-h-0 flex-1 space-y-5 overflow-y-auto"
          >
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <p className="text-base font-semibold text-neutral-900">{client?.name || "-"}</p>
              <p className="mt-1 text-sm text-neutral-500">{client?.address || "Adresă indisponibilă"}</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Contacte</p>
              {selectedContacts.length === 0 ? (
                <p className="text-sm text-neutral-500">Nu există contacte selectate.</p>
              ) : (
                <div className="space-y-2">
                  {selectedContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:bg-neutral-50"
                      onClick={() => setSelectedContactForDialog(contact)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-neutral-800">{contact.name}</p>
                        {effectivePrimaryContactId === contact.id ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Pipeline</p>
              <div className="space-y-2">
                {CRM_PIPELINE_STAGES.map((stage) => (
                  <div key={stage} className="flex items-center gap-2 text-sm">
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

            <div className="border-t border-neutral-300 pt-4">
              <p className="mb-2 text-sm font-medium text-neutral-700">Fields</p>
              <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
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
      <Dialog open={!!selectedContactForDialog} onOpenChange={(open) => !open && setSelectedContactForDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalii contact</DialogTitle>
          </DialogHeader>
          {selectedContactForDialog ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-neutral-900">{selectedContactForDialog.name || "-"}</p>
                {effectivePrimaryContactId === selectedContactForDialog.id ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-neutral-500">Locație</span>
                <span className="text-neutral-800">{selectedContactForDialog.locationName || "-"}</span>
                <span className="text-neutral-500">Telefon</span>
                <span className="text-neutral-800">{selectedContactForDialog.phone || "-"}</span>
                <span className="text-neutral-500">Email</span>
                <span className="break-all text-neutral-800">{selectedContactForDialog.email || "-"}</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
