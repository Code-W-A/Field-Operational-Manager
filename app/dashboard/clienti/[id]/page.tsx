"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ArrowLeft, ArrowRightLeft, Pencil, Trash2, MapPin, Wrench, Calendar, Clock, FileText, Building2, Phone, Mail, User, Hash, FileCheck, TrendingUp, Plus, AlertCircle } from "lucide-react"
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import { getClientById, deleteClient, type Client } from "@/lib/firebase/firestore"
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

  return (
    <TooltipProvider>
      <DashboardShell>
        <DashboardHeader
          heading={
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-base text-muted-foreground">Client</span>
              <span className="text-lg font-semibold">{client?.nume}</span>
            </span>
          }
          text={client?.adresa || "Detalii client"}
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
            </Button>
            <Button variant="outline" onClick={handleEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Editează
            </Button>
            {userData?.role === "admin" && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Șterge
              </Button>
            )}
          </div>
        </DashboardHeader>

        <div className="space-y-8 pb-12">
          {/* 1. Detalii despre client */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">Detalii despre client</h2>
                  <Badge variant="secondary" className="ml-auto">
                    CUI: {extractCUI(client)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Informații generale și date de contact</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Contact & Reprezentant */}
              <Card className="lg:col-span-2">
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Contact & Reprezentant</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Telefon principal</p>
                          <p className="font-medium">{client?.telefon || "N/A"}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Email</p>
                          <p className="font-medium break-words">{client?.email || "N/A"}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Reprezentant firmă</p>
                        <p className="font-medium">
                          {client?.reprezentantFirma || "N/A"}
                        </p>
                        {client?.functieReprezentant && (
                          <Badge variant="outline" className="mt-1">
                            {client.functieReprezentant}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <FileCheck className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">CUI/CIF</p>
                        <p className="font-medium font-mono">{(client as any)?.cif || "N/A"}</p>
                      </div>
                    </div>

                    {(userData?.role === "admin" || userData?.role === "dispecer") && (
                      <div className="flex items-start gap-3">
                        <Hash className="h-4 w-4 text-muted-foreground mt-1" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Nr. ordine ONRC</p>
                          <p className="font-medium font-mono">{(client as any)?.regCom || "N/A"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Statistici & Lucrări recente */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm">Statistici</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Număr lucrări</span>
                        <span className="text-lg font-semibold">{lucrariClient.length}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Locații</span>
                        <span className="text-lg font-semibold">{client?.locatii?.length || 0}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Echipamente</span>
                        <span className="text-lg font-semibold">{client?.locatii?.reduce((sum, loc) => sum + (loc.echipamente?.length || 0), 0) || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm">Ultimele tichete</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    {lucrariClient.length > 0 ? (
                      <div className="space-y-2">
                        {lucrariClient.slice(0, 3).map((lucrare) => (
                          <div
                            key={lucrare.id}
                            className="group rounded-lg border p-3 hover:bg-muted transition-all cursor-pointer"
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
                            className="w-full mt-2"
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
                      <p className="text-sm text-center text-muted-foreground py-4">
                        Nu există lucrări
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* 2. Locații și echipamente */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold tracking-tight">Locații și echipamente</h2>
                <p className="text-sm text-muted-foreground">
                  {client?.locatii?.length || 0} {(client?.locatii?.length || 0) === 1 ? 'locație' : 'locații'} • {' '}
                  {client?.locatii?.reduce((sum, loc) => sum + (loc.echipamente?.length || 0), 0) || 0} echipamente
                </p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6">
                {client?.locatii && client.locatii.length > 0 ? (
                  <Accordion type="multiple" className="w-full space-y-2">
                    {client.locatii.map((locatie, index) => (
                      <AccordionItem key={index} value={`locatie-${index}`} className="border rounded-lg px-4">
                        <AccordionTrigger className="hover:no-underline py-4">
                          <div className="flex items-center gap-3 flex-1">
                            <MapPin className="h-5 w-5 text-muted-foreground" />
                            <div className="flex-1 text-left">
                              <span className="font-semibold text-base">{locatie.nume}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {locatie.echipamente?.length || 0} echipamente
                                </Badge>
                                {locatie.persoaneContact && locatie.persoaneContact.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {locatie.persoaneContact.length} contacte
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-4 pb-4">
                          <div className="space-y-4">
                            {/* Informații despre locație */}
                            <div className="rounded-lg p-4 border bg-muted/50">
                              <div className="flex items-center gap-2 mb-3">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-sm">Informații Locație</h4>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
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
                              <div className="rounded-lg p-4 border bg-muted/50">
                                <div className="flex items-center gap-2 mb-4">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <h4 className="font-semibold text-sm">Persoane de Contact</h4>
                                  <Badge variant="secondary" className="ml-auto">{locatie.persoaneContact.length}</Badge>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                  {locatie.persoaneContact.map((persoana, contactIndex) => (
                                    <div key={contactIndex} className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                      <div className="space-y-2">
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

                            {/* Echipamente */}
                            <div className="rounded-lg p-4 border bg-muted/50">
                              <div className="flex items-center gap-2 mb-4">
                                <Wrench className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-sm">Echipamente</h4>
                                <Badge variant="secondary" className="ml-auto">{locatie.echipamente?.length || 0}</Badge>
                              </div>
                              
                              {locatie.echipamente && locatie.echipamente.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                                    {locatie.echipamente.map((echipament, echipamentIndex) => {
                                      // Calculăm informațiile de garanție pentru fiecare echipament
                                      const warrantyInfo = getWarrantyDisplayInfo(echipament);
                                      
                                      return (
                                        <div key={echipamentIndex} className="group relative p-4 border rounded-lg bg-card hover:bg-muted/50 transition-all">
                                          {/* Header echipament */}
                                          <div className="flex items-start justify-between gap-2 mb-4">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Wrench className="h-4 w-4 text-muted-foreground" />
                                                <h5 className="font-semibold text-sm">{echipament.nume}</h5>
                                              </div>
                                              <div className="flex flex-wrap gap-1.5">
                                                <Badge variant="outline" className="text-xs">
                                                  Cod: {echipament.cod}
                                                </Badge>
                                                {echipament.status && (
                                                  <Badge variant="secondary" className="text-xs">
                                                    {echipament.status}
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {/* Detalii echipament */}
                                          <div className="space-y-3">
                                            {/* Informații de bază */}
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                              {echipament.model && (
                                                <div>
                                                  <span className="font-medium text-gray-600">Model:</span>
                                                  <p className="text-gray-900">{echipament.model}</p>
                                                </div>
                                              )}
                                              {echipament.serie && (
                                                <div>
                                                  <span className="font-medium text-gray-600">Serie:</span>
                                                  <p className="text-gray-900">{echipament.serie}</p>
                                                </div>
                                              )}
                                            </div>

                                            {/* Date importante */}
                                            {(echipament.dataInstalarii || echipament.dataInstalare || echipament.ultimaInterventie) && (
                                              <div className="p-3 bg-muted rounded-lg border text-xs space-y-2">
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
                                              <div className="p-3 bg-muted rounded-lg border">
                                                <div className="flex items-center gap-2 mb-3">
                                                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                                    <span className="text-white text-xs font-bold">G</span>
                                                  </div>
                                                  <span className="font-medium text-sm">Informații Garanție</span>
                                                  <Badge className={warrantyInfo.statusBadgeClass + " text-xs ml-auto"}>
                                                    {warrantyInfo.statusText}
                                                  </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 text-xs">
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
                                                    <span className={`font-semibold ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                                                      {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                                                    </span>
                                                  </div>
                                                </div>
                                                {!warrantyInfo.hasExplicitWarranty && (
                                                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
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
                                              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                <div className="flex items-start gap-2">
                                                  <FileText className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                                                  <div className="flex-1">
                                                    <span className="font-medium text-xs block mb-1">Observații</span>
                                                    <p className="text-xs text-muted-foreground leading-relaxed">{echipament.observatii}</p>
                                                  </div>
                                                </div>
                                              </div>
                                            )}

                                            {/* Audit etichetă QR */}
                                            <div className="p-3 bg-muted rounded-lg border text-xs">
                                              <div className="flex items-center gap-2">
                                                <span className="font-medium text-muted-foreground">Ultima etichetă printată:</span>
                                                <span className="font-medium">
                                                  {(echipament as any).lastQrPrintedAt
                                                    ? `${formatDateTimeSafe((echipament as any).lastQrPrintedAt)} de ${String((echipament as any).lastQrPrintedBy || "-")}`
                                                    : "—"}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Butoane QR Code și Editare echipament */}
                                            <div className="flex flex-col gap-2 pt-3 mt-3 border-t sm:flex-row sm:items-center sm:justify-between">
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
                                              <div className="flex flex-wrap items-center justify-end gap-2">
                                                {userData?.role === "admin" && (echipament as any).id ? (
                                                  <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="gap-2"
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
                                                  className="gap-2"
                                                  onClick={() => {
                                                    setInitialEquipmentSelection({
                                                      locationIndex: index,
                                                      equipmentIndex: echipamentIndex,
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
                                  <div className="text-center py-8 px-4">
                                    <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                                    <p className="text-sm text-muted-foreground">Nu există echipamente</p>
                                  </div>
                                )}
                              </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="text-center py-12 px-4">
                    <MapPin className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
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

          {/* 3. Contracte atribuite */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold tracking-tight">Contracte atribuite</h2>
                <p className="text-sm text-muted-foreground">Gestionare contracte și prețuri</p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6">
                <ClientContractsManager 
                  clientId={id}
                  clientName={client?.nume || ""}
                  onContractsChange={() => {
                    // Opțional: reîncărcăm datele clientului sau facem alte actualizări
                    console.log("Contractele au fost actualizate")
                  }}
                />
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
