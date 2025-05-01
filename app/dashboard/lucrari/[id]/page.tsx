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
import { ChevronLeft, FileText, Pencil, Trash2 } from "lucide-react"
import { getLucrareById, deleteLucrare } from "@/lib/firebase/firestore"
import { TehnicianInterventionForm } from "@/components/tehnician-intervention-form"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { ContractDisplay } from "@/components/contract-display"

export default function LucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("detalii")

  // Încărcăm datele lucrării
  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        const data = await getLucrareById(params.id)
        setLucrare(data)
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

  // Funcție pentru a edita lucrarea - redirecționează către pagina de lucrări cu parametrul de editare
  const handleEdit = useCallback(() => {
    if (!lucrare?.id) return

    // Redirecționăm către pagina de lucrări cu parametrul de editare
    router.push(`/dashboard/lucrari?edit=${lucrare.id}`)
  }, [router, lucrare])

  // Modificăm funcția handleGenerateReport pentru a naviga către pagina de raport
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
      {/* Modificăm secțiunea de butoane din DashboardHeader pentru a adăuga butonul "Generează raport"
      indiferent de statusul lucrării */}
      <DashboardHeader heading={`Lucrare: ${lucrare.tipLucrare}`} text={`Client: ${lucrare.client}`}>
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
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-2">
          <TabsTrigger value="detalii">Detalii Lucrare</TabsTrigger>
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
                  <div>
                    <p className="text-sm font-medium">Data emiterii:</p>
                    <p className="text-sm text-gray-500">{lucrare.dataEmiterii}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Data intervenție:</p>
                    <p className="text-sm text-gray-500">{lucrare.dataInterventie}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Tip lucrare:</p>
                  <p className="text-sm text-gray-500">{lucrare.tipLucrare}</p>
                </div>
                {lucrare.tipLucrare === "Intervenție în contract" && (
                  <div>
                    <p className="text-sm font-medium">Contract:</p>
                    <ContractDisplay contractId={lucrare.contract} />
                  </div>
                )}
                {lucrare.defectReclamat && (
                  <div>
                    <p className="text-sm font-medium">Defect reclamat:</p>
                    <p className="text-sm text-gray-500">{lucrare.defectReclamat}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Echipament:</p>
                  <p className="text-sm text-gray-500">{lucrare.locatie}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Descriere:</p>
                  <p className="text-sm text-gray-500">{lucrare.descriere || "Fără descriere"}</p>
                </div>
                {lucrare.descriereInterventie && (
                  <div>
                    <p className="text-sm font-medium">Descriere intervenție:</p>
                    <p className="text-sm text-gray-500">{lucrare.descriereInterventie}</p>
                  </div>
                )}
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
                {role !== "tehnician" && (
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
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informații client</CardTitle>
                <CardDescription>Detalii despre client și persoana de contact</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Client:</p>
                  <p className="text-sm text-gray-500">{lucrare.client}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Persoană contact:</p>
                  <p className="text-sm text-gray-500">{lucrare.persoanaContact}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Telefon:</p>
                  <p className="text-sm text-gray-500">{lucrare.telefon}</p>
                </div>
                <Separator />
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

        {role === "tehnician" && (
          <TabsContent value="interventie" className="mt-4">
            <TehnicianInterventionForm
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
