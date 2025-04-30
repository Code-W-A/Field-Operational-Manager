"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import {
  ChevronLeft,
  FileText,
  Pencil,
  Trash2,
  MapPin,
  User,
  Phone,
  Calendar,
  Clock,
  PenToolIcon as Tool,
} from "lucide-react"
import { getLucrareById, deleteLucrare } from "@/lib/firebase/firestore"
import { getClientById } from "@/lib/firebase/clients"
import { getEquipmentsByLocation } from "@/lib/firebase/equipment"
import { TehniciInterventionForm } from "@/components/tehnician-intervention-form"
import { EquipmentVerification } from "@/components/equipment-verification"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"
import type { Equipment } from "@/types/equipment"
import { useStableCallback } from "@/lib/utils/hooks"
import { ContractDisplay } from "@/components/contract-display"

export default function LucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [location, setLocation] = useState<ClientLocation | null>(null)
  const [contactPerson, setContactPerson] = useState<ContactPerson | null>(null)
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("detalii")

  // Încărcăm datele lucrării
  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        const data = await getLucrareById(params.id)
        setLucrare(data)

        if (data) {
          // Încărcăm datele clientului
          if (data.client) {
            try {
              const clientData = await getClientById(data.client)
              setClient(clientData)

              // Încărcăm locația
              if (clientData && data.locatie) {
                const locationData = clientData.locations.find((loc) => loc.id === data.locatie)
                if (locationData) {
                  setLocation(locationData)

                  // Încărcăm persoana de contact
                  if (data.persoanaContact) {
                    const contactPersonData = locationData.contactPersons.find(
                      (person) => person.id === data.persoanaContact,
                    )
                    if (contactPersonData) {
                      setContactPerson(contactPersonData)
                    }
                  }

                  // Încărcăm echipamentul
                  try {
                    const equipmentData = await getEquipmentsByLocation(data.locatie)
                    if (equipmentData.length > 0) {
                      setEquipment(equipmentData[0]) // Presupunem că primul echipament este cel asociat lucrării
                    }
                  } catch (error) {
                    console.error("Eroare la încărcarea echipamentului:", error)
                  }
                }
              }
            } catch (error) {
              console.error("Eroare la încărcarea clientului:", error)
            }
          }
        }
      } catch (error) {
        console.error("Eroare la încărcarea lucrării:", error)
        toast({
          title: "Eroare",
          description: "Nu s-a putut încărca lucrarea.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchLucrare()
  }, [params.id])

  // Verificăm dacă tehnicianul are acces la această lucrare
  useEffect(() => {
    if (
      !loading &&
      lucrare &&
      userData?.role === "tehnician" &&
      userData?.displayName &&
      !lucrare.tehnicieni.includes(userData.displayName)
    ) {
      // Tehnicianul nu este alocat la această lucrare, redirecționăm la dashboard
      toast({
        title: "Acces restricționat",
        description: "Nu aveți acces la această lucrare.",
        variant: "destructive",
      })
      router.push("/dashboard")
    }
  }, [loading, lucrare, userData, router])

  // Funcție pentru a șterge o lucrare
  const handleDeleteLucrare = useStableCallback(async () => {
    if (!lucrare?.id) return

    try {
      await deleteLucrare(lucrare.id)
      toast({
        title: "Lucrare ștearsă",
        description: "Lucrarea a fost ștearsă cu succes.",
      })
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la ștergerea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la ștergerea lucrării.",
        variant: "destructive",
      })
    }
  })

  // Funcție pentru a edita lucrarea
  const handleEdit = useCallback(() => {
    if (!lucrare?.id) return
    router.push(`/dashboard/lucrari/${lucrare.id}/edit`)
  }, [router, lucrare])

  // Funcție pentru a genera raportul
  const handleGenerateReport = useCallback(() => {
    if (!lucrare?.id) {
      console.error("ID-ul lucrării lipsește:", lucrare)
      toast({
        title: "Eroare",
        description: "ID-ul lucrării nu este valid",
        variant: "destructive",
      })
      return
    }

    router.push(`/raport/${lucrare.id}`)
  }, [router, lucrare])

  // Funcție pentru a reîncărca datele lucrării
  const refreshLucrare = useStableCallback(async () => {
    try {
      const data = await getLucrareById(params.id)
      setLucrare(data)
    } catch (error) {
      console.error("Eroare la reîncărcarea lucrării:", error)
    }
  })

  // Funcție pentru a verifica echipamentul
  const handleEquipmentVerification = (verifiedEquipment: Equipment) => {
    toast({
      title: "Echipament verificat",
      description: "Echipamentul a fost verificat cu succes.",
    })
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Se încarcă..." text="Vă rugăm așteptați" />
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </DashboardShell>
    )
  }

  if (!lucrare) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Lucrare negăsită" text="Lucrarea nu a fost găsită în sistem" />
        <Button onClick={() => router.push("/dashboard/lucrari")}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi la lucrări
        </Button>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader heading={`Lucrare: ${lucrare.tipLucrare}`} text={`Client: ${client?.name || lucrare.client}`}>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/lucrari")}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          <Button onClick={handleGenerateReport}>
            <FileText className="mr-2 h-4 w-4" /> Generează raport
          </Button>
        </div>
      </DashboardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-3">
          <TabsTrigger value="detalii">Detalii Lucrare</TabsTrigger>
          <TabsTrigger value="echipament">Echipament</TabsTrigger>
          {role === "tehnician" && <TabsTrigger value="interventie">Intervenție</TabsTrigger>}
        </TabsList>

        <TabsContent value="detalii" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Detalii lucrare</CardTitle>
                <CardDescription>Informații despre lucrare</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Data emiterii:</p>
                      <p className="text-sm text-gray-500">{lucrare.dataEmiterii}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Data intervenție:</p>
                      <p className="text-sm text-gray-500">{lucrare.dataInterventie}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Tool className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Tip lucrare:</p>
                    <p className="text-sm text-gray-500">{lucrare.tipLucrare}</p>
                  </div>
                </div>
                {lucrare.tipLucrare === "Intervenție în contract" && (
                  <div className="flex items-start space-x-2">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Contract:</p>
                      <ContractDisplay contractId={lucrare.contract} />
                    </div>
                  </div>
                )}
                {lucrare.defectReclamat && (
                  <div className="flex items-start space-x-2">
                    <Tool className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Defect reclamat:</p>
                      <p className="text-sm text-gray-500">{lucrare.defectReclamat}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start space-x-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Locație:</p>
                    <p className="text-sm text-gray-500">
                      {location ? `${location.name} (${location.address}, ${location.city})` : lucrare.locatie}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Descriere:</p>
                    <p className="text-sm text-gray-500">{lucrare.descriere || "Fără descriere"}</p>
                  </div>
                </div>
                {lucrare.descriereInterventie && (
                  <div className="flex items-start space-x-2">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Descriere intervenție:</p>
                      <p className="text-sm text-gray-500">{lucrare.descriereInterventie}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start space-x-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Status lucrare:</p>
                    <Badge
                      variant={
                        lucrare.statusLucrare.toLowerCase() === "în așteptare"
                          ? "warning"
                          : lucrare.statusLucrare.toLowerCase() === "în curs"
                            ? "default"
                            : "success"
                      }
                    >
                      {lucrare.statusLucrare}
                    </Badge>
                  </div>
                </div>
                {role !== "tehnician" && (
                  <div className="flex items-start space-x-2">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Status facturare:</p>
                      <Badge
                        variant={
                          lucrare.statusFacturare.toLowerCase() === "nefacturat"
                            ? "outline"
                            : lucrare.statusFacturare.toLowerCase() === "facturat"
                              ? "default"
                              : "success"
                        }
                      >
                        {lucrare.statusFacturare}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informații client</CardTitle>
                <CardDescription>Detalii despre client și persoana de contact</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Client:</p>
                    <p className="text-sm text-gray-500">
                      {client ? `${client.name} ${client.cif ? `(CIF: ${client.cif})` : ""}` : lucrare.client}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Persoană contact:</p>
                    <p className="text-sm text-gray-500">
                      {contactPerson ? `${contactPerson.name} (${contactPerson.position})` : lucrare.persoanaContact}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Telefon:</p>
                    <p className="text-sm text-gray-500">{contactPerson ? contactPerson.phone : lucrare.telefon}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start space-x-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Tehnicieni asignați:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {lucrare.tehnicieni.map((tehnician, index) => (
                        <Badge key={index} variant="secondary">
                          {tehnician}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                {(role === "admin" || role === "dispecer") && (
                  <Button variant="outline" onClick={handleEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Editează
                  </Button>
                )}
                {role === "admin" && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Sigur doriți să ștergeți această lucrare?")) {
                        handleDeleteLucrare()
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Șterge
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="echipament" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Detalii echipament</CardTitle>
                <CardDescription>Informații despre echipamentul asociat lucrării</CardDescription>
              </CardHeader>
              <CardContent>
                {equipment ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{equipment.name}</h3>
                      <Badge variant={equipment.status === "active" ? "success" : "destructive"}>
                        {equipment.status === "active" ? "Activ" : "Inactiv"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Cod:</p>
                        <p className="text-sm text-gray-500">{equipment.code}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Model:</p>
                        <p className="text-sm text-gray-500">{equipment.model}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Serie:</p>
                        <p className="text-sm text-gray-500">{equipment.serialNumber}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Locație:</p>
                        <p className="text-sm text-gray-500">{location?.name || "Necunoscută"}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40">
                    <p className="text-muted-foreground">Nu există informații despre echipament.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            {equipment && role === "tehnician" && (
              <EquipmentVerification equipment={equipment} onVerification={handleEquipmentVerification} />
            )}
          </div>
        </TabsContent>

        {role === "tehnician" && (
          <TabsContent value="interventie" className="mt-4">
            <TehniciInterventionForm
              lucrareId={lucrare.id!}
              initialData={{
                descriereInterventie: lucrare.descriereInterventie,
                statusLucrare: lucrare.statusLucrare,
              }}
              onUpdate={refreshLucrare}
            />
          </TabsContent>
        )}
      </Tabs>
    </DashboardShell>
  )
}
