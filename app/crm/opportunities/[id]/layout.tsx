"use client"

import { useEffect, useMemo, useState } from "react"
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
  listCrmOpportunityContacts,
  listCrmUsers,
} from "@/lib/crm/opportunities"
import { formatDateTime, priorityLabel, stageLabel, workStatusLabel } from "@/lib/crm/presenters"
import { CRM_PIPELINE_STAGES, CRM_PIPELINE_STAGE_LABELS } from "@/lib/crm/constants"
import type { CrmClient, CrmOpportunity } from "@/lib/crm/types"
import { updateCrmOpportunity } from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"

interface OpportunityLayoutProps {
  children: import("react").ReactNode
}

export default function OpportunityLayout({ children }: OpportunityLayoutProps) {
  const params = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")

  const [opportunity, setOpportunity] = useState<CrmOpportunity | null>(null)
  const [client, setClient] = useState<CrmClient | null>(null)
  const [clientContacts, setClientContacts] = useState<Array<{ id: string; name: string; phone: string; email?: string }>>([])
  const [opportunityContactIds, setOpportunityContactIds] = useState<string[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
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

        const [clientRow, clientContactRows, opportunityContacts, userRows] = await Promise.all([
          getCrmClientById(opportunityRow.clientId),
          listCrmClientContacts(opportunityRow.clientId),
          listCrmOpportunityContacts(opportunityId),
          listCrmUsers(),
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
      { href: `/crm/opportunities/${opportunityId}/tasks`, label: "Taskuri", icon: ClipboardCheck },
      { href: `/crm/opportunities/${opportunityId}/notes`, label: "Note", icon: MessageSquare },
      { href: `/crm/opportunities/${opportunityId}/files`, label: "Fișiere", icon: FileText },
      { href: `/crm/opportunities/${opportunityId}/emails`, label: "Email", icon: Mail },
      { href: `/crm/opportunities/${opportunityId}/calendar`, label: "Calendar", icon: CalendarDays },
    ],
    [opportunityId]
  )

  const handleTitleSave = async () => {
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

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr_300px]">
      <div>
        <details className="xl:hidden rounded-xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-neutral-700">Fields</summary>
          <div className="border-t border-neutral-100 px-4 py-3">
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
        </details>
        <Panel title="Fields" className="hidden bg-neutral-50 xl:block" contentClassName="space-y-2">
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

            <span className="text-neutral-500">Stage</span>
            <span className="text-neutral-800">{stageLabel(opportunity.pipelineStage)}</span>

            <span className="text-neutral-500">Prioritate</span>
            <span className="text-neutral-800">{priorityLabel(opportunity.priority)}</span>

            <span className="text-neutral-500">Status</span>
            <span className="text-neutral-800">{workStatusLabel(opportunity.workStatus)}</span>

            <span className="text-neutral-500">Last update</span>
            <span className="text-neutral-800">{formatDateTime(opportunity.updatedAt)}</span>
          </div>
        </Panel>
      </div>

      <section className="space-y-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-[280px] flex-1">
              {isEditingTitle ? (
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
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {stageLabel(opportunity.pipelineStage)} • {priorityLabel(opportunity.priority)} • {workStatusLabel(opportunity.workStatus)}
          </p>
        </div>
        <TabsHeader items={tabs} />
        <div>{children}</div>
      </section>

      <div>
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
          </div>
        </details>
        <Panel title="Client" className="hidden bg-neutral-50 xl:block" contentClassName="space-y-4">
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
        </Panel>
      </div>
    </div>
  )
}
