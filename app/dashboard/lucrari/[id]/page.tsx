"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { getLucrareById } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2, ArrowLeft, FileText, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"

export default function LucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const [lucrare, setLucrare] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isTechnician = userData?.role === "tehnician"

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setLoading(true)
        const data = await getLucrareById(params.id)

        if (!data) {
          setError("Lucrarea nu a fost găsită")
          setLoading(false)
          return
        }

        // Verificăm dacă utilizatorul este tehnician și lucrarea este finalizată
        if (isTechnician && data.statusLucrare === "Finalizată") {
          // Tehnicianul nu mai are acces la lucrările finalizate
          setError("Nu mai aveți acces la această lucrare deoarece a fost finalizată")
          setLoading(false)

          // Afișăm un toast și redirecționăm către lista de lucrări
          toast({
            title: "Acces restricționat",
            description: "Lucrarea a fost finalizată și nu mai este disponibilă pentru vizualizare",
            variant: "destructive",
          })

          // Redirecționăm după un scurt delay pentru a permite utilizatorului să vadă mesajul
          setTimeout(() => {
            router.push("/dashboard/lucrari")
          }, 2000)

          return
        }

        setLucrare(data)
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
  }, [params.id, router, userData, isTechnician])

  const handleBack = () => {
    router.push("/dashboard/lucrari")
  }

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

  const getTipLucrareColor = (tip) => {
    switch (tip?.toLowerCase()) {
      case "contra cost":
        return "bg-red-50 text-red-700 border-red-200"
      case "în garanție":
        return "bg-yellow-50 text-yellow-700 border-yellow-200"
      case "pregătire instalare":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "instalare":
        return "bg-green-50 text-green-700 border-green-200"
      default:
        return "bg-gray-50 text-gray-700 border-gray-200"
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii Lucrare" text="Vizualizați detaliile lucrării">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi
          </Button>
        </DashboardHeader>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă detaliile lucrării...</span>
        </div>
      </DashboardShell>
    )
  }

  if (error) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii Lucrare" text="Vizualizați detaliile lucrării">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi
          </Button>
        </DashboardHeader>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Detalii Lucrare" text="Vizualizați detaliile lucrării">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi
          </Button>
          <Button onClick={handleGenerateReport}>
            <FileText className="mr-2 h-4 w-4" />
            Generează Raport
          </Button>
        </div>
      </DashboardHeader>

      <Tabs defaultValue="detalii" className="space-y-4">
        <TabsList>
          <TabsTrigger value="detalii">Detalii Lucrare</TabsTrigger>
          <TabsTrigger value="echipament">Verificare Echipament</TabsTrigger>
          <TabsTrigger value="interventie">Intervenție</TabsTrigger>
        </TabsList>

        <TabsContent value="detalii" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informații Generale</CardTitle>
              <CardDescription>Detalii despre lucrare și client</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Client:</span>
                    <span>{lucrare.client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Persoană contact:</span>
                    <span>{lucrare.persoanaContact}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Telefon:</span>
                    <span>{lucrare.telefon}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Locație:</span>
                    <span>{lucrare.locatie}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Data emiterii:</span>
                    <span>{lucrare.dataEmiterii}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Data intervenție:</span>
                    <span>{lucrare.dataInterventie}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Tip lucrare:</span>
                    <Badge variant="outline" className={getTipLucrareColor(lucrare.tipLucrare)}>
                      {lucrare.tipLucrare}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-500">Status lucrare:</span>
                    <Badge className={getStatusColor(lucrare.statusLucrare)}>{lucrare.statusLucrare}</Badge>
                  </div>
                  {!isTechnician && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-500">Status facturare:</span>
                      <Badge className={getFacturaColor(lucrare.statusFacturare)}>{lucrare.statusFacturare}</Badge>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-gray-500 mb-2">Descriere:</h3>
                <p className="whitespace-pre-line">{lucrare.descriere}</p>
              </div>

              {lucrare.defectReclamat && (
                <div>
                  <h3 className="font-medium text-gray-500 mb-2">Defect reclamat:</h3>
                  <p className="whitespace-pre-line">{lucrare.defectReclamat}</p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="font-medium text-gray-500 mb-2">Tehnicieni asignați:</h3>
                <div className="flex flex-wrap gap-2">
                  {lucrare.tehnicieni.map((tehnician, index) => (
                    <Badge key={index} variant="secondary">
                      {tehnician}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="echipament" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Verificare Echipament</CardTitle>
              <CardDescription>Informații despre echipamentul verificat</CardDescription>
            </CardHeader>
            <CardContent>
              {lucrare.equipmentVerified ? (
                <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-md border border-green-200">
                    <p className="text-green-700 font-medium">
                      Echipamentul a fost verificat de {lucrare.equipmentVerifiedBy} la data{" "}
                      {lucrare.equipmentVerifiedAt}.
                    </p>
                  </div>

                  {lucrare.echipament && (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-500">Echipament:</span>
                        <span>{lucrare.echipament}</span>
                      </div>
                      {lucrare.echipamentCod && (
                        <div className="flex justify-between">
                          <span className="font-medium text-gray-500">Cod echipament:</span>
                          <span>{lucrare.echipamentCod}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
                  <p className="text-yellow-700">Echipamentul nu a fost încă verificat.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interventie" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detalii Intervenție</CardTitle>
              <CardDescription>Informații despre intervenția efectuată</CardDescription>
            </CardHeader>
            <CardContent>
              {lucrare.constatareLaLocatie || lucrare.descriereInterventie ? (
                <div className="space-y-4">
                  {lucrare.constatareLaLocatie && (
                    <div>
                      <h3 className="font-medium text-gray-500 mb-2">Constatare la locație:</h3>
                      <p className="whitespace-pre-line">{lucrare.constatareLaLocatie}</p>
                    </div>
                  )}

                  {lucrare.descriereInterventie && (
                    <div>
                      <h3 className="font-medium text-gray-500 mb-2">Descriere intervenție:</h3>
                      <p className="whitespace-pre-line">{lucrare.descriereInterventie}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
                  <p className="text-yellow-700">Nu există încă detalii despre intervenție.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}
