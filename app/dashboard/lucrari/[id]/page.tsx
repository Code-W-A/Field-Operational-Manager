"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { ChevronLeft, FileText, Pencil, Trash2, ClipboardCheck } from "lucide-react"
import { getLucrareById, updateLucrare, deleteLucrare } from "@/lib/firebase/firestore"
import { LucrareForm } from "@/components/lucrare-form"
import { TehnicianInterventionForm } from "@/components/tehnician-intervention-form"
import { SignaturePad } from "@/components/signature-pad"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"

export default function LucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("detalii")
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false)

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

  // Funcție pentru a actualiza o lucrare
  const handleUpdateLucrare = async (data: Partial<Lucrare>) => {
    if (!lucrare?.id) return

    try {
      await updateLucrare(lucrare.id, data)
      setIsEditDialogOpen(false)

      // Actualizăm datele locale
      setLucrare((prev) => (prev ? { ...prev, ...data } : null))

      toast({
        title: "Lucrare actualizată",
        description: "Lucrarea a fost actualizată cu succes.",
      })
    } catch (error) {
      console.error("Eroare la actualizarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea lucrării.",
        variant: "destructive",
      })
    }
  }

  // Funcție pentru a șterge o lucrare
  const handleDeleteLucrare = async () => {
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
  }

  // Funcție pentru a genera raportul
  const handleGenerateReport = () => {
    router.push(`/raport/${params.id}`)
  }

  // Funcție pentru a salva semnătura beneficiarului
  const handleSaveBeneficiarySignature = async (signatureData: string) => {
    if (!lucrare?.id) return

    try {
      await updateLucrare(lucrare.id, {
        semnaturaBeneficiar: signatureData,
      })

      // Actualizăm datele locale
      setLucrare((prev) => (prev ? { ...prev, semnaturaBeneficiar: signatureData } : null))
      setIsSignatureDialogOpen(false)

      toast({
        title: "Semnătură salvată",
        description: "Semnătura beneficiarului a fost salvată cu succes.",
      })
    } catch (error) {
      console.error("Eroare la salvarea semnăturii:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea semnăturii.",
        variant: "destructive",
      })
    }
  }

  // Funcție pentru a reîncărca datele lucrării
  const refreshLucrare = async () => {
    try {
      const data = await getLucrareById(params.id)
      setLucrare(data)
    } catch (error) {
      console.error("Eroare la reîncărcarea lucrării:", error)
    }
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
      <DashboardHeader heading={`Lucrare: ${lucrare.tipLucrare}`} text={`Client: ${lucrare.client}`}>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/lucrari")}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi
          </Button>
          {lucrare.statusLucrare.toLowerCase() === "finalizat" && (
            <Button onClick={handleGenerateReport}>
              <FileText className="mr-2 h-4 w-4" /> Generează raport
            </Button>
          )}
        </div>
      </DashboardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-3">
          <TabsTrigger value="detalii">Detalii Lucrare</TabsTrigger>
          {role === "tehnician" && <TabsTrigger value="interventie">Intervenție</TabsTrigger>}
          <TabsTrigger value="semnatura">Semnătură Beneficiar</TabsTrigger>
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
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
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
                semnaturaTehnician: lucrare.semnaturaTehnician,
              }}
              onUpdate={refreshLucrare}
            />
          </TabsContent>
        )}

        <TabsContent value="semnatura" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Semnătură Beneficiar</CardTitle>
              <CardDescription>Semnătura beneficiarului pentru confirmarea lucrării</CardDescription>
            </CardHeader>
            <CardContent>
              {lucrare.semnaturaBeneficiar ? (
                <div className="flex flex-col items-center">
                  <img
                    src={lucrare.semnaturaBeneficiar || "/placeholder.svg"}
                    alt="Semnătură beneficiar"
                    className="border rounded max-w-full h-auto"
                  />
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsSignatureDialogOpen(true)}>
                    Actualizează semnătura
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <p className="text-muted-foreground mb-4">Nu există semnătură pentru această lucrare</p>
                  <Button onClick={() => setIsSignatureDialogOpen(true)}>
                    <ClipboardCheck className="mr-2 h-4 w-4" /> Adaugă semnătură
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog pentru editare lucrare */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editează lucrare</DialogTitle>
          </DialogHeader>
          <LucrareForm
            isEdit={true}
            dataEmiterii={new Date()}
            setDataEmiterii={() => {}}
            dataInterventie={new Date()}
            setDataInterventie={() => {}}
            formData={{
              tipLucrare: lucrare.tipLucrare,
              tehnicieni: lucrare.tehnicieni,
              client: lucrare.client,
              locatie: lucrare.locatie,
              descriere: lucrare.descriere,
              persoanaContact: lucrare.persoanaContact,
              telefon: lucrare.telefon,
              statusLucrare: lucrare.statusLucrare,
              statusFacturare: lucrare.statusFacturare,
              contract: lucrare.contract,
              defectReclamat: lucrare.defectReclamat,
            }}
            handleInputChange={() => {}}
            handleSelectChange={() => {}}
            handleTehnicieniChange={() => {}}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog pentru semnătura beneficiarului */}
      <Dialog open={isSignatureDialogOpen} onOpenChange={setIsSignatureDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Semnătură Beneficiar</DialogTitle>
          </DialogHeader>
          <SignaturePad
            onSave={handleSaveBeneficiarySignature}
            existingSignature={lucrare.semnaturaBeneficiar}
            title="Semnătură Beneficiar"
          />
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
