"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { getLucrareById } from "@/lib/firebase/firestore"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TehnicieniInterventionForm } from "@/components/tehnician-intervention-form"
import { EquipmentQRManager } from "@/components/equipment-qr-manager"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2, AlertCircle, ArrowLeft, FileText, FileCheck } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export default function LucrareDetailsPage({ params }) {
  const router = useRouter()
  const { userData } = useAuth()
  const [lucrare, setLucrare] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState("detalii")
  const [clientData, setClientData] = useState(null)
  const [equipmentData, setEquipmentData] = useState(null)
  const [contractData, setContractData] = useState(null)
  const isTechnician = userData?.role === "tehnician"

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setLoading(true)
        const lucrareData = await getLucrareById(params.id)

        if (!lucrareData) {
          setError("Lucrarea nu a fost găsită")
          setLoading(false)
          return
        }

        setLucrare(lucrareData)

        // Verificăm dacă utilizatorul este tehnician și lucrarea are raport generat
        if (isTechnician && lucrareData.hasGeneratedReport) {
          // Redirecționăm către lista de lucrări cu un mesaj
          toast({
            title: "Acces restricționat",
            description: "Această lucrare a fost finalizată și transferată către dispecer.",
            variant: "destructive",
          })
          router.push("/dashboard/lucrari")
          return
        }

        // Încărcăm datele clientului
        if (lucrareData.client) {
          const clientRef = doc(db, "clients", lucrareData.client)
          const clientSnap = await getDoc(clientRef)
          if (clientSnap.exists()) {
            setClientData(clientSnap.data())
          }
        }

        // Încărcăm datele contractului dacă există
        if (lucrareData.contract) {
          const contractRef = doc(db, "contracts", lucrareData.contract)
          const contractSnap = await getDoc(contractRef)
          if (contractSnap.exists()) {
            setContractData(contractSnap.data())
          }
        }

        // Încărcăm datele echipamentului dacă există
        if (lucrareData.echipament) {
          const equipmentRef = doc(db, "equipment", lucrareData.echipament)
          const equipmentSnap = await getDoc(equipmentRef)
          if (equipmentSnap.exists()) {
            setEquipmentData(equipmentSnap.data())
          }
        }
      } catch (err) {
        console.error("Eroare la încărcarea lucrării:", err)
        setError("A apărut o eroare la încărcarea lucrării")
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchLucrare()
    }
  }, [params.id, router, isTechnician])

  const handleGenerateReport = () => {
    router.push(`/raport/${params.id}`)
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "listată":
        return "bg-gray-100 text-gray-800"
      case "atribuită":
        return "bg-yellow-100 text-yellow-800"
      case "în lucru":
        return "bg-blue-100 text-blue-800"
      case "finalizată":
        return "bg-green-100 text-green-800"
      case "în așteptare":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getFacturaColor = (status) => {
    switch (status?.toLowerCase()) {
      case "facturat":
        return "bg-green-100 text-green-800"
      case "nefacturat":
        return "bg-red-100 text-red-800"
      case "nu se facturează":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii lucrare" text="Încărcare...">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
        </DashboardHeader>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă datele lucrării...</span>
        </div>
      </DashboardShell>
    )
  }

  if (error) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii lucrare" text="Eroare">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
        </DashboardHeader>
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Eroare</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </DashboardShell>
    )
  }

  if (!lucrare) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii lucrare" text="Lucrarea nu a fost găsită">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
        </DashboardHeader>
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Eroare</AlertTitle>
          <AlertDescription>Lucrarea nu a fost găsită</AlertDescription>
        </Alert>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading={`Lucrare: ${lucrare.client}`}
        text={`Detalii despre lucrarea pentru ${lucrare.locatie}`}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          <Button onClick={handleGenerateReport}>
            <FileText className="mr-2 h-4 w-4" /> Generează raport
          </Button>
        </div>
      </DashboardHeader>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Informații generale</CardTitle>
                <CardDescription>Detalii despre lucrare</CardDescription>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(lucrare.statusLucrare)}>{lucrare.statusLucrare}</Badge>
                  {!isTechnician && (
                    <Badge className={getFacturaColor(lucrare.statusFacturare)}>{lucrare.statusFacturare}</Badge>
                  )}
                  {lucrare.hasGeneratedReport && (
                    <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                      <FileCheck className="h-3 w-3" />
                      Raport generat
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {lucrare.tipLucrare}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Client</h3>
                <p className="text-base">{lucrare.client}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Locație</h3>
                <p className="text-base">{lucrare.locatie}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Data emiterii</h3>
                <p className="text-base">{lucrare.dataEmiterii}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Data intervenție</h3>
                <p className="text-base">{lucrare.dataInterventie}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Persoană contact</h3>
                <p className="text-base">{lucrare.persoanaContact || "-"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Telefon</h3>
                <p className="text-base">{lucrare.telefon || "-"}</p>
              </div>
              {lucrare.tipLucrare === "Intervenție în contract" && contractData && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500">Contract</h3>
                  <p className="text-base">
                    {contractData.number} ({contractData.startDate} - {contractData.endDate})
                  </p>
                </div>
              )}
              {lucrare.defectReclamat && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500">Defect reclamat</h3>
                  <p className="text-base">{lucrare.defectReclamat}</p>
                </div>
              )}
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500">Descriere</h3>
                <p className="text-base whitespace-pre-line">{lucrare.descriere}</p>
              </div>
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500">Tehnicieni</h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {lucrare.tehnicieni.map((tehnician, index) => (
                    <Badge key={index} variant="secondary" className="bg-gray-100">
                      {tehnician}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="detalii">Detalii client</TabsTrigger>
            <TabsTrigger value="echipament">Verificare echipament</TabsTrigger>
            <TabsTrigger value="interventie">Intervenție</TabsTrigger>
          </TabsList>
          <TabsContent value="detalii">
            <Card>
              <CardHeader>
                <CardTitle>Detalii client</CardTitle>
                <CardDescription>Informații despre client și locație</CardDescription>
              </CardHeader>
              <CardContent>
                {clientData ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Nume client</h3>
                      <p className="text-base">{clientData.name}</p>
                    </div>
                    {clientData.cui && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">CUI</h3>
                        <p className="text-base">{clientData.cui}</p>
                      </div>
                    )}
                    {clientData.regCom && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Reg. Com.</h3>
                        <p className="text-base">{clientData.regCom}</p>
                      </div>
                    )}
                    {clientData.address && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Adresă</h3>
                        <p className="text-base">{clientData.address}</p>
                      </div>
                    )}
                    {clientData.city && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Oraș</h3>
                        <p className="text-base">{clientData.city}</p>
                      </div>
                    )}
                    {clientData.county && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Județ</h3>
                        <p className="text-base">{clientData.county}</p>
                      </div>
                    )}
                    {clientData.email && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Email</h3>
                        <p className="text-base">{clientData.email}</p>
                      </div>
                    )}
                    {clientData.phone && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Telefon</h3>
                        <p className="text-base">{clientData.phone}</p>
                      </div>
                    )}
                    {clientData.contactPerson && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Persoană contact</h3>
                        <p className="text-base">{clientData.contactPerson}</p>
                      </div>
                    )}
                    {clientData.notes && (
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-gray-500">Note</h3>
                        <p className="text-base whitespace-pre-line">{clientData.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Nu sunt disponibile informații detaliate despre client.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="echipament">
            <Card>
              <CardHeader>
                <CardTitle>Verificare echipament</CardTitle>
                <CardDescription>Informații despre echipamentul asociat lucrării</CardDescription>
              </CardHeader>
              <CardContent>
                {lucrare.echipament ? (
                  equipmentData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Nume echipament</h3>
                        <p className="text-base">{equipmentData.name}</p>
                      </div>
                      {equipmentData.model && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Model</h3>
                          <p className="text-base">{equipmentData.model}</p>
                        </div>
                      )}
                      {equipmentData.serialNumber && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Număr serie</h3>
                          <p className="text-base">{equipmentData.serialNumber}</p>
                        </div>
                      )}
                      {equipmentData.category && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Categorie</h3>
                          <p className="text-base">{equipmentData.category}</p>
                        </div>
                      )}
                      {equipmentData.manufacturer && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Producător</h3>
                          <p className="text-base">{equipmentData.manufacturer}</p>
                        </div>
                      )}
                      {equipmentData.installDate && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Data instalării</h3>
                          <p className="text-base">{equipmentData.installDate}</p>
                        </div>
                      )}
                      {equipmentData.warrantyEnd && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Sfârșitul garanției</h3>
                          <p className="text-base">{equipmentData.warrantyEnd}</p>
                        </div>
                      )}
                      {equipmentData.lastMaintenance && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Ultima mentenanță</h3>
                          <p className="text-base">{equipmentData.lastMaintenance}</p>
                        </div>
                      )}
                      {equipmentData.nextMaintenance && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Următoarea mentenanță</h3>
                          <p className="text-base">{equipmentData.nextMaintenance}</p>
                        </div>
                      )}
                      {equipmentData.status && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Status</h3>
                          <p className="text-base">{equipmentData.status}</p>
                        </div>
                      )}
                      {equipmentData.notes && (
                        <div className="md:col-span-2">
                          <h3 className="text-sm font-medium text-gray-500">Note</h3>
                          <p className="text-base whitespace-pre-line">{equipmentData.notes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500">Se încarcă informațiile despre echipament...</p>
                  )
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-500">
                      Nu există un echipament asociat acestei lucrări. Puteți scana un cod QR pentru a asocia un
                      echipament.
                    </p>
                    <EquipmentQRManager
                      lucrareId={lucrare.id}
                      onEquipmentAssociated={(equipment) => {
                        setEquipmentData(equipment)
                        toast({
                          title: "Echipament asociat",
                          description: `Echipamentul ${equipment.name} a fost asociat cu succes lucrării.`,
                          variant: "default",
                        })
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="interventie">
            <TehnicieniInterventionForm lucrareId={lucrare.id} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  )
}
