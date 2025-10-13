"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ArrowLeft, Pencil, Trash2, MapPin, Wrench, Calendar, Clock, FileText } from "lucide-react"
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import { getClientById, deleteClient, type Client } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import type { Lucrare } from "@/lib/firebase/firestore"
import { orderBy } from "firebase/firestore"
import { ClientContractsManager } from "@/components/client-contracts-manager"
// Adăugăm importul pentru componenta EquipmentQRCode
import { EquipmentQRCode } from "@/components/equipment-qr-code"
import { formatDate } from "@/lib/utils/time-format"

// Importăm hook-ul useClientLucrari pentru a putea actualiza datele
import { useClientLucrari } from "@/hooks/use-client-lucrari"

// Funcție utilitar pentru a extrage CUI-ul indiferent de cum este salvat
const extractCUI = (client: any) => {
  return client?.cui || client?.cif || client?.CIF || client?.CUI || "N/A"
}

export default function ClientPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Obținem lucrările pentru acest client
  const { data: toateLucrarile } = useFirebaseCollection<Lucrare>("lucrari", [orderBy("dataEmiterii", "desc")])
  const [lucrariClient, setLucrariClient] = useState<Lucrare[]>([])

  // Adăugăm hook-ul în componenta ClientPage
  const { refreshData } = useClientLucrari()

  useEffect(() => {
    const fetchClient = async () => {
      try {
        setLoading(true)
        const data = await getClientById(params.id)
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
  }, [params.id])

  // Filtrăm lucrările pentru acest client
  useEffect(() => {
    if (client && toateLucrarile.length > 0) {
      const lucrari = toateLucrarile.filter((lucrare) => lucrare.client === client.nume)
      setLucrariClient(lucrari)
    }
  }, [client, toateLucrarile])

  // Modificăm funcția handleEdit pentru a reîmprospăta datele
  const handleEdit = () => {
    router.push(`/dashboard/clienti?edit=${params.id}`)
  }

  // Modificăm funcția handleDelete pentru a reîmprospăta datele
  const handleDelete = async () => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți acest client?")) {
      try {
        await deleteClient(params.id)
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="absolute left-4" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-full text-center">
              <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700">Detalii Client</CardTitle>
              <CardDescription>Informații complete despre client</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{client?.nume}</h2>
              <p className="text-muted-foreground">{client?.adresa}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">
                Număr lucrări: <span className="font-bold">{lucrariClient.length}</span>
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-medium text-gray-500">Telefon Principal</h3>
              <p>{client?.telefon || "N/A"}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-500">Reprezentant Firmă</h3>
              <p>
                {client?.reprezentantFirma || "N/A"}
                {client?.functieReprezentant ? `, ${client.functieReprezentant}` : ""}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-500">Email</h3>
              <p>{client?.email || "N/A"}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-500">CUI/CIF</h3>
              <p>{(client as any)?.cif || "N/A"}</p>
            </div>
            {(userData?.role === "admin" || userData?.role === "dispecer") && (
              <div>
                <h3 className="font-medium text-gray-500">Nr. ordine ONRC</h3>
                <p>{(client as any)?.regCom || "N/A"}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Secțiunea pentru locații și echipamente */}
          <div>
            <h3 className="font-medium text-gray-500 mb-4">Locații și Echipamente</h3>
            {client?.locatii && client.locatii.length > 0 ? (
              <Accordion type="multiple" className="w-full">
                {client.locatii.map((locatie, index) => (
                  <AccordionItem key={index} value={`locatie-${index}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">{locatie.nume}</span>
                        <Badge variant="secondary" className="ml-2">
                          {locatie.echipamente?.length || 0} echipamente
                        </Badge>
                        {locatie.persoaneContact && locatie.persoaneContact.length > 0 && (
                          <Badge variant="outline" className="ml-1">
                            {locatie.persoaneContact.length} contacte
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-6">
                        {/* Informații despre locație */}
                        <Card className="border-l-4 border-l-blue-500">
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-3">
                              <MapPin className="h-4 w-4 text-blue-600" />
                              <h4 className="font-medium">Informații Locație</h4>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="text-sm font-medium text-gray-600">Nume:</p>
                                <p className="text-sm">{locatie.nume}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-600">Adresă:</p>
                                <p className="text-sm">{locatie.adresa || "Nespecificat"}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Persoane de contact */}
                        {locatie.persoaneContact && locatie.persoaneContact.length > 0 && (
                          <Card className="border-l-4 border-l-green-500">
                            <CardContent className="pt-4">
                              <div className="flex items-center gap-2 mb-3">
                                <FileText className="h-4 w-4 text-green-600" />
                                <h4 className="font-medium">Persoane de Contact</h4>
                                <Badge variant="secondary">{locatie.persoaneContact.length}</Badge>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                {locatie.persoaneContact.map((persoana, contactIndex) => (
                                  <div key={contactIndex} className="p-3 border rounded-md bg-gray-50">
                                    <div className="space-y-2">
                                      <p className="font-medium text-sm">{persoana.nume}</p>
                                      {persoana.telefon && (
                                        <div className="flex items-center gap-1 text-xs text-gray-600">
                                          <span>📞</span>
                                          <span>{persoana.telefon}</span>
                                        </div>
                                      )}
                                      {persoana.email && (
                                        <div className="flex items-center gap-1 text-xs text-gray-600">
                                          <span>✉️</span>
                                          <span className="break-all">{persoana.email}</span>
                                        </div>
                                      )}
                                      {persoana.functie && (
                                        <Badge variant="outline" className="text-xs">
                                          {persoana.functie}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Echipamente */}
                        <Card className="border-l-4 border-l-purple-500">
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Wrench className="h-4 w-4 text-purple-600" />
                              <h4 className="font-medium">Echipamente</h4>
                              <Badge variant="secondary">{locatie.echipamente?.length || 0}</Badge>
                            </div>
                            
                            {locatie.echipamente && locatie.echipamente.length > 0 ? (
                              <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                                {locatie.echipamente.map((echipament, echipamentIndex) => {
                                  // Calculăm informațiile de garanție pentru fiecare echipament
                                  const warrantyInfo = getWarrantyDisplayInfo(echipament);
                                  
                                  return (
                                    <div key={echipamentIndex} className="p-4 border rounded-lg bg-white shadow-sm">
                                      {/* Header echipament */}
                                      <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 mb-2">
                                            <Wrench className="h-4 w-4 text-purple-600" />
                                            <h5 className="font-medium text-sm">{echipament.nume}</h5>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            <Badge variant="outline" className="bg-purple-50 text-purple-800">
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
                                          <div className="p-2 bg-gray-50 rounded text-xs space-y-1">
                                            {(echipament.dataInstalarii || echipament.dataInstalare) && (
                                              <div className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3 text-blue-600" />
                                                <span className="font-medium">Instalat:</span>
                                                <span>{formatDate(echipament.dataInstalarii || echipament.dataInstalare!)}</span>
                                              </div>
                                            )}
                                            {echipament.ultimaInterventie && (
                                              <div className="flex items-center gap-1">
                                                <Clock className="h-3 w-3 text-green-600" />
                                                <span className="font-medium">Ultima intervenție:</span>
                                                <span>{formatDate(echipament.ultimaInterventie)}</span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Informații garanție */}
                                        {warrantyInfo.hasWarrantyData && (
                                          <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded border">
                                            <div className="flex items-center gap-2 mb-2">
                                              <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                                                <span className="text-white text-xs font-bold">G</span>
                                              </div>
                                              <span className="font-medium text-xs text-blue-900">Informații Garanție</span>
                                              <Badge className={warrantyInfo.statusBadgeClass + " text-xs"}>
                                                {warrantyInfo.statusText}
                                              </Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                              <div>
                                                <span className="text-gray-600">Garanție:</span>
                                                <span className="ml-1">{warrantyInfo.warrantyMonths} luni</span>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Expiră:</span>
                                                <span className="ml-1">{warrantyInfo.warrantyExpires}</span>
                                              </div>
                                              <div className="col-span-2">
                                                <span className="text-gray-600">Zile rămase:</span>
                                                <span className={`ml-1 font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                                                  {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                                                </span>
                                              </div>
                                            </div>
                                            {!warrantyInfo.hasExplicitWarranty && (
                                              <div className="mt-2 p-2 bg-yellow-100 border border-yellow-200 rounded">
                                                <p className="text-xs text-yellow-800">
                                                  ⚠️ Garanție implicită (12 luni) - nu a fost setată explicit
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Observații */}
                                        {echipament.observatii && (
                                          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                                            <div className="flex items-start gap-1">
                                              <FileText className="h-3 w-3 text-yellow-600 mt-0.5" />
                                              <div>
                                                <span className="font-medium text-xs text-yellow-800">Observații:</span>
                                                <p className="text-xs text-yellow-700 mt-1">{echipament.observatii}</p>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                        {/* Butoane QR Code și Print */}
                                        <div className="flex items-center justify-center pt-3 border-t">
                                          <EquipmentQRCode
                                            equipment={echipament}
                                            clientName={client?.nume || ""}
                                            locationName={locatie.nume}
                                            useSimpleFormat={true} // Format simplu pentru scanare mai ușoară
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500">
                                <Wrench className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Nu există echipamente definite pentru această locație</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nu există locații definite pentru acest client</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Secțiunea pentru contracte */}
          <div>
            <ClientContractsManager 
              clientId={params.id}
              clientName={client?.nume || ""}
              onContractsChange={() => {
                // Opțional: reîncărcăm datele clientului sau facem alte actualizări
                console.log("Contractele au fost actualizate")
              }}
            />
          </div>

          <Separator />

          <div>
            <h3 className="font-medium text-gray-500 mb-2">Lucrări recente</h3>
            {lucrariClient.length > 0 ? (
              <div className="space-y-2">
                {lucrariClient.slice(0, 5).map((lucrare) => (
                  <div key={lucrare.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{lucrare.tipLucrare}</p>
                      <p className="text-sm text-gray-500">Data: {lucrare.dataInterventie}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/lucrari/${lucrare.id}`)}>
                      Detalii
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Nu există lucrări pentru acest client.</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Înapoi
          </Button>
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editează</TooltipContent>
            </Tooltip>
            {userData?.role === "admin" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" size="icon" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Șterge</TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
    </TooltipProvider>
  )
}
