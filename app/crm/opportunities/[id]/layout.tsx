"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CalendarDays, Check, ClipboardCheck, FileText, Loader2, Mail, MessageSquare, Pencil, Timer, Trash2, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { OpportunityTypeSidebar, Panel, TabsHeader } from "@/components/crm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
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
  CRM_OPPORTUNITY_SELECTABLE_TYPES,
  CRM_OPPORTUNITY_TYPE_LABELS,
  isTerminalPipelineStageForOpportunityType,
} from "@/lib/crm/constants"
import type { CrmClient, CrmClientContact, CrmOpportunity } from "@/lib/crm/types"
import { updateCrmOpportunity } from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

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

export default function OpportunityLayout({ children }: OpportunityLayoutProps) {
  const params = useParams()
  const router = useRouter()
  const { user, userData } = useAuth()
  const { toast } = useToast()
  const opportunityId = String(params?.id || "")
  const isTechnician = userData?.role === "tehnician"
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
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [selectedContactForDialog, setSelectedContactForDialog] = useState<CrmClientContact | null>(null)
  const [isDeletingOpportunity, setIsDeletingOpportunity] = useState(false)

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

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="grid flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[260px_1fr_300px]">
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[260px_1fr_300px]">
        <div className="min-h-0 xl:h-full">
          <OpportunityTypeSidebar homeItem={sidebarHomeItem} items={sidebarItems} collapsibleOnMobile />
        </div>

        <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
          <div
            className={cn(
              "mt-1 rounded-xl border px-5 py-4",
              PRIORITY_HEADER_STYLES[opportunity.priority]
            )}
          >
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
            <p className={cn("mt-1.5 text-sm", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
              {stageLabel(opportunity.pipelineStage)} • {priorityLabel(opportunity.priority)} • {workStatusLabel(opportunity.workStatus)}
            </p>
          </div>
          <TabsHeader items={tabs} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </section>

        <div className="min-h-0 xl:h-full xl:overflow-hidden">
          <details className="xl:hidden rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-neutral-700">Context CRM</summary>
            <div className="space-y-5 border-t border-neutral-100 px-5 py-4">
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
                      <p className="text-sm font-semibold text-neutral-900">{primaryContact.name}</p>
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
                        </div>
                        <p className="mt-1 text-xs text-neutral-600">{contact.locationName || "Fără locație"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
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

              <div>
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
          </details>
          <Panel
            title="Context CRM"
            size="comfortable"
            className="hidden overflow-hidden bg-[#f3f4f6] shadow-none xl:flex xl:h-full xl:flex-col xl:rounded-none xl:border-y-0 xl:border-r-0 xl:border-l xl:border-neutral-300"
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
                    <p className="text-sm font-semibold text-neutral-900">{primaryContact.name}</p>
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
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">{contact.locationName || "Fără locație"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
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
