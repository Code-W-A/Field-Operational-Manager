"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronsUpDown, Loader2, Plus, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
} from "@/lib/crm/opportunities"
import { useToast } from "@/hooks/use-toast"
import { ClientAddDialog } from "@/components/client-add-dialog"
import { crmUi } from "@/components/crm/ui"
import type { CrmClientContact, CrmPipelineStage } from "@/lib/crm/types"

interface CreateOpportunityDialogProps {
  actorId: string
  onCreated: (opportunityId: string) => void
  iconOnly?: boolean
}

type SelectableOpportunityType = (typeof CRM_OPPORTUNITY_SELECTABLE_TYPES)[number]

function getFirstSelectedContactId(selectedContactIds: string[], contacts: CrmClientContact[]) {
  if (selectedContactIds.length === 0) return ""

  const selectedIdSet = new Set(selectedContactIds)
  return contacts.find((contact) => selectedIdSet.has(contact.id))?.id || selectedContactIds[0] || ""
}

export function CreateOpportunityDialog({ actorId, onCreated, iconOnly = false }: CreateOpportunityDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [primaryContactId, setPrimaryContactId] = useState("")
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState("")
  const [clientActiveIndex, setClientActiveIndex] = useState(-1)
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false)

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
        setSelectedContactIds([])
        setPrimaryContactId("")
        return
      }

      setContacts([])
      setSelectedContactIds([])
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
  const effectivePrimaryContactId = useMemo(
    () =>
      selectedContactIds.includes(primaryContactId)
        ? primaryContactId
        : getFirstSelectedContactId(selectedContactIds, contacts),
    [contacts, primaryContactId, selectedContactIds]
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
    if (selectedContactIds.length === 0) {
      if (primaryContactId) {
        setPrimaryContactId("")
      }
      return
    }

    const nextPrimaryContactId = getFirstSelectedContactId(selectedContactIds, contacts)
    if (!primaryContactId || !selectedContactIds.includes(primaryContactId)) {
      if (nextPrimaryContactId !== primaryContactId) {
        setPrimaryContactId(nextPrimaryContactId)
      }
    }
  }, [contacts, primaryContactId, selectedContactIds])

  const resetForm = () => {
    setTitle("")
    setClientId("")
    setOwnerId("")
    setPipelineStage(getDefaultPipelineStageForOpportunityType("VANZARI"))
    setPriority("MEDIUM")
    setOpportunityType("VANZARI")
    setAssignedReadUserIds([])
    setSelectedContactIds([])
    setContacts([])
    setPrimaryContactId("")
    setClientSearchTerm("")
    setClientActiveIndex(-1)
  }

  const handleContactSelectionChange = (contactId: string, checked: boolean) => {
    setSelectedContactIds((previous) => {
      if (checked) {
        return previous.includes(contactId) ? previous : [...previous, contactId]
      }

      return previous.filter((id) => id !== contactId)
    })
  }

  const handleSubmit = async () => {
    if (!clientId) {
      toast({
        title: "Client obligatoriu",
        description: "Nu poți crea oportunitatea fără client definit.",
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
        title: "Owner obligatoriu",
        description: "Selectează owner-ul oportunității.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const result = await createCrmOpportunity({
        title,
        clientId,
        ownerId,
        assignedReadUserIds,
        createdById: actorId,
        pipelineStage: normalizePipelineStageForOpportunityType(opportunityType, pipelineStage),
        priority,
        opportunityType,
        contactIds: selectedContactIds,
        primaryContactId: effectivePrimaryContactId || undefined,
      })

      toast({
        title: "Oportunitate creată",
        description: `${result.code} a fost creată cu succes.`,
      })

      setOpen(false)
      resetForm()
      onCreated(result.opportunityId)
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
      <DialogContent className="flex max-h-[92vh] max-w-[calc(100vw-1rem)] flex-col overflow-y-auto sm:max-w-[96vw] lg:overflow-hidden">
        <DialogHeader>
          <DialogTitle>Creează oportunitate</DialogTitle>
          <DialogDescription>Clientul este obligatoriu pentru crearea oportunității.</DialogDescription>
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
                <Label>Owner</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger className={crmUi.selectTrigger}>
                    <SelectValue placeholder="Selectează owner" />
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
                <Label>Tip oportunitate</Label>
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
                <Label>Pipeline stage</Label>
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
                {submitting ? "Se salvează..." : "Creează oportunitate"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 lg:flex lg:min-h-0 lg:flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Contacte client</Label>
                <p className="mt-1 text-xs text-neutral-500">
                  Selectează una sau mai multe persoane de contact din locațiile clientului și marchează una ca principală.
                </p>
              </div>
              {clientId && contacts.length > 0 ? (
                <Badge variant="secondary">
                  {selectedContactIds.length}/{contacts.length}
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
                    const checkboxId = `opportunity-contact-select-${contact.id}`
                    const isSelected = selectedContactIds.includes(contact.id)
                    const isPrimary = effectivePrimaryContactId === contact.id

                    return (
                      <div
                        key={contact.id}
                        className={`rounded-lg border bg-white p-3 transition-colors ${
                          isSelected ? "border-emerald-500 ring-1 ring-emerald-100" : "border-neutral-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={checkboxId}
                            checked={isSelected}
                            onCheckedChange={(checked) => handleContactSelectionChange(contact.id, checked === true)}
                            className="mt-1 border-neutral-300 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                          />

                          <div className="min-w-0 flex-1">
                            <label htmlFor={checkboxId} className="block cursor-pointer">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-neutral-900">{contact.name}</p>
                                {contact.locationName ? <Badge variant="outline">{contact.locationName}</Badge> : null}
                                {isPrimary ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Principal</Badge> : null}
                              </div>
                              <p className="mt-1 text-sm text-neutral-600">{contact.phone || "-"}</p>
                              <p className="mt-1 break-all text-sm text-neutral-500">{contact.email || "Fără email"}</p>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => setPrimaryContactId(contact.id)}
                            disabled={!isSelected}
                            className={`inline-flex min-w-[96px] items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              isPrimary
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : isSelected
                                  ? "border-neutral-300 bg-white text-neutral-700 hover:border-emerald-500 hover:text-emerald-700"
                                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
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
