"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CalendarDays, ClipboardCheck, FileText, Loader2, Mail, MessageSquare, PanelLeft, PanelRight, Timer, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { MobileRailSheet, OpportunityTypeSidebar, Panel, TabsHeader } from "@/components/crm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  changeCrmOpportunityStage,
  updateCrmOpportunity,
  updateCrmClientContactLabel,
  getCrmClientById,
  deleteCrmOpportunity,
  getCrmOpportunityById,
  listCrmClientContacts,
  listCrmOpportunitiesForUser,
  listCrmOpportunityContacts,
  listCrmUsers,
} from "@/lib/crm/opportunities"
import { formatDateTime, priorityLabel, stageLabel, workStatusLabel } from "@/lib/crm/presenters"
import {
  CRM_PIPELINE_STAGE_LABELS,
  CRM_PRIORITIES,
  CRM_PRIORITY_LABELS,
  CRM_WORK_STATUSES,
  CRM_WORK_STATUS_LABELS,
  getPipelineStagesForOpportunityType,
  isLostPipelineStage,
  CRM_OPPORTUNITY_SELECTABLE_TYPES,
  CRM_OPPORTUNITY_TYPE_LABELS,
  isTerminalPipelineStageForOpportunityType,
} from "@/lib/crm/constants"
import type { CrmClient, CrmClientContact, CrmOpportunity } from "@/lib/crm/types"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { CreateOpportunityDialog } from "@/components/crm/create-opportunity-dialog"

interface OpportunityLayoutProps {
  children: import("react").ReactNode
}

const LEFT_FILTER_ITEMS = CRM_OPPORTUNITY_SELECTABLE_TYPES

function isOpportunityActive(opportunity: CrmOpportunity) {
  return !isTerminalPipelineStageForOpportunityType(opportunity.opportunityType, opportunity.pipelineStage) && opportunity.workStatus !== "DONE"
}

const PRIORITY_HEADER_STYLES: Record<CrmOpportunity["priority"], string> = {
  LOW: "bg-white border-neutral-200",
  MEDIUM: "bg-sky-50/70 border-sky-200/80",
  HIGH: "bg-amber-50/70 border-amber-200/80",
  URGENT: "bg-rose-50/70 border-rose-200/80",
}

const PRIORITY_SUBTEXT_STYLES: Record<CrmOpportunity["priority"], string> = {
  LOW: "text-neutral-500",
  MEDIUM: "text-sky-700/80",
  HIGH: "text-amber-700/80",
  URGENT: "text-rose-700/80",
}

const CRM_ACTIVITY_REFRESH_EVENT = "crm:activity-refresh"

