"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronsUpDown, Loader2, Plus, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  CRM_OPPORTUNITY_SELECTABLE_TYPES,
  CRM_OPPORTUNITY_TYPE_LABELS,
  CRM_PIPELINE_STAGE_LABELS,
  getDefaultPipelineStageForOpportunityType,
  getPipelineStagesForOpportunityType,
  normalizePipelineStageForOpportunityType,
  CRM_PRIORITIES,
  CRM_PRIORITY_LABELS,
} from "@/lib/crm/constants"
import {
  createCrmOpportunity,
  listCrmClientContacts,
  listCrmClients,
  listCrmUsers,
  setCrmOpportunityContacts,
  updateCrmOpportunity,
} from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"
import { ClientAddDialog } from "@/components/client-add-dialog"
import { crmUi } from "@/components/crm/ui"
import type { CrmClientContact, CrmOpportunity, CrmPipelineStage } from "@/lib/crm/types"

interface CreateOpportunityDialogProps {
  actorId: string
  mode?: "create" | "edit"
  initialOpportunity?: CrmOpportunity | null
  onCreated?: (opportunityId: string) => void
  onSaved?: (opportunityId: string) => void
  iconOnly?: boolean
  prefilledClientId?: string
  prefilledTitle?: string
  autoOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

type SelectableOpportunityType = (typeof CRM_OPPORTUNITY_SELECTABLE_TYPES)[number]

function getFirstContactId(contacts: CrmClientContact[]) {
  return contacts[0]?.id || ""
}

export function CreateOpportunityDialog({
  actorId,
  mode = "create",
  initialOpportunity = null,
  onCreated,
  onSaved,
  iconOnly = false,
  prefilledClientId = "",
  prefilledTitle = "",
  autoOpen = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: CreateOpportunityDialogProps) {
  const { toast } = useToast()
  const [internalOpen, setInternalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const hasAutoOpenedRef = useRef(false)
  const isEditMode = mode === "edit"
  const isControlledOpen = typeof controlledOpen === "boolean"
  const open = isControlledOpen ? controlledOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlledOpen) {
      setInternalOpen(next)
    }
    onOpenChange?.(next)
  }

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string; email: string }>>([])
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [contacts, setContacts] = useState<CrmClientContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const [pipelineStage, setPipelineStage] = useState<CrmPipelineStage>(getDefaultPipelineStageForOpportunityType("VANZARI"))
  const [priority, setPriority] = useState<(typeof CRM_PRIORITIES)[number]>("MEDIUM")
  const [opportunityType, setOpportunityType] = useState<SelectableOpportunityType>("VANZARI")
  const [assignedReadUserIds, setAssignedReadUserIds] = useState<string[]>([])
  const [primaryContactId, setPrimaryContactId] = useState("")
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState("")
  const [clientActiveIndex, setClientActiveIndex] = useState(-1)
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false)

  useEffect(() => {
    if (isEditMode || !autoOpen || hasAutoOpenedRef.current) return
    setOpen(true)
    hasAutoOpenedRef.current = true
  }, [autoOpen, isEditMode])

  useEffect(() => {
    if (!open) return

    const load = async () => {
      const [userRows, clientRows] = await Promise.all([listCrmUsers(), listCrmClients()])
      setUsers(userRows.map((user) => ({ uid: user.uid, displayName: user.displayName, email: user.email })))
      setClients(clientRows.map((client) => ({ id: client.id, name: client.name })))
      if (!ownerId && userRows.length) {
        setOwnerId(userRows[0].uid)
      }
    }

    load()
  }, [open, ownerId])

  useEffect(() => {
    let isActive = true

    const loadContacts = async () => {
      if (!clientId) {
        setContacts([])
        setContactsLoading(false)
        setPrimaryContactId("")
        return
      }

      setContacts([])
      setPrimaryContactId("")
      setContactsLoading(true)
      try {
        const rows = await listCrmClientContacts(clientId)
        if (!isActive) return
        setContacts(rows)
      } finally {
        if (isActive) {
          setContactsLoading(false)
        }
      }
    }

    void loadContacts()
    return () => {
      isActive = false
    }
  }, [clientId])

  useEffect(() => {
    const normalizedPrefilledClientId = prefilledClientId.trim()
    if (!open || !normalizedPrefilledClientId) return
    if (clientId === normalizedPrefilledClientId) return
    setClientId(normalizedPrefilledClientId)
  }, [open, prefilledClientId, clientId])

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.uid, label: user.displayName || user.email || user.uid })),
    [users]
  )
  const filteredClients = useMemo(() => {
    const term = clientSearchTerm.trim().toLowerCase()
    if (!term) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(term))
  }, [clients, clientSearchTerm])
  const selectedClientName = useMemo(() => {
    return clients.find((client) => client.id === clientId)?.name || ""
  }, [clients, clientId])
  const allContactIds = useMemo(() => contacts.map((contact) => contact.id).filter(Boolean), [contacts])
  const effectivePrimaryContactId = useMemo(
    () => (allContactIds.includes(primaryContactId) ? primaryContactId : getFirstContactId(contacts)),
    [allContactIds, contacts, primaryContactId]
  )

  useEffect(() => {
    if (!isClientDropdownOpen) return
    if (filteredClients.length === 0) {
      if (clientActiveIndex !== -1) setClientActiveIndex(-1)
      return
    }
    if (clientActiveIndex < 0 || clientActiveIndex >= filteredClients.length) {
      setClientActiveIndex(0)
    }
  }, [isClientDropdownOpen, filteredClients, clientActiveIndex])

  useEffect(() => {
    if (contacts.length === 0) {
      if (primaryContactId) {
        setPrimaryContactId("")
      }
      return
    }

    const nextPrimaryContactId = getFirstContactId(contacts)
    if (!primaryContactId || !allContactIds.includes(primaryContactId)) {
      if (nextPrimaryContactId !== primaryContactId) {
        setPrimaryContactId(nextPrimaryContactId)
      }
    }
  }, [allContactIds, contacts, primaryContactId])

  const resetForm = (modeToReset: "create" | "edit") => {
    if (modeToReset === "edit" && initialOpportunity) {
      const nextType = initialOpportunity.opportunityType as SelectableOpportunityType
      setTitle(initialOpportunity.title || "")
      setClientId(initialOpportunity.clientId || "")
      setOwnerId(initialOpportunity.ownerId || "")
      setPipelineStage(normalizePipelineStageForOpportunityType(nextType, initialOpportunity.pipelineStage))
      setPriority(initialOpportunity.priority)
      setOpportunityType(nextType)
      setAssignedReadUserIds(
        (initialOpportunity.readUserIds || []).filter(
          (userId) => userId !== initialOpportunity.ownerId && userId !== initialOpportunity.createdById
        )
      )
      setPrimaryContactId(initialOpportunity.primaryContactId || "")
    } else {
      setTitle(prefilledTitle.trim())
      setClientId(prefilledClientId.trim())
      setOwnerId("")
      setPipelineStage(getDefaultPipelineStageForOpportunityType("VANZARI"))
      setPriority("MEDIUM")
      setOpportunityType("VANZARI")
      setAssignedReadUserIds([])
      setPrimaryContactId("")
    }
    setContacts([])
    setClientSearchTerm("")
    setClientActiveIndex(-1)
  }

  useEffect(() => {
    if (!open) return
    resetForm(mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialOpportunity?.id, prefilledClientId, prefilledTitle])

  const handleSubmit = async () => {
    if (!clientId) {
      toast({
        title: "Client obligatoriu",
        description: isEditMode
          ? "Nu poți salva oportunitatea fără client definit."
          : "Nu poți crea oportunitatea fără client definit.",
        variant: "destructive",
      })
      return
    }

    if (!title.trim()) {
      toast({
        title: "Titlu obligatoriu",
        description: "Completează titlul oportunității.",
        variant: "destructive",
      })
      return
    }

    if (!ownerId) {
      toast({
        title: "Proprietar obligatoriu",
        description: "Selectează proprietarul oportunității.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const normalizedTitle = title.trim()
      const normalizedStage = normalizePipelineStageForOpportunityType(opportunityType, pipelineStage)
      if (isEditMode && initialOpportunity) {
        const displayTitle = `${initialOpportunity.code} - ${normalizedTitle}`
        const nextReadUserIds = Array.from(new Set([ownerId, actorId, ...assignedReadUserIds].filter(Boolean)))
        const nextEditUserIds = Array.from(new Set([ownerId, actorId].filter(Boolean)))

        await updateCrmOpportunity(initialOpportunity.id, actorId, {
          title: normalizedTitle,
          displayTitle,
          clientId,
          ownerId,
          priority,
          pipelineStage: normalizedStage,
          opportunityType,
          primaryContactId: effectivePrimaryContactId || undefined,
          readUserIds: nextReadUserIds,
          editUserIds: nextEditUserIds,
        })
        await setCrmOpportunityContacts(initialOpportunity.id, allContactIds)

        toast({
          title: "Oportunitate actualizată",
          description: `${initialOpportunity.code} a fost actualizată cu succes.`,
        })
        setOpen(false)
        onSaved?.(initialOpportunity.id)
      } else {
        const result = await createCrmOpportunity({
          title: normalizedTitle,
          clientId,
          ownerId,
          assignedReadUserIds,
          createdById: actorId,
          pipelineStage: normalizedStage,
          priority,
          opportunityType,
          contactIds: allContactIds,
          primaryContactId: effectivePrimaryContactId || undefined,
        })

        toast({
          title: "Oportunitate creată",
          description: `${result.code} a fost creată cu succes.`,
        })

        setOpen(false)
        resetForm("create")
        onCreated?.(result.opportunityId)
        onSaved?.(result.opportunityId)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleClientCreated = async (created: { clientId: string; clientName: string }) => {
    const clientRows = await listCrmClients()
    setClients(clientRows.map((client) => ({ id: client.id, name: client.name })))
    setClientId(created.clientId)
    setClientSearchTerm("")
    setClientActiveIndex(-1)
  }

  const pipelineStagesForType = useMemo(
    () => getPipelineStagesForOpportunityType(opportunityType),
    [opportunityType]
  )

  useEffect(() => {
    setPipelineStage((current) => normalizePipelineStageForOpportunityType(opportunityType, current))
  }, [opportunityType])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button
            size="sm"
            aria-label={iconOnly ? "Creeaza oportunitate" : undefined}
            className={
              iconOnly
                ? "h-8 w-8 rounded-md border border-emerald-600 bg-emerald-600 px-0 text-white shadow-none hover:bg-emerald-700"
                : "h-9 rounded-md border border-emerald-600 bg-emerald-600 px-3.5 text-sm font-semibold text-white shadow-none hover:bg-emerald-700"
            }
          >
            <PlusCircle className={iconOnly ? "h-4 w-4" : "mr-1.5 h-4 w-4"} />
            {iconOnly ? null : "Creează oportunitate"}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="flex max-h-[92vh] max-w-[calc(100vw-1rem)] flex-col overflow-y-auto sm:max-w-[96vw] lg:overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Editează oportunitate" : "Creează oportunitate"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Actualizează câmpurile oportunității și salvează modificările."
              : "Clientul este obligatoriu pentru crearea oportunității."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.2fr)] xl:grid-cols-[minmax(320px,0.75fr)_minmax(560px,1.25fr)]">
          <div className="grid min-w-0 gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            <div className="grid gap-2">
              <Label>Client</Label>
              <Popover open={isClientDropdownOpen} onOpenChange={setIsClientDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={`${crmUi.inputBase} w-full justify-between px-3 font-normal`}>
                    <span className={selectedClientName ? "text-foreground" : "text-muted-foreground"}>
                      {selectedClientName || "Selectează client"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                  <Input
                    value={clientSearchTerm}
                    onChange={(event) => {
                      setClientSearchTerm(event.target.value)
                      setClientActiveIndex(0)
                    }}
                    onKeyDown={(event) => {
                      if (!isClientDropdownOpen) return
                      if (event.key === "ArrowDown") {
                        event.preventDefault()
                        if (filteredClients.length === 0) return
                        setClientActiveIndex((prev) => {
                          if (prev < 0) return 0
                          return Math.min(prev + 1, filteredClients.length - 1)
                        })
                        return
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault()
                        if (filteredClients.length === 0) return
                        setClientActiveIndex((prev) => {
                          if (prev < 0) return filteredClients.length - 1
                          return Math.max(prev - 1, 0)
                        })
                        return
                      }
                      if (event.key === "Enter") {
                        event.preventDefault()
                        if (filteredClients.length === 0) return
                        const idx = clientActiveIndex >= 0 ? clientActiveIndex : 0
                        const selected = filteredClients[idx]
                        if (!selected) return
                        setClientId(selected.id)
                        setClientSearchTerm("")
                        setClientActiveIndex(-1)
                        setIsClientDropdownOpen(false)
                        return
                      }
                      if (event.key === "Escape") {
                        event.preventDefault()
                        setIsClientDropdownOpen(false)
                      }
                    }}
                    placeholder="Caută client..."
                    className={crmUi.inputBase}
                  />
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client, index) => (
                        <button
                          key={client.id}
                          type="button"
                          className={`w-full px-2 py-1 text-left text-sm ${
                            clientId === client.id
                              ? "bg-blue-50 text-blue-700"
                              : clientActiveIndex === index
                                ? "bg-neutral-100"
                                : "hover:bg-neutral-100"
                          }`}
                          onMouseEnter={() => setClientActiveIndex(index)}
                          onClick={() => {
                            setClientId(client.id)
                            setClientSearchTerm("")
                            setClientActiveIndex(-1)
                            setIsClientDropdownOpen(false)
                          }}
                        >
                          {client.name}
                        </button>
                      ))
                    ) : (
                      <div className="p-2 text-center text-sm text-muted-foreground">Nu s-au găsit clienți</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsAddClientDialogOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adaugă client nou
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-title">Titlu oportunitate</Label>
              <Input
                id="op-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Sistem acces bloc B"
                className={crmUi.inputBase}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Proprietar</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger className={crmUi.selectTrigger}>
                    <SelectValue placeholder="Selectează proprietar" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.uid} value={user.uid}>
                        {user.displayName || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Modul</Label>
                <Select value={opportunityType} onValueChange={(value) => setOpportunityType(value as typeof opportunityType)}>
                  <SelectTrigger className={crmUi.selectTrigger}>
                    <SelectValue placeholder="Tip" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_OPPORTUNITY_SELECTABLE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {CRM_OPPORTUNITY_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Status oportunitate</Label>
                <Select value={pipelineStage} onValueChange={(value) => setPipelineStage(value as CrmPipelineStage)}>
                  <SelectTrigger className={crmUi.selectTrigger}>
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineStagesForType.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {CRM_PIPELINE_STAGE_LABELS[stage] || stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioritate</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                  <SelectTrigger className={crmUi.selectTrigger}>
                    <SelectValue placeholder="Prioritate" />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_PRIORITIES.map((rowPriority) => (
                      <SelectItem key={rowPriority} value={rowPriority}>
                        {CRM_PRIORITY_LABELS[rowPriority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Utilizatori asignați (vizualizare)</Label>
              <MultiSelect
                options={userOptions}
                selected={assignedReadUserIds}
                onChange={setAssignedReadUserIds}
                placeholder="Selectează unul sau mai mulți utilizatori"
                emptyText="Nu există utilizatori disponibili"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Anulează
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Se salvează..." : isEditMode ? "Salvează modificările" : "Creează oportunitate"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 lg:flex lg:min-h-0 lg:flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Contacte client</Label>
                <p className="mt-1 text-xs text-neutral-500">
                  Toate persoanele de contact ale clientului sunt preluate automat. Alege doar contactul principal.
                </p>
              </div>
              {clientId && contacts.length > 0 ? (
                <Badge variant="secondary">
                  {contacts.length} preluate automat
                </Badge>
              ) : null}
            </div>

            {!clientId ? (
              <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-500">
                Selectează mai întâi clientul pentru a vedea contactele disponibile.
              </div>
            ) : contactsLoading ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Se încarcă contactele clientului...
              </div>
            ) : contacts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-500">
                Clientul selectat nu are persoane de contact definite pe locațiile lui în Clienți.
              </div>
            ) : (
              <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 lg:min-h-0 lg:max-h-none lg:flex-1">
                <div className="grid gap-2">
                  {contacts.map((contact) => {
                    const isPrimary = effectivePrimaryContactId === contact.id

                    return (
                      <div
                        key={contact.id}
                        className={`rounded-lg border bg-white p-3 transition-colors ${
                          isPrimary ? "border-emerald-500 ring-1 ring-emerald-100" : "border-neutral-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="block">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-neutral-900">{contact.name}</p>
                                {contact.locationName ? <Badge variant="outline">{contact.locationName}</Badge> : null}
                                <Badge variant="secondary" className="rounded-md">
                                  Auto
                                </Badge>
                                {isPrimary ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge> : null}
                              </div>
                              <p className="mt-1 text-sm text-neutral-600">{contact.phone || "-"}</p>
                              <p className="mt-1 break-all text-sm text-neutral-500">{contact.email || "Fără email"}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setPrimaryContactId(contact.id)}
                            className={`inline-flex min-w-[96px] items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              isPrimary
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-neutral-300 bg-white text-neutral-700 hover:border-emerald-500 hover:text-emerald-700"
                            }`}
                          >
                            {isPrimary ? "Principal" : "Setează principal"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <ClientAddDialog
        open={isAddClientDialogOpen}
        onOpenChange={setIsAddClientDialogOpen}
        onClientCreated={handleClientCreated}
      />
    </Dialog>
  )
}
