"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronsUpDown, Plus, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import {
  CRM_OPPORTUNITY_TYPES,
  CRM_OPPORTUNITY_TYPE_LABELS,
  CRM_PIPELINE_STAGES,
  CRM_PIPELINE_STAGE_LABELS,
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

interface CreateOpportunityDialogProps {
  actorId: string
  onCreated: (opportunityId: string) => void
}

export function CreateOpportunityDialog({ actorId, onCreated }: CreateOpportunityDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [users, setUsers] = useState<Array<{ uid: string; displayName: string; email: string }>>([])
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; phone: string; email?: string }>>([])

  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const [pipelineStage, setPipelineStage] = useState<(typeof CRM_PIPELINE_STAGES)[number]>("NOU")
  const [priority, setPriority] = useState<(typeof CRM_PRIORITIES)[number]>("MEDIUM")
  const [opportunityType, setOpportunityType] = useState<(typeof CRM_OPPORTUNITY_TYPES)[number]>("ACASA")
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
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
    const loadContacts = async () => {
      if (!clientId) {
        setContacts([])
        setSelectedContactIds([])
        return
      }
      const rows = await listCrmClientContacts(clientId)
      setContacts(rows)
    }

    loadContacts()
  }, [clientId])

  const contactOptions = useMemo(
    () => contacts.map((contact) => ({ value: contact.id, label: `${contact.name} • ${contact.phone}` })),
    [contacts]
  )
  const filteredClients = useMemo(() => {
    const term = clientSearchTerm.trim().toLowerCase()
    if (!term) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(term))
  }, [clients, clientSearchTerm])
  const selectedClientName = useMemo(() => {
    return clients.find((client) => client.id === clientId)?.name || ""
  }, [clients, clientId])

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

  const resetForm = () => {
    setTitle("")
    setClientId("")
    setOwnerId("")
    setPipelineStage("NOU")
    setPriority("MEDIUM")
    setOpportunityType("ACASA")
    setSelectedContactIds([])
    setClientSearchTerm("")
    setClientActiveIndex(-1)
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
        createdById: actorId,
        pipelineStage,
        priority,
        opportunityType,
        contactIds: selectedContactIds,
      })

      toast({
        title: "Oportunitate creată",
        description: `${result.code} a fost creată cu task-ul automat „Contactare lead”.`,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold shadow-sm shadow-blue-600/10 hover:bg-blue-700">
          <PlusCircle className="mr-1.5 h-4 w-4" />
          Creează oportunitate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Creează oportunitate</DialogTitle>
          <DialogDescription>Clientul este obligatoriu. Se va crea automat task-ul „Contactare lead”.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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
                  {CRM_OPPORTUNITY_TYPES.map((type) => (
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
              <Select value={pipelineStage} onValueChange={(value) => setPipelineStage(value as typeof pipelineStage)}>
                <SelectTrigger className={crmUi.selectTrigger}>
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  {CRM_PIPELINE_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CRM_PIPELINE_STAGE_LABELS[stage]}
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
            <Label>Contacte</Label>
            <MultiSelect
              options={contactOptions}
              selected={selectedContactIds}
              onChange={setSelectedContactIds}
              placeholder={clientId ? "Selectează contacte" : "Selectează întâi clientul"}
              emptyText="Nu există contacte pentru client"
              disabled={!clientId}
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
      </DialogContent>

      <ClientAddDialog
        open={isAddClientDialogOpen}
        onOpenChange={setIsAddClientDialogOpen}
        onClientCreated={handleClientCreated}
      />
    </Dialog>
  )
}