export default function OpportunityLayout({ children }: OpportunityLayoutProps) {
  const params = useParams()
  const router = useRouter()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const isAdmin = userData?.role === "admin"

  const [opportunity, setOpportunity] = useState<CrmOpportunity | null>(null)
  const [client, setClient] = useState<CrmClient | null>(null)
  const [clientContacts, setClientContacts] = useState<CrmClientContact[]>([])
  const [opportunityContactIds, setOpportunityContactIds] = useState<string[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [accessibleOpportunities, setAccessibleOpportunities] = useState<CrmOpportunity[]>([])
  const [activeOpportunityCounts, setActiveOpportunityCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = { ALL: 0 }
    LEFT_FILTER_ITEMS.forEach((type) => {
      counts[type] = 0
    })
    return counts
  })
  const [loading, setLoading] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedContactForDialog, setSelectedContactForDialog] = useState<CrmClientContact | null>(null)
  const [isDeletingOpportunity, setIsDeletingOpportunity] = useState(false)
  const [savingField, setSavingField] = useState<"pipelineStage" | "priority" | "workStatus" | null>(null)
  const [savingPrimaryContactId, setSavingPrimaryContactId] = useState<string | null>(null)
  const [savingContactLabelId, setSavingContactLabelId] = useState<string | null>(null)

  const loadOpportunityData = useCallback(async () => {
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
      setAccessibleOpportunities(opportunitiesForCounts)
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
  }, [opportunityId, user?.uid])

  useEffect(() => {
    void loadOpportunityData()
  }, [loadOpportunityData])

  const tabs = useMemo(
    () => [
      { href: `/crm/opportunities/${opportunityId}/timeline`, label: "Istoric", icon: Timer },
      { href: `/crm/opportunities/${opportunityId}/tasks`, label: "Sarcini", icon: ClipboardCheck },
      { href: `/crm/opportunities/${opportunityId}/notes`, label: "Note", icon: MessageSquare },
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

  const handleOpportunityDelete = async () => {
    if (!isAdmin) return
    if (!opportunity || !user?.uid) return

    const confirmed = window.confirm(
      `Sigur vrei să ștergi definitiv oportunitatea ${opportunity.code}? Acțiunea nu poate fi anulată.`
    )
    if (!confirmed) return

    setIsDeletingOpportunity(true)
    try {
      await deleteCrmOpportunity({
        opportunityId: opportunity.id,
        actorId: user.uid,
      })
      toast({
        title: "Oportunitate ștearsă",
        description: "Oportunitatea a fost eliminată definitiv.",
      })
      router.push("/crm/opportunities")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nu am putut șterge oportunitatea."
      toast({
        title: "Eroare la ștergere",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsDeletingOpportunity(false)
    }
  }

  const copyTextToClipboard = async (value: string, successLabel: string) => {
    const text = value.trim()
    if (!text) {
      toast({
        title: "Nu există date",
        description: `Nu există ${successLabel.toLowerCase()} disponibil.`,
        variant: "destructive",
      })
      return
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        throw new Error("Clipboard API indisponibil")
      }
      toast({
        title: "Copiat",
        description: `${successLabel} a fost copiat.`,
      })
    } catch {
      toast({
        title: "Copiere eșuată",
        description: "Nu am putut copia în clipboard.",
        variant: "destructive",
      })
    }
  }

  const openRelatedOpportunityCreate = () => {
    const nextSearch = new URLSearchParams({
      type: opportunity.opportunityType,
      clientId: opportunity.clientId,
      create: "1",
    })
    router.push(`/crm/opportunities?${nextSearch.toString()}`)
    toast({
      title: "Oportunitate nouă",
      description: "Dialogul de creare a fost deschis cu clientul preselectat.",
    })
  }

  const refreshActivityTimeline = () => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent(CRM_ACTIVITY_REFRESH_EVENT, { detail: { opportunityId } }))
  }

  const handlePriorityChange = async (nextPriority: CrmOpportunity["priority"]) => {
    if (!opportunity || !user?.uid || nextPriority === opportunity.priority) return
    setSavingField("priority")
    try {
      await updateCrmOpportunity(opportunity.id, user.uid, { priority: nextPriority })
      await loadOpportunityData()
      refreshActivityTimeline()
      toast({
        title: "Prioritate actualizată",
        description: "Prioritatea oportunității a fost salvată.",
      })
    } catch (error) {
      toast({
        title: "Eroare la actualizare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza prioritatea.",
        variant: "destructive",
      })
    } finally {
      setSavingField(null)
    }
  }

  const handleWorkStatusChange = async (nextStatus: CrmOpportunity["workStatus"]) => {
    if (!opportunity || !user?.uid || nextStatus === opportunity.workStatus) return
    setSavingField("workStatus")
    try {
      await updateCrmOpportunity(opportunity.id, user.uid, { workStatus: nextStatus })
      await loadOpportunityData()
      refreshActivityTimeline()
      toast({
        title: "Status lucru actualizat",
        description: "Statusul de lucru a fost salvat.",
      })
    } catch (error) {
      toast({
        title: "Eroare la actualizare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza statusul de lucru.",
        variant: "destructive",
      })
    } finally {
      setSavingField(null)
    }
  }

  const handlePipelineStageChange = async (nextStage: string) => {
    if (!opportunity || !user?.uid || nextStage === opportunity.pipelineStage) return
    let lostReason: string | undefined

    if (isLostPipelineStage(nextStage)) {
      const reason = window.prompt("Introdu motivul pierderii oportunității:")
      if (reason === null) return
      const normalizedReason = reason.trim()
      if (!normalizedReason) {
        toast({
          title: "Motiv obligatoriu",
          description: "Pentru statusul selectat trebuie completat motivul pierderii.",
          variant: "destructive",
        })
        return
      }
      lostReason = normalizedReason
    }

    setSavingField("pipelineStage")
    try {
      await changeCrmOpportunityStage({
        opportunityId: opportunity.id,
        actorId: user.uid,
        toStage: nextStage,
        lostReason,
      })
      await loadOpportunityData()
      refreshActivityTimeline()
      toast({
        title: "Status oportunitate actualizat",
        description: "Statusul din pipeline a fost salvat.",
      })
    } catch (error) {
      toast({
        title: "Eroare la actualizare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza statusul oportunității.",
        variant: "destructive",
      })
    } finally {
      setSavingField(null)
    }
  }

  const handlePrimaryContactChange = async (nextContactId: string) => {
    if (!opportunity || !user?.uid || nextContactId === (opportunity.primaryContactId || "")) return
    setSavingPrimaryContactId(nextContactId)
    try {
      await updateCrmOpportunity(opportunity.id, user.uid, { primaryContactId: nextContactId })
      await loadOpportunityData()
      refreshActivityTimeline()
      toast({
        title: "Contact principal actualizat",
        description: "Contactul principal al oportunității a fost schimbat.",
      })
    } catch (error) {
      toast({
        title: "Eroare la actualizare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza contactul principal.",
        variant: "destructive",
      })
    } finally {
      setSavingPrimaryContactId(null)
    }
  }

  const handleContactLabelEdit = async (contact: CrmClientContact) => {
    if (!client?.id) return
    const nextLabelRaw = window.prompt("Etichetă contact (gol pentru ștergere):", contact.label || "")
    if (nextLabelRaw === null) return
    const nextLabel = nextLabelRaw.trim()

    setSavingContactLabelId(contact.id)
    try {
      await updateCrmClientContactLabel({
        clientId: client.id,
        contactId: contact.id,
        label: nextLabel || undefined,
      })
      await loadOpportunityData()
      toast({
        title: "Etichetă actualizată",
        description: nextLabel
          ? `Eticheta contactului a fost setată la "${nextLabel}".`
          : "Eticheta contactului a fost ștearsă.",
      })
    } catch (error) {
      toast({
        title: "Eroare la salvare",
        description: error instanceof Error ? error.message : "Nu am putut salva eticheta contactului.",
        variant: "destructive",
      })
    } finally {
      setSavingContactLabelId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="grid flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[260px_1fr_340px]">
          <div className="min-h-0 xl:h-full rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-5/6 rounded-lg" />
            <Skeleton className="h-8 w-4/6 rounded-lg" />
          </div>

          <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <div className="mt-1 rounded-xl border border-neutral-200 bg-white px-5 py-4">
              <Skeleton className="h-7 w-3/5" />
              <Skeleton className="mt-2 h-4 w-2/5" />
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>
            <div className="min-h-0 flex-1 rounded-xl border border-neutral-200 bg-white p-5 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          </section>

          <div className="min-h-0 xl:h-full rounded-xl border border-neutral-200 bg-[#f3f4f6] p-4 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (!opportunity) {
    return <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">Nu ai acces la această oportunitate sau nu există.</div>
  }

  const selectedContacts = clientContacts.filter((contact) => opportunityContactIds.includes(contact.id))
  const contextContacts = selectedContacts.length > 0 ? selectedContacts : clientContacts
  const effectivePrimaryContactId = opportunity.primaryContactId || selectedContacts[0]?.id || ""
  const primaryContact =
    contextContacts.find((contact) => contact.id === effectivePrimaryContactId) ||
    contextContacts[0] ||
    null
  const secondaryContacts = contextContacts.filter((contact) => contact.id !== primaryContact?.id)
  const relatedOpportunities = accessibleOpportunities
    .filter((row) => row.clientId === opportunity.clientId && row.id !== opportunity.id)
    .slice(0, 8)
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
  const pipelineStageOptions = getPipelineStagesForOpportunityType(opportunity.opportunityType)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[260px_1fr_340px]">
        <div className="hidden min-h-0 xl:block xl:h-full">
          <OpportunityTypeSidebar homeItem={sidebarHomeItem} items={sidebarItems} />
        </div>

        <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
          <div className="mt-1 flex items-center gap-2 xl:hidden">
            <MobileRailSheet side="left" title="Tip oportunitate" triggerLabel="Filtre" triggerIcon={PanelLeft} className="border-r-2 border-[#004b87] bg-[#005599]">
              {({ close }) => (
                <OpportunityTypeSidebar
                  homeItem={sidebarHomeItem}
                  items={sidebarItems}
                  renderMode="content"
                  onItemSelect={close}
                  contentClassName="pt-1"
                />
              )}
            </MobileRailSheet>
            <MobileRailSheet side="right" title="Context CRM" triggerLabel="Context" triggerIcon={PanelRight} className="bg-[#f3f4f6]">
              <div className="space-y-5">
                <div className="rounded-lg border border-neutral-200 bg-white p-3">
                  <p className="text-base font-semibold text-neutral-900">{client?.name || "-"}</p>
                  <p className="mt-1 text-sm text-neutral-500">{client?.address || "Adresă indisponibilă"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{client?.type || "Client"}</Badge>
                    <Badge variant="outline">{contextContacts.length} contacte</Badge>
                    <Badge variant="outline">{relatedOpportunities.length} oportunități conexe</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => router.push(`/dashboard/clienti/${client?.id || ""}`)} disabled={!client?.id}>
                      Deschide client
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void copyTextToClipboard(client?.name || "", "Numele clientului")}>
                      Copiază nume
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void copyTextToClipboard(client?.address || "", "Adresa clientului")}>
                      Copiază adresă
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-700">Contact principal</p>
                  {primaryContact ? (
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-left"
                      onClick={() => setSelectedContactForDialog(primaryContact)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setSelectedContactForDialog(primaryContact)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-900">{primaryContact.name}</p>
                          {primaryContact.label ? (
                            <Badge variant="secondary" className="mt-1 text-[10px]">{primaryContact.label}</Badge>
                          ) : null}
                        </div>
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge>
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">{primaryContact.locationName || "Fără locație"}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-700">
                        {primaryContact.phone ? (
                          <a href={`tel:${primaryContact.phone}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                            {primaryContact.phone}
                          </a>
                        ) : (
                          <span>-</span>
                        )}
                        {primaryContact.email ? (
                          <a href={`mailto:${primaryContact.email}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                            {primaryContact.email}
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={savingContactLabelId === primaryContact.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleContactLabelEdit(primaryContact)
                          }}
                        >
                          {savingContactLabelId === primaryContact.id ? "Se salvează..." : "Editează etichetă"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(primaryContact.phone || "", "Telefonul contactului") }}>
                          Copiază telefon
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(primaryContact.email || "", "Emailul contactului") }}>
                          Copiază email
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">Nu există contact principal disponibil.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-700">Contacte secundare</p>
                  {secondaryContacts.length === 0 ? (
                    <p className="text-sm text-neutral-500">Nu există contacte secundare.</p>
                  ) : (
                    <div className="space-y-2">
                      {secondaryContacts.map((contact) => (
                        <div
                          key={contact.id}
                          role="button"
                          tabIndex={0}
                          className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:bg-neutral-50"
                          onClick={() => setSelectedContactForDialog(contact)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              setSelectedContactForDialog(contact)
                            }
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-neutral-800">{contact.name}</p>
                            {contact.label ? <Badge variant="secondary" className="text-[10px]">{contact.label}</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-neutral-600">{contact.locationName || "Fără locație"}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={savingPrimaryContactId === contact.id}
                              onClick={(event) => {
                                event.stopPropagation()
                                void handlePrimaryContactChange(contact.id)
                              }}
                            >
                              {savingPrimaryContactId === contact.id ? "Se setează..." : "Setează principal"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={savingContactLabelId === contact.id}
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleContactLabelEdit(contact)
                              }}
                            >
                              {savingContactLabelId === contact.id ? "Se salvează..." : "Editează etichetă"}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(contact.phone || "", "Telefonul contactului") }}>
                              Copiază telefon
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(contact.email || "", "Emailul contactului") }}>
                              Copiază email
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-neutral-300 pt-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-700">Oportunități conexe</p>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => router.push("/crm/opportunities")}>
                        Vezi toate
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={openRelatedOpportunityCreate}>
                        Oportunitate nouă
                      </Button>
                    </div>
                  </div>
                  {relatedOpportunities.length === 0 ? (
                    <p className="text-sm text-neutral-500">Nu există alte oportunități pentru acest client.</p>
                  ) : (
                    <div className="space-y-2">
                      {relatedOpportunities.map((related) => (
                        <button
                          key={related.id}
                          type="button"
                          onClick={() => router.push(`/crm/opportunities/${related.id}/timeline`)}
                          className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:bg-neutral-50"
                        >
                          <p className="text-sm font-medium text-neutral-800">{related.displayTitle || `${related.code} - ${related.title}`}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {stageLabel(related.pipelineStage)} • {priorityLabel(related.priority)} • {workStatusLabel(related.workStatus)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">Actualizat: {formatDateTime(related.updatedAt)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </MobileRailSheet>
          </div>
          <div
            className={cn(
              "mt-1 rounded-xl border px-5 py-4",
              PRIORITY_HEADER_STYLES[opportunity.priority]
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[280px] flex-1">
                <p className="text-lg font-semibold text-neutral-900">{opportunity.displayTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-9 text-sm"
                    onClick={() => void handleOpportunityDelete()}
                    disabled={isDeletingOpportunity}
                  >
                    {isDeletingOpportunity ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                    Șterge oportunitate
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-sm"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    Editează oportunitate
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <Select
                value={opportunity.pipelineStage}
                onValueChange={(value) => {
                  void handlePipelineStageChange(value)
                }}
                disabled={savingField !== null}
              >
                <SelectTrigger className={cn("h-8 min-w-[180px] bg-white/80", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
                  <SelectValue placeholder="Status oportunitate" />
                </SelectTrigger>
                <SelectContent>
                  {pipelineStageOptions.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CRM_PIPELINE_STAGE_LABELS[stage] || stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={opportunity.priority}
                onValueChange={(value) => {
                  void handlePriorityChange(value as CrmOpportunity["priority"])
                }}
                disabled={savingField !== null}
              >
                <SelectTrigger className={cn("h-8 min-w-[130px] bg-white/80", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
                  <SelectValue placeholder="Prioritate" />
                </SelectTrigger>
                <SelectContent>
                  {CRM_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {CRM_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={opportunity.workStatus}
                onValueChange={(value) => {
                  void handleWorkStatusChange(value as CrmOpportunity["workStatus"])
                }}
                disabled={savingField !== null}
              >
                <SelectTrigger className={cn("h-8 min-w-[130px] bg-white/80", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
                  <SelectValue placeholder="Status lucru" />
                </SelectTrigger>
                <SelectContent>
                  {CRM_WORK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CRM_WORK_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingField ? (
                <span className="inline-flex items-center text-xs text-neutral-600">
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Se salvează...
                </span>
              ) : null}
            </div>
          </div>
          <TabsHeader items={tabs} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </section>

        <div className="min-h-0 xl:h-full xl:overflow-hidden">
          <Panel
            title="Context CRM"
            size="comfortable"
            className="hidden overflow-hidden bg-[#f3f4f6] shadow-[0_16px_36px_rgba(15,23,42,0.24),0_4px_10px_rgba(15,23,42,0.15),inset_0_1px_0_rgba(255,255,255,0.78)] ring-1 ring-neutral-400/80 xl:flex xl:h-full xl:flex-col xl:rounded-none xl:border-y-0 xl:border-r-0 xl:border-l-2 xl:border-neutral-400"
            contentClassName="min-h-0 flex-1 space-y-5 overflow-y-auto"
          >
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <p className="text-base font-semibold text-neutral-900">{client?.name || "-"}</p>
              <p className="mt-1 text-sm text-neutral-500">{client?.address || "Adresă indisponibilă"}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{client?.type || "Client"}</Badge>
                <Badge variant="outline">{contextContacts.length} contacte</Badge>
                <Badge variant="outline">{relatedOpportunities.length} oportunități conexe</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => router.push(`/dashboard/clienti/${client?.id || ""}`)} disabled={!client?.id}>
                  Deschide client
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void copyTextToClipboard(client?.name || "", "Numele clientului")}>
                  Copiază nume
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void copyTextToClipboard(client?.address || "", "Adresa clientului")}>
                  Copiază adresă
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Contact principal</p>
              {primaryContact ? (
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-left"
                  onClick={() => setSelectedContactForDialog(primaryContact)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setSelectedContactForDialog(primaryContact)
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{primaryContact.name}</p>
                      {primaryContact.label ? (
                        <Badge variant="secondary" className="mt-1 text-[10px]">{primaryContact.label}</Badge>
                      ) : null}
                    </div>
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">{primaryContact.locationName || "Fără locație"}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-700">
                    {primaryContact.phone ? (
                      <a href={`tel:${primaryContact.phone}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                        {primaryContact.phone}
                      </a>
                    ) : (
                      <span>-</span>
                    )}
                    {primaryContact.email ? (
                      <a href={`mailto:${primaryContact.email}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                        {primaryContact.email}
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={savingContactLabelId === primaryContact.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleContactLabelEdit(primaryContact)
                      }}
                    >
                      {savingContactLabelId === primaryContact.id ? "Se salvează..." : "Editează etichetă"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(primaryContact.phone || "", "Telefonul contactului") }}>
                      Copiază telefon
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(primaryContact.email || "", "Emailul contactului") }}>
                      Copiază email
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Nu există contact principal disponibil.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Contacte secundare</p>
              {secondaryContacts.length === 0 ? (
                <p className="text-sm text-neutral-500">Nu există contacte secundare.</p>
              ) : (
                <div className="space-y-2">
                  {secondaryContacts.map((contact) => (
                    <div
                      key={contact.id}
                      role="button"
                      tabIndex={0}
                      className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:bg-neutral-50"
                      onClick={() => setSelectedContactForDialog(contact)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setSelectedContactForDialog(contact)
                        }
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-neutral-800">{contact.name}</p>
                        {contact.label ? <Badge variant="secondary" className="text-[10px]">{contact.label}</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">{contact.locationName || "Fără locație"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={savingPrimaryContactId === contact.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handlePrimaryContactChange(contact.id)
                          }}
                        >
                          {savingPrimaryContactId === contact.id ? "Se setează..." : "Setează principal"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={savingContactLabelId === contact.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleContactLabelEdit(contact)
                          }}
                        >
                          {savingContactLabelId === contact.id ? "Se salvează..." : "Editează etichetă"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(contact.phone || "", "Telefonul contactului") }}>
                          Copiază telefon
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void copyTextToClipboard(contact.email || "", "Emailul contactului") }}>
                          Copiază email
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-neutral-300 pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-700">Oportunități conexe</p>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => router.push("/crm/opportunities")}>
                    Vezi toate
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={openRelatedOpportunityCreate}>
                    Oportunitate nouă
                  </Button>
                </div>
              </div>
              {relatedOpportunities.length === 0 ? (
                <p className="text-sm text-neutral-500">Nu există alte oportunități pentru acest client.</p>
              ) : (
                <div className="space-y-2">
                  {relatedOpportunities.map((related) => (
                    <button
                      key={related.id}
                      type="button"
                      onClick={() => router.push(`/crm/opportunities/${related.id}/timeline`)}
                      className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:bg-neutral-50"
                    >
                      <p className="text-sm font-medium text-neutral-800">{related.displayTitle || `${related.code} - ${related.title}`}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {stageLabel(related.pipelineStage)} • {priorityLabel(related.priority)} • {workStatusLabel(related.workStatus)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">Actualizat: {formatDateTime(related.updatedAt)}</p>
                    </button>
                  ))}
                </div>
              )}
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
                <span className="text-neutral-500">Etichetă</span>
                <span className="text-neutral-800">{selectedContactForDialog.label || "-"}</span>
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
      <CreateOpportunityDialog
        actorId={user?.uid || ""}
        mode="edit"
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        hideTrigger
        initialOpportunity={opportunity}
        onSaved={async () => {
          await loadOpportunityData()
        }}
      />
    </div>
  )
}
