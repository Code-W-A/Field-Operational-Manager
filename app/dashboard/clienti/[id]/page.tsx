"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ArrowLeft, ArrowRightLeft, Pencil, Trash2, MapPin, Wrench, Calendar, Clock, FileText, Building2, Phone, Mail, User, Hash, FileCheck, Plus, AlertCircle, Search } from "lucide-react"
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import { getClientById, deleteClient, type Client, type Echipament } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import type { Lucrare } from "@/lib/firebase/firestore"
import { orderBy } from "firebase/firestore"
import { ClientContractsManager } from "@/components/client-contracts-manager"
// Adăugăm importul pentru componenta EquipmentQRCode
import { EquipmentQRCode } from "@/components/equipment-qr-code"
import { formatDate, formatDateTimeSafe, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { ClientForm } from "@/components/client-form"
import { EquipmentMigrateWizardDialog } from "@/components/equipment/equipment-migrate-wizard-dialog"

// Importăm hook-ul useClientLucrari pentru a putea actualiza datele
import { useClientLucrari } from "@/hooks/use-client-lucrari"

// Funcție utilitar pentru a extrage CUI-ul indiferent de cum este salvat
const extractCUI = (client: any) => {
  return client?.cui || client?.cif || client?.CIF || client?.CUI || "N/A"
}

type EquipmentFilterStatus = "all" | "warranty" | "expired" | "soon" | "observations"
type EquipmentFilterState = {
  query: string
  status: EquipmentFilterStatus
}

const DEFAULT_EQUIPMENT_FILTER: EquipmentFilterState = {
  query: "",
  status: "all",
}

const WARRANTY_SOON_DAYS = 30

const getWarrantyUiInfo = (echipament: Echipament) => {
  const warrantyInfo = getWarrantyDisplayInfo(echipament)
  const isExpiringSoon = Boolean(
    warrantyInfo.hasWarrantyData &&
      warrantyInfo.isInWarranty &&
      typeof warrantyInfo.daysRemaining === "number" &&
      warrantyInfo.daysRemaining <= WARRANTY_SOON_DAYS
  )

  if (!warrantyInfo.hasWarrantyData) {
    return {
      warrantyInfo,
      statusKey: "unknown" as const,
      statusText: "Fără date garanție",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    }
  }

  if (isExpiringSoon) {
    return {
      warrantyInfo,
      statusKey: "soon" as const,
      statusText: "Expiră curând",
      badgeClass: "border-amber-200 bg-amber-100 text-amber-800",
    }
  }

  if (warrantyInfo.isInWarranty) {
    return {
      warrantyInfo,
      statusKey: "warranty" as const,
      statusText: "În garanție",
      badgeClass: "border-green-200 bg-green-100 text-green-800",
    }
  }

  return {
    warrantyInfo,
    statusKey: "expired" as const,
    statusText: "Garanție expirată",
    badgeClass: "border-red-200 bg-red-100 text-red-800",
  }
}

const getLocationWarrantySummary = (echipamente: Echipament[] = []) => {
  return echipamente.reduce(
    (summary, echipament) => {
      const statusKey = getWarrantyUiInfo(echipament).statusKey
      if (statusKey === "soon") summary.soon += 1
      if (statusKey === "expired") summary.expired += 1
      if (statusKey === "warranty") summary.inWarranty += 1
      return summary
    },
    { inWarranty: 0, expired: 0, soon: 0 }
  )
}

const matchesEquipmentFilter = (echipament: Echipament, filter: EquipmentFilterState) => {
  const query = filter.query.trim().toLowerCase()
  const warrantyUi = getWarrantyUiInfo(echipament)

  const matchesQuery =
    !query ||
    [echipament.nume, echipament.cod, echipament.serie, echipament.model]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))

  if (!matchesQuery) return false

  if (filter.status === "warranty") return warrantyUi.warrantyInfo.isInWarranty
  if (filter.status === "expired") return warrantyUi.statusKey === "expired"
  if (filter.status === "soon") return warrantyUi.statusKey === "soon"
  if (filter.status === "observations") return Boolean(echipament.observatii?.trim())

  return true
}

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { userData } = useAuth()
  const { id } = React.use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [initialEquipmentSelection, setInitialEquipmentSelection] = useState<
    | {
        locationIndex?: number
        equipmentId?: string
        equipmentCode?: string
        equipmentIndex?: number
      }
    | undefined
  >(undefined)

  const [migrateWizardOpen, setMigrateWizardOpen] = useState(false)
  const [migrateContext, setMigrateContext] = useState<{
    sourceLocationId: string
    sourceLocationName: string
    equipmentId: string
    equipmentCod: string
    equipmentNume: string
  } | null>(null)
  const [equipmentFilters, setEquipmentFilters] = useState<Record<string, EquipmentFilterState>>({})

  // Obținem lucrările pentru acest client
  const { data: toateLucrarile } = useFirebaseCollection<Lucrare>("lucrari", [orderBy("dataEmiterii", "desc")])
  const [lucrariClient, setLucrariClient] = useState<Lucrare[]>([])

  // Adăugăm hook-ul în componenta ClientPage
  const { refreshData } = useClientLucrari()

  useEffect(() => {
    const fetchClient = async () => {
      try {
        setLoading(true)
        const data = await getClientById(id)
        if (data) {
          console.log("DEBUG - Client data from database:", data)
          console.log("DEBUG - client.cui:", data.cui)
          console.log("DEBUG - client.cif:", (data as any).cif)
          setClient(data)
        } else {
          setError("Clientul nu a fost găsit")
        }
      } catch (err) {
        console.error("Eroare la încărcarea clientului:", err)
        setError("A apărut o eroare la încărcarea clientului")
      } finally {
        setLoading(false)
      }
    }

    fetchClient()
  }, [id])

  // Filtrăm lucrările pentru acest client
  useEffect(() => {
    if (client && toateLucrarile.length > 0) {
      const lucrari = toateLucrarile
        .filter((lucrare) => lucrare.client === client.nume)
        .sort((a: any, b: any) => {
          // Sortăm după data intervenției (desc). Fallback: timpSosire / dataEmiterii.
          const da = toDateSafe(a?.dataInterventie ?? a?.timpSosire ?? a?.dataEmiterii)
          const db = toDateSafe(b?.dataInterventie ?? b?.timpSosire ?? b?.dataEmiterii)
          const ta = da ? da.getTime() : Number.NEGATIVE_INFINITY
          const tb = db ? db.getTime() : Number.NEGATIVE_INFINITY
          return tb - ta
        })
      setLucrariClient(lucrari)
    }
  }, [client, toateLucrarile])

  // Modificăm funcția handleEdit pentru a reîmprospăta datele
  const handleEdit = () => {
    if (!client) return
    // Editare client generală – nu auto-selectăm un echipament
    setInitialEquipmentSelection(undefined)
    setIsEditDialogOpen(true)
  }

  const handleEditClose = () => {
    setIsEditDialogOpen(false)
  }

  const handleEditSuccess = async () => {
    setIsEditDialogOpen(false)
    try {
      const data = await getClientById(id)
      if (data) {
        setClient(data)
      }
    } catch (err) {
      console.error("Eroare la reîncărcarea clientului după editare:", err)
    }
  }

  // Modificăm funcția handleDelete pentru a reîmprospăta datele
  const handleDelete = async () => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți acest client?")) {
      try {
        await deleteClient(id)
        refreshData() // Adăugăm apelul către refreshData
        router.push("/dashboard/clienti")
      } catch (err) {
        console.error("Eroare la ștergerea clientului:", err)
        alert("A apărut o eroare la ștergerea clientului.")
      }
    }
  }

  const updateEquipmentFilter = (locationKey: string, patch: Partial<EquipmentFilterState>) => {
    setEquipmentFilters((prev) => ({
      ...prev,
      [locationKey]: {
        ...(prev[locationKey] || DEFAULT_EQUIPMENT_FILTER),
        ...patch,
      },
    }))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const totalLocatii = client?.locatii?.length || 0
  const totalEchipamente = client?.locatii?.reduce((sum, loc) => sum + (loc.echipamente?.length || 0), 0) || 0

  return (
    <TooltipProvider>
      <DashboardShell>
        <DashboardHeader
          className="pb-3"
          heading={
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</span>
              <span className="min-w-0 truncate text-xl font-semibold leading-tight md:text-2xl">{client?.nume}</span>
              <Badge variant="secondary" className="text-xs">
                CUI: {extractCUI(client)}
              </Badge>
            </span>
          }
          text={client?.adresa || "Detalii client"}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
            </Button>
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Editează
            </Button>
            {userData?.role === "admin" && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Șterge
              </Button>
            )}
          </div>
        </DashboardHeader>

        <div className="space-y-4 pb-12">
          {/* 1. Zona superioară */}
          <section className="grid gap-3 lg:grid-cols-12">
            <Card className="lg:col-span-4">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span>Detalii despre client</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Telefon principal</p>
                      <p className="text-sm font-medium">{client?.telefon || "N/A"}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Email</p>
                      <p className="break-words text-sm font-medium">{client?.email || "N/A"}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Reprezentant firmă</p>
                      <p className="text-sm font-medium">{client?.reprezentantFirma || "N/A"}</p>
                      {client?.functieReprezentant && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {client.functieReprezentant}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <FileCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">CUI/CIF</p>
                      <p className="font-mono text-sm font-medium">{(client as any)?.cif || "N/A"}</p>
                    </div>
                  </div>

                  {(userData?.role === "admin" || userData?.role === "dispecer") && (
                    <div className="flex items-start gap-2 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                      <Hash className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-medium text-muted-foreground">Nr. ordine ONRC</p>
                        <p className="font-mono text-sm font-medium">{(client as any)?.regCom || "N/A"}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-5">
              <ClientContractsManager
                clientId={id}
                clientName={client?.nume || ""}
                onContractsChange={() => {
                  // Opțional: reîncărcăm datele clientului sau facem alte actualizări
                  console.log("Contractele au fost actualizate")
                }}
              />
            </div>

            <div className="space-y-3 lg:col-span-3">
              <Card>
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Statistici</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Număr lucrări</span>
                      <span className="font-semibold">{lucrariClient.length}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Locații</span>
                      <span className="font-semibold">{totalLocatii}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Echipamente</span>
                      <span className="font-semibold">{totalEchipamente}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Ultimele tichete</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {lucrariClient.length > 0 ? (
                    <div className="space-y-2">
                      {lucrariClient.slice(0, 3).map((lucrare) => (
                        <div
                          key={lucrare.id}
                          className="group cursor-pointer rounded-md border px-3 py-2 transition-all hover:bg-muted"
                          onClick={() => router.push(`/dashboard/lucrari/${lucrare.id}`)}
                        >
                          <p className="text-sm font-medium line-clamp-1">{lucrare.tipLucrare}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(() => {
                              const d = toDateSafe((lucrare as any).dataInterventie ?? (lucrare as any).timpSosire ?? (lucrare as any).dataEmiterii)
                              return d ? formatUiDate(d) : String((lucrare as any).dataInterventie || "")
                            })()}
                          </p>
                        </div>
                      ))}
                      {lucrariClient.length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 w-full"
                          onClick={() => {
                            const qs = new URLSearchParams()
                            qs.set("clientId", String(id))
                            if (client?.nume) qs.set("clientName", String(client.nume))
                            router.push(`/dashboard/istoric-interventii?${qs.toString()}`)
                          }}
                        >
                          Vezi toate ({lucrariClient.length})
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 py-4 text-center text-muted-foreground">
                      <FileText className="h-5 w-5 opacity-50" />
                      <p className="text-sm">Nu există lucrări recente</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 2. Locații și echipamente */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 border-b pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold tracking-tight">Locații și echipamente</h2>
                <p className="text-sm text-muted-foreground">
                  {totalLocatii} {totalLocatii === 1 ? 'locație' : 'locații'} • {totalEchipamente} echipamente
                </p>
              </div>
            </div>
            <Card>
              <CardContent className="p-3 sm:p-4">
                {client?.locatii && client.locatii.length > 0 ? (
                  <Accordion type="multiple" defaultValue={["locatie-0"]} className="w-full space-y-2">
                    {client.locatii.map((locatie, index) => {
                      const locationKey = String((locatie as any)?.id || `locatie-${index}`)
                      const locationEquipments = Array.isArray(locatie.echipamente) ? locatie.echipamente : []
                      const locationContacts = Array.isArray(locatie.persoaneContact) ? locatie.persoaneContact : []
                      const locationWarrantySummary = getLocationWarrantySummary(locationEquipments)
                      const currentFilter = equipmentFilters[locationKey] || DEFAULT_EQUIPMENT_FILTER
                      const filteredEquipmentEntries = locationEquipments
                        .map((echipament, equipmentIndex) => ({ echipament, equipmentIndex }))
                        .filter(({ echipament }) => matchesEquipmentFilter(echipament, currentFilter))
                      const filterOptions: Array<{ value: EquipmentFilterStatus; label: string }> = [
                        { value: "all", label: "Toate" },
                        { value: "warranty", label: "În garanție" },
                        { value: "expired", label: "Expirate" },
                        { value: "soon", label: "Expiră curând" },
                        { value: "observations", label: "Cu observații" },
                      ]

                      return (
                      <AccordionItem key={locationKey} value={`locatie-${index}`} className="rounded-lg border px-3">
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-sm font-semibold">{locatie.nume}</span>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {locationEquipments.length} echipamente
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {locationContacts.length} contacte
                                </Badge>
                                {locationEquipments.length > 0 && (
                                  <>
                                    <Badge className="border-green-200 bg-green-50 text-xs text-green-700">
                                      {locationWarrantySummary.inWarranty} în garanție
                                    </Badge>
                                    <Badge className="border-amber-200 bg-amber-50 text-xs text-amber-700">
                                      {locationWarrantySummary.soon} expiră curând
                                    </Badge>
                                    <Badge className="border-red-200 bg-red-50 text-xs text-red-700">
                                      {locationWarrantySummary.expired} expirate
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3 pt-0">
                          <div className="space-y-3">
                            <div className="grid gap-3 lg:grid-cols-2">
                            {/* Informații despre locație */}
                            <div className="rounded-lg bg-muted/40 p-3">
                              <div className="mb-2 flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-sm">Informații Locație</h4>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">Nume</p>
                                  <p className="text-sm font-medium mt-1">{locatie.nume}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">Adresă</p>
                                  <p className="text-sm font-medium mt-1">{locatie.adresa || "Nespecificat"}</p>
                                </div>
                              </div>
                            </div>

                            {/* Persoane de contact */}
                            {locatie.persoaneContact && locatie.persoaneContact.length > 0 && (
                              <div className="rounded-lg bg-muted/40 p-3">
                                <div className="mb-3 flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <h4 className="font-semibold text-sm">Persoane de Contact</h4>
                                  <Badge variant="secondary" className="ml-auto text-xs">{locationContacts.length}</Badge>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                  {locationContacts.map((persoana, contactIndex) => (
                                    <div key={contactIndex} className="rounded-md bg-card p-2.5 transition-colors hover:bg-muted/50">
                                      <div className="space-y-1">
                                        <p className="font-medium text-sm">{persoana.nume}</p>
                                        {persoana.telefon && (
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Phone className="h-3 w-3" />
                                            <span>{persoana.telefon}</span>
                                          </div>
                                        )}
                                        {persoana.email && (
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Mail className="h-3 w-3" />
                                            <span className="break-all">{persoana.email}</span>
                                          </div>
                                        )}
                                        {persoana.functie && (
                                          <Badge variant="outline" className="text-xs mt-2">
                                            {persoana.functie}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            </div>

                            {/* Echipamente */}
                            <div className="rounded-lg bg-muted/40 p-3">
                              <div className="mb-3 flex items-center gap-2">
                                <Wrench className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-sm">Echipamente</h4>
                                <Badge variant="secondary" className="ml-auto text-xs">{locationEquipments.length}</Badge>
                              </div>
                              
                              {locationEquipments.length > 0 ? (
                                <div className="space-y-3">
                                  <div className="flex flex-col gap-2 rounded-md bg-background/70 p-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="relative min-w-0 flex-1">
                                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                      <Input
                                        value={currentFilter.query}
                                        onChange={(event) => updateEquipmentFilter(locationKey, { query: event.target.value })}
                                        placeholder="Caută nume, cod sau serie"
                                        className="h-8 pl-8 text-xs"
                                      />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {filterOptions.map((option) => (
                                        <Button
                                          key={option.value}
                                          type="button"
                                          variant={currentFilter.status === option.value ? "default" : "outline"}
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => updateEquipmentFilter(locationKey, { status: option.value })}
                                        >
                                          {option.label}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>

                                  {filteredEquipmentEntries.length > 0 ? (
                                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,min(100%,24rem)))]">
                                    {filteredEquipmentEntries.map(({ echipament, equipmentIndex }) => {
                                      // Calculăm informațiile de garanție pentru fiecare echipament
                                      const warrantyUi = getWarrantyUiInfo(echipament);
                                      const warrantyInfo = warrantyUi.warrantyInfo;
                                      
                                      return (
                                        <div key={(echipament as any).id || `${echipament.cod}-${equipmentIndex}`} className="group relative rounded-lg border bg-card p-2.5 shadow-sm transition-all hover:bg-muted/40">
                                          {/* Header echipament */}
                                          <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1 space-y-1">
                                              <h5 className="line-clamp-2 text-sm font-semibold leading-snug">{echipament.nume}</h5>
                                              {echipament.status && (
                                                <Badge variant="secondary" className="text-xs">
                                                  {echipament.status}
                                                </Badge>
                                              )}
                                            </div>
                                            <Badge variant="outline" className="shrink-0 text-xs">
                                              Cod: {echipament.cod}
                                            </Badge>
                                          </div>
                                          
                                          {/* Detalii echipament */}
                                          <div className="space-y-2">
                                            {/* Informații de bază */}
                                            {(echipament.model || echipament.serie) && (
                                              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                                                {echipament.model && (
                                                  <div className="min-w-0">
                                                    <span className="text-muted-foreground">Model</span>
                                                    <p className="truncate font-medium text-foreground">{echipament.model}</p>
                                                  </div>
                                                )}
                                                {echipament.serie && (
                                                  <div className="min-w-0">
                                                    <span className="text-muted-foreground">Serie</span>
                                                    <p className="truncate font-medium text-foreground">{echipament.serie}</p>
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* Date importante */}
                                            {(echipament.dataInstalarii || echipament.dataInstalare || echipament.ultimaInterventie) && (
                                              <div className="space-y-1 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                                                {(echipament.dataInstalarii || echipament.dataInstalare) && (
                                                  <div className="flex items-center gap-2">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span className="font-medium text-muted-foreground">Instalat:</span>
                                                    <span className="ml-auto font-medium">{(() => { try { return formatUiDate(toDateSafe(echipament.dataInstalarii || echipament.dataInstalare!)) } catch { return String(echipament.dataInstalarii || echipament.dataInstalare || "") } })()}</span>
                                                  </div>
                                                )}
                                                {echipament.ultimaInterventie && (
                                                  <div className="flex items-center gap-2">
                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                    <span className="font-medium text-muted-foreground">Ultima intervenție:</span>
                                                    <span className="ml-auto font-medium">{formatDate(echipament.ultimaInterventie)}</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* Informații garanție */}
                                            {warrantyInfo.hasWarrantyData && (
                                              <div className="rounded-md bg-muted/50 px-2 py-1.5">
                                                <div className="mb-1.5 flex items-center gap-2">
                                                  <span className="text-sm font-medium">Informații Garanție</span>
                                                  <Badge className={`${warrantyUi.badgeClass} ml-auto text-xs`}>
                                                    {warrantyUi.statusText}
                                                  </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                                  <div>
                                                    <span className="text-muted-foreground">Garanție:</span>
                                                    <span className="ml-1 font-medium">{warrantyInfo.warrantyMonths} luni</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-muted-foreground">Expiră:</span>
                                                    <span className="ml-1 font-medium">{(() => { try { return formatUiDate(toDateSafe(warrantyInfo.warrantyExpires)) } catch { return String(warrantyInfo.warrantyExpires || "-") } })()}</span>
                                                  </div>
                                                  <div className="col-span-2">
                                                    <span className="text-muted-foreground">Zile rămase: </span>
                                                    <span className={`font-semibold ${warrantyUi.statusKey === "expired" ? "text-red-600" : warrantyUi.statusKey === "soon" ? "text-amber-700" : "text-green-600"}`}>
                                                      {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                                                    </span>
                                                  </div>
                                                </div>
                                                {!warrantyInfo.hasExplicitWarranty && (
                                                  <div className="mt-2 flex items-start gap-2 rounded border border-yellow-200 bg-yellow-50 p-1.5">
                                                    <AlertCircle className="h-3 w-3 text-yellow-700 mt-0.5 flex-shrink-0" />
                                                    <p className="text-xs text-yellow-800">
                                                      Garanție implicită (12 luni)
                                                    </p>
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* Observații */}
                                            {echipament.observatii && (
                                              <div className="rounded-md bg-yellow-50 px-2 py-1.5">
                                                <div className="flex items-start gap-2">
                                                  <FileText className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                                                  <div className="min-w-0 flex-1">
                                                    <span className="mb-0.5 block text-xs font-medium">Observații</span>
                                                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground" title={echipament.observatii}>{echipament.observatii}</p>
                                                  </div>
                                                </div>
                                              </div>
                                            )}

                                            {/* Audit etichetă QR */}
                                            <div className="text-xs text-muted-foreground">
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="font-medium text-muted-foreground">Ultima etichetă printată:</span>
                                                <span>
                                                  {(echipament as any).lastQrPrintedAt
                                                    ? `${formatDateTimeSafe((echipament as any).lastQrPrintedAt)} de ${String((echipament as any).lastQrPrintedBy || "-")}`
                                                    : "—"}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Butoane QR Code și Editare echipament */}
                                            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                                              <EquipmentQRCode
                                                equipment={echipament}
                                                clientName={client?.nume || ""}
                                                locationName={locatie.nume}
                                                clientId={client?.id || id}
                                                locationId={(locatie as any).id}
                                                onPrintRecorded={({ printedAt, printedBy, printedById }) => {
                                                  setClient((prev) => {
                                                    if (!prev || !Array.isArray(prev.locatii)) return prev
                                                    const nextLocatii = prev.locatii.map((loc) => {
                                                      if (String((loc as any)?.id || "") !== String((locatie as any)?.id || "")) return loc
                                                      const nextEchipamente = (Array.isArray(loc.echipamente) ? loc.echipamente : []).map((eq) => {
                                                        if (String((eq as any)?.id || "") !== String((echipament as any)?.id || "")) return eq
                                                        return {
                                                          ...eq,
                                                          lastQrPrintedAt: printedAt,
                                                          lastQrPrintedBy: printedBy,
                                                          lastQrPrintedById: printedById,
                                                        }
                                                      })
                                                      return { ...loc, echipamente: nextEchipamente }
                                                    })
                                                    return { ...prev, locatii: nextLocatii }
                                                  })
                                                }}
                                                useSimpleFormat={true} // Format simplu pentru scanare mai ușoară
                                              />
                                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                {userData?.role === "admin" && (echipament as any).id ? (
                                                  <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-8 gap-1.5 px-2.5"
                                                    onClick={() => {
                                                      setMigrateContext({
                                                        sourceLocationId: String((locatie as any)?.id || ""),
                                                        sourceLocationName: String(locatie.nume || ""),
                                                        equipmentId: String((echipament as any).id),
                                                        equipmentCod: String((echipament as any).cod || ""),
                                                        equipmentNume: String((echipament as any).nume || ""),
                                                      })
                                                      setMigrateWizardOpen(true)
                                                    }}
                                                    title="Mută sau copiază echipamentul pe alt client"
                                                  >
                                                    <ArrowRightLeft className="h-3 w-3" />
                                                    <span className="text-xs">Migrează</span>
                                                  </Button>
                                                ) : null}
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-8 gap-1.5 px-2.5"
                                                  onClick={() => {
                                                    setInitialEquipmentSelection({
                                                      locationIndex: index,
                                                      equipmentIndex,
                                                      equipmentId: (echipament as any).id,
                                                      equipmentCode: (echipament as any).cod,
                                                    })
                                                    setIsEditDialogOpen(true)
                                                  }}
                                                  title="Editează echipamentul"
                                                >
                                                  <Pencil className="h-3 w-3" />
                                                  <span className="text-xs">Editează</span>
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  ) : (
                                    <div className="px-4 py-6 text-center">
                                      <Search className="mx-auto mb-2 h-7 w-7 text-muted-foreground opacity-50" />
                                      <p className="text-sm text-muted-foreground">Niciun echipament nu corespunde filtrelor</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="px-4 py-6 text-center">
                                  <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                                  <p className="text-sm text-muted-foreground">Nu există echipamente</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      )
                    })}
                  </Accordion>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-50" />
                    <p className="text-sm font-medium text-muted-foreground mb-4">Nu există locații definite</p>
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adaugă locație
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editează client</DialogTitle>
              <DialogDescription>Actualizează informațiile clientului</DialogDescription>
            </DialogHeader>
            {client && (
              <ClientForm
                mode="edit"
                client={client}
                onSuccess={handleEditSuccess}
                onCancel={handleEditClose}
                initialEquipmentSelection={initialEquipmentSelection}
              />
            )}
          </DialogContent>
        </Dialog>

        {client && migrateContext ? (
          <EquipmentMigrateWizardDialog
            open={migrateWizardOpen}
            onOpenChange={(open) => {
              setMigrateWizardOpen(open)
              if (!open) setMigrateContext(null)
            }}
            sourceClientId={id}
            sourceClientName={client.nume || ""}
            sourceLocationId={migrateContext.sourceLocationId}
            sourceLocationName={migrateContext.sourceLocationName}
            equipmentId={migrateContext.equipmentId}
            equipmentCod={migrateContext.equipmentCod}
            equipmentNume={migrateContext.equipmentNume}
            onSuccess={async () => {
              try {
                const data = await getClientById(id)
                if (data) setClient(data)
              } catch {
                /* ignore */
              }
            }}
          />
        ) : null}
      </DashboardShell>
    </TooltipProvider>
  )
}
