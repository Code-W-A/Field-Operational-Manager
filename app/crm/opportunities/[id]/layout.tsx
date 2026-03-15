"use client"

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react"
import { useParams, useRouter } from "next/navigation"
import { CalendarDays, ClipboardCheck, FileText, Loader2, Mail, Menu, MessageSquare, PanelLeft, PanelRight, Pencil, Phone, Star, Timer, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { MobileRailSheet, OpportunityTypeSidebar, Panel, TabsHeader } from "@/components/crm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  changeCrmOpportunityStage,
  updateCrmClientContactDetails,
  updateCrmOpportunity,
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
  normalizePipelineStageForOpportunityType,
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
  const [editingContact, setEditingContact] = useState<CrmClientContact | null>(null)
  const [contactEditDraft, setContactEditDraft] = useState({
    name: "",
    phone: "",
    email: "",
    functie: "",
  })
  const [isDeletingOpportunity, setIsDeletingOpportunity] = useState(false)
  const [savingField, setSavingField] = useState<"pipelineStage" | "priority" | "workStatus" | null>(null)
  const [savingPrimaryContactId, setSavingPrimaryContactId] = useState<string | null>(null)
  const [isSavingContactEdit, setIsSavingContactEdit] = useState(false)

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
    if (!opportunity) return
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

  const openContactEditDialog = (contact: CrmClientContact) => {
    setEditingContact(contact)
    setContactEditDraft({
      name: contact.name || "",
      phone: contact.phone || "",
      email: contact.email || "",
      functie: contact.functie || "",
    })
  }

  const handleContactEditSave = async () => {
    if (!client?.id || !editingContact) return

    const normalizedName = contactEditDraft.name.trim()
    const normalizedPhone = contactEditDraft.phone.trim()
    if (!normalizedName || !normalizedPhone) {
      toast({
        title: "Câmpuri obligatorii",
        description: "Completează numele și telefonul contactului.",
        variant: "destructive",
      })
      return
    }

    setIsSavingContactEdit(true)
    try {
      await updateCrmClientContactDetails({
        clientId: client.id,
        contactId: editingContact.id,
        name: normalizedName,
        phone: normalizedPhone,
        email: contactEditDraft.email.trim() || undefined,
        functie: contactEditDraft.functie.trim() || undefined,
      })
      await loadOpportunityData()
      setEditingContact(null)
      toast({
        title: "Contact actualizat",
        description: "Datele contactului au fost salvate în documentul clientului.",
      })
    } catch (error) {
      toast({
        title: "Eroare la salvare",
        description: error instanceof Error ? error.message : "Nu am putut actualiza contactul.",
        variant: "destructive",
      })
    } finally {
      setIsSavingContactEdit(false)
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
  const selectedPipelineStage = normalizePipelineStageForOpportunityType(
    opportunity.opportunityType,
    opportunity.pipelineStage
  )

  const renderContactActionButton = ({
    label,
    onClick,
    icon,
    disabled = false,
    hiddenColorClass,
    actionsAlwaysVisible,
    spinIcon = false,
  }: {
    label: string
    onClick: (event: MouseEvent<HTMLButtonElement>) => void
    icon: typeof Pencil
    disabled?: boolean
    hiddenColorClass: string
    actionsAlwaysVisible: boolean
    spinIcon?: boolean
  }) => {
    const Icon = icon
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0 transition-colors",
              actionsAlwaysVisible
                ? "text-neutral-500 hover:text-neutral-900"
                : `${hiddenColorClass} group-hover/contact:text-neutral-500 hover:text-neutral-700 focus-visible:text-neutral-700`,
              disabled ? "cursor-not-allowed opacity-70" : undefined
            )}
            disabled={disabled}
            aria-label={label}
            onClick={onClick}
          >
            <span className="sr-only">{label}</span>
            <Icon className={cn("h-3.5 w-3.5", spinIcon ? "animate-spin" : undefined)} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    )
  }

  const renderContactCard = ({
    contact,
    isPrimary,
    actionsAlwaysVisible,
  }: {
    contact: CrmClientContact
    isPrimary: boolean
    actionsAlwaysVisible: boolean
  }) => {
    const isSettingAsPrimary = !isPrimary && savingPrimaryContactId === contact.id
    const subtleActionColorClass = "text-neutral-400/35"
    return (
      <div
        key={contact.id}
        role="button"
        tabIndex={0}
        className={cn(
          "group/contact w-full rounded-lg p-3 text-left",
          isPrimary
            ? "border border-emerald-200 bg-emerald-50/60"
            : "border border-neutral-200 bg-white transition hover:bg-neutral-50"
        )}
        onClick={() => setSelectedContactForDialog(contact)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setSelectedContactForDialog(contact)
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("truncate text-sm", isPrimary ? "font-semibold text-neutral-900" : "font-medium text-neutral-800")}>
              {contact.name}
            </p>
          </div>
          {isPrimary ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge> : null}
        </div>
        <div className="mt-2 space-y-1 text-xs text-neutral-700">
          <p>{contact.locationName || "Fără locație"}</p>
          {contact.functie ? <p>{contact.functie}</p> : null}
          <p>
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                {contact.phone}
              </a>
            ) : (
              "-"
            )}
          </p>
          <p>
            {contact.email ? (
              <a href={`mailto:${contact.email}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                {contact.email}
              </a>
            ) : (
              "-"
            )}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!isPrimary
            ? renderContactActionButton({
                label: isSettingAsPrimary ? "Se setează..." : "Setează principal",
                icon: isSettingAsPrimary ? Loader2 : Star,
                disabled: isSettingAsPrimary,
                hiddenColorClass: subtleActionColorClass,
                actionsAlwaysVisible,
                spinIcon: isSettingAsPrimary,
                onClick: (event) => {
                  event.stopPropagation()
                  void handlePrimaryContactChange(contact.id)
                },
              })
            : null}
          {renderContactActionButton({
            label: "Editează contact",
            icon: Pencil,
            hiddenColorClass: subtleActionColorClass,
            actionsAlwaysVisible,
            onClick: (event) => {
              event.stopPropagation()
              openContactEditDialog(contact)
            },
          })}
          {renderContactActionButton({
            label: "Copiază telefon",
            icon: Phone,
            hiddenColorClass: subtleActionColorClass,
            actionsAlwaysVisible,
            onClick: (event) => {
              event.stopPropagation()
              void copyTextToClipboard(contact.phone || "", "Telefonul contactului")
            },
          })}
          {renderContactActionButton({
            label: "Copiază email",
            icon: Mail,
            hiddenColorClass: subtleActionColorClass,
            actionsAlwaysVisible,
            onClick: (event) => {
              event.stopPropagation()
              void copyTextToClipboard(contact.email || "", "Emailul contactului")
            },
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid flex-1 min-h-0 gap-3 overflow-hidden xl:grid-cols-[260px_1fr_340px]">
        <div className="hidden min-h-0 xl:block xl:h-full">
          <OpportunityTypeSidebar homeItem={sidebarHomeItem} items={sidebarItems} />
        </div>

        <section className="flex h-full min-h-0 flex-col gap-1.5 xl:gap-3 overflow-y-auto xl:overflow-hidden pb-3 xl:pb-0">
          <div className="mt-1 flex items-center justify-between xl:hidden">
            <MobileRailSheet side="left" title="Tip oportunitate" triggerLabel="Filtre" triggerIcon={Menu} iconOnly className="border-r-2 border-[#004b87] bg-[#005599]">
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
            <div className="mx-2 flex min-w-0 flex-1 items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-center text-base font-semibold text-neutral-900">
                {opportunity.displayTitle}
              </p>
              {isAdmin ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void handleOpportunityDelete()}
                    disabled={isDeletingOpportunity}
                  >
                    {isDeletingOpportunity ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
            <MobileRailSheet side="right" title="Context CRM" triggerLabel="Context" triggerIcon={Menu} iconOnly className="bg-[#f3f4f6]">
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

                <TooltipProvider delayDuration={180}>
                  <div>
                    <p className="mb-2 text-sm font-medium text-neutral-700">Contact principal</p>
                    {primaryContact ? (
                      renderContactCard({
                        contact: primaryContact,
                        isPrimary: true,
                        actionsAlwaysVisible: true,
                      })
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
                        {secondaryContacts.map((contact) =>
                          renderContactCard({
                            contact,
                            isPrimary: false,
                            actionsAlwaysVisible: true,
                          })
                        )}
                      </div>
                    )}
                  </div>
                </TooltipProvider>

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
              "mt-1 rounded-xl border px-3 py-2.5 xl:px-5 xl:py-4",
              PRIORITY_HEADER_STYLES[opportunity.priority]
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2 xl:gap-3">
              <div className="min-w-0 flex-1">
                <p className="hidden text-lg font-semibold text-neutral-900 xl:block">{opportunity.displayTitle}</p>
              </div>
              <div className="hidden items-center gap-2 xl:flex">
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1 px-2 text-xs xl:h-9 xl:px-3 xl:text-sm"
                    onClick={() => void handleOpportunityDelete()}
                    disabled={isDeletingOpportunity}
                  >
                    {isDeletingOpportunity ? <Loader2 className="h-3.5 w-3.5 animate-spin xl:h-4 xl:w-4" /> : <Trash2 className="h-3.5 w-3.5 xl:h-4 xl:w-4" />}
                    <span className="hidden xl:inline">Șterge oportunitate</span>
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs xl:h-9 xl:px-3 xl:text-sm"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
                    <span className="hidden xl:inline">Editează oportunitate</span>
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 xl:mt-2 xl:flex xl:flex-nowrap xl:items-center xl:gap-2.5 xl:overflow-x-auto xl:pb-0.5">
              <div className="xl:shrink-0">
                <Select
                  value={selectedPipelineStage}
                  onValueChange={(value) => {
                    void handlePipelineStageChange(value)
                  }}
                  disabled={savingField !== null}
                >
                  <SelectTrigger className={cn("h-7 bg-white/80 px-2 text-[11px] xl:h-8 xl:px-3 xl:text-sm xl:min-w-[180px]", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineStageOptions.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {CRM_PIPELINE_STAGE_LABELS[stage] || stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="xl:shrink-0">
                <Select
                  value={opportunity.priority}
                  onValueChange={(value) => {
                    void handlePriorityChange(value as CrmOpportunity["priority"])
                  }}
                  disabled={savingField !== null}
                >
                  <SelectTrigger className={cn("h-7 bg-white/80 px-2 text-[11px] xl:h-8 xl:px-3 xl:text-sm xl:min-w-[130px]", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
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
              </div>

              <div className="xl:shrink-0">
                <Select
                  value={opportunity.workStatus}
                  onValueChange={(value) => {
                    void handleWorkStatusChange(value as CrmOpportunity["workStatus"])
                  }}
                  disabled={savingField !== null}
                >
                  <SelectTrigger className={cn("h-7 bg-white/80 px-2 text-[11px] xl:h-8 xl:px-3 xl:text-sm xl:min-w-[130px]", PRIORITY_SUBTEXT_STYLES[opportunity.priority])}>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_WORK_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {CRM_WORK_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {savingField ? (
                <span className="col-span-3 inline-flex items-center text-xs text-neutral-600 xl:col-span-1 xl:ml-auto xl:shrink-0">
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

            <TooltipProvider delayDuration={180}>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">Contact principal</p>
                {primaryContact ? (
                  renderContactCard({
                    contact: primaryContact,
                    isPrimary: true,
                    actionsAlwaysVisible: false,
                  })
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
                    {secondaryContacts.map((contact) =>
                      renderContactCard({
                        contact,
                        isPrimary: false,
                        actionsAlwaysVisible: false,
                      })
                    )}
                  </div>
                )}
              </div>
            </TooltipProvider>

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
                <span className="text-neutral-500">Funcție</span>
                <span className="text-neutral-800">{selectedContactForDialog.functie || "-"}</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editează contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600">Nume</p>
              <Input
                value={contactEditDraft.name}
                onChange={(event) => setContactEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Nume contact"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600">Telefon</p>
              <Input
                value={contactEditDraft.phone}
                onChange={(event) => setContactEditDraft((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Telefon"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600">Email</p>
              <Input
                value={contactEditDraft.email}
                onChange={(event) => setContactEditDraft((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600">Funcție (opțional)</p>
              <Input
                value={contactEditDraft.functie}
                onChange={(event) => setContactEditDraft((prev) => ({ ...prev, functie: event.target.value }))}
                placeholder="Funcție"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingContact(null)} disabled={isSavingContactEdit}>
                Anulează
              </Button>
              <Button type="button" onClick={() => void handleContactEditSave()} disabled={isSavingContactEdit}>
                {isSavingContactEdit ? "Se salvează..." : "Salvează"}
              </Button>
            </div>
          </div>
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
