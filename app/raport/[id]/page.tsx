"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChevronLeft, CheckCircle } from "lucide-react"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { ReportGenerator } from "@/components/report-generator"
import { EmailSender } from "@/components/email-sender"
import { SignaturePad } from "@/components/signature-pad"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare } from "@/lib/firebase/firestore"

export default function RaportPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const showEmail = searchParams.get("email") === "true"
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(showEmail ? "email" : "raport")
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [raportGenerat, setRaportGenerat] = useState(false)

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        const data = await getLucrareById(params.id)
        setLucrare(data)

        // Verificăm dacă raportul a fost deja generat
        if (data.raportGenerat) {
          setRaportGenerat(true)
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

  const handlePdfGenerated = async (blob: Blob) => {
    setPdfBlob(blob)

    // Dacă utilizatorul este tehnician și raportul nu a fost încă marcat ca generat
    if (role === "tehnician" && !raportGenerat && lucrare?.id) {
      try {
        // Marcăm lucrarea ca având raport generat
        await updateLucrare(lucrare.id, {
          ...lucrare,
          raportGenerat: true,
          raportGeneratAt: new Date().toISOString(),
          raportGeneratBy: userData?.displayName || "Utilizator necunoscut",
        })

        setRaportGenerat(true)

        toast({
          title: "Raport finalizat",
          description: "Raportul a fost generat și marcat ca finalizat.",
        })
      } catch (error) {
        console.error("Eroare la actualizarea stării raportului:", error)
      }
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
      <DashboardHeader heading={`Raport: ${lucrare.tipLucrare}`} text={`Client: ${lucrare.client}`}>
        <Button variant="outline" onClick={() => router.push(`/dashboard/lucrari/${params.id}`)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Înapoi la lucrare
        </Button>
      </DashboardHeader>

      {role === "tehnician" && raportGenerat && (
        <Alert variant="success" className="mb-4 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle>Raport Finalizat cu Succes!</AlertTitle>
          <AlertDescription>
            Raportul pentru această lucrare a fost generat. Puteți descărca raportul sau trimite un email către client.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="raport">Raport PDF</TabsTrigger>
          <TabsTrigger value="email">Trimite Email</TabsTrigger>
        </TabsList>

        <TabsContent value="raport" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Generare raport PDF</CardTitle>
            </CardHeader>
            <CardContent>
              {!lucrare.semnaturaTehnician || !lucrare.semnaturaBeneficiar ? (
                <div className="space-y-4">
                  <Alert variant="warning">
                    <AlertTitle>Semnături lipsă</AlertTitle>
                    <AlertDescription>
                      Pentru a genera raportul, sunt necesare semnăturile tehnicianului și beneficiarului.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Semnătură Tehnician</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <SignaturePad
                          initialSignature={lucrare.semnaturaTehnician}
                          onSave={async (signatureDataUrl) => {
                            if (lucrare.id) {
                              try {
                                await updateLucrare(lucrare.id, {
                                  ...lucrare,
                                  semnaturaTehnician: signatureDataUrl,
                                })
                                setLucrare({ ...lucrare, semnaturaTehnician: signatureDataUrl })
                                toast({
                                  title: "Semnătură salvată",
                                  description: "Semnătura tehnicianului a fost salvată cu succes.",
                                })
                              } catch (error) {
                                console.error("Eroare la salvarea semnăturii:", error)
                                toast({
                                  title: "Eroare",
                                  description: "Nu s-a putut salva semnătura.",
                                  variant: "destructive",
                                })
                              }
                            }
                          }}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Semnătură Beneficiar</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <SignaturePad
                          initialSignature={lucrare.semnaturaBeneficiar}
                          onSave={async (signatureDataUrl) => {
                            if (lucrare.id) {
                              try {
                                await updateLucrare(lucrare.id, {
                                  ...lucrare,
                                  semnaturaBeneficiar: signatureDataUrl,
                                })
                                setLucrare({ ...lucrare, semnaturaBeneficiar: signatureDataUrl })
                                toast({
                                  title: "Semnătură salvată",
                                  description: "Semnătura beneficiarului a fost salvată cu succes.",
                                })
                              } catch (error) {
                                console.error("Eroare la salvarea semnăturii:", error)
                                toast({
                                  title: "Eroare",
                                  description: "Nu s-a putut salva semnătura.",
                                  variant: "destructive",
                                })
                              }
                            }
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <ReportGenerator
                  lucrare={lucrare}
                  onGenerate={handlePdfGenerated}
                  disableEditing={role === "tehnician" && raportGenerat}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Trimite raport prin email</CardTitle>
            </CardHeader>
            <CardContent>
              <EmailSender
                lucrare={lucrare}
                pdfBlob={pdfBlob}
                onPdfGenerated={handlePdfGenerated}
                disableRegeneration={role === "tehnician" && raportGenerat}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}
