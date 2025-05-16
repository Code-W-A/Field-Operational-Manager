"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { SignaturePad } from "@/components/signature-pad"
import { useRouter } from "next/navigation"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { EmailSender } from "@/components/email-sender"
import { Loader2, Check, AlertCircle, FileText, Save, Send, ArrowLeft, FileCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import { format } from "date-fns"

export function ReportGenerator({ lucrareId }) {
  const { toast } = useToast()
  const router = useRouter()
  const { userData } = useAuth()
  const [activeTab, setActiveTab] = useState("verificare")
  const [lucrare, setLucrare] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [reportData, setReportData] = useState({
    constatare: "",
    operatiiEfectuate: "",
    observatii: "",
    recomandari: "",
    materialeFolosite: "",
    semnaturaTehnician: null,
    semnaturaClient: null,
  })
  const [emailData, setEmailData] = useState({
    to: "",
    subject: "",
    body: "",
    attachments: [],
  })
  const [reportGenerated, setReportGenerated] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const [reportSaved, setReportSaved] = useState(false)
  const [reportPdf, setReportPdf] = useState(null)
  const [clientEmail, setClientEmail] = useState("")
  const [clientName, setClientName] = useState("")
  const [reportHtml, setReportHtml] = useState("")
  const [isFinalizingOrder, setIsFinalizingOrder] = useState(false)

  const signatureTehnicianRef = useRef(null)
  const signaturaClientRef = useRef(null)

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setLoading(true)
        const lucrareRef = doc(db, "lucrari", lucrareId)
        const lucrareSnap = await getDoc(lucrareRef)

        if (lucrareSnap.exists()) {
          const lucrareData = { id: lucrareSnap.id, ...lucrareSnap.data() }
          setLucrare(lucrareData)

          // Verificăm dacă există deja un raport generat
          if (lucrareData.raport) {
            setReportData(lucrareData.raport)
            setReportGenerated(true)
            setReportSaved(true)
          }

          // Verificăm dacă raportul a fost trimis
          if (lucrareData.raportTrimis) {
            setReportSent(true)
          }

          // Încărcăm datele clientului pentru email
          if (lucrareData.client) {
            const clientsRef = doc(db, "clients", lucrareData.client)
            const clientSnap = await getDoc(clientsRef)
            if (clientSnap.exists()) {
              const clientData = clientSnap.data()
              setClientEmail(clientData.email || "")
              setClientName(clientData.name || lucrareData.client)
            }
          }
        } else {
          setError("Lucrarea nu a fost găsită")
        }
      } catch (err) {
        console.error("Eroare la încărcarea lucrării:", err)
        setError("A apărut o eroare la încărcarea lucrării")
      } finally {
        setLoading(false)
      }
    }

    if (lucrareId) {
      fetchLucrare()
    }
  }, [lucrareId])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setReportData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSaveReport = async () => {
    try {
      setSaving(true)

      // Obținem semnăturile
      const semnaturaTehnician = signatureTehnicianRef.current?.getTrimmedCanvas().toDataURL("image/png")
      const semnaturaClient = signaturaClientRef.current?.getTrimmedCanvas().toDataURL("image/png")

      // Actualizăm datele raportului
      const updatedReportData = {
        ...reportData,
        semnaturaTehnician,
        semnaturaClient,
      }

      // Salvăm raportul în Firestore
      const lucrareRef = doc(db, "lucrari", lucrareId)
      await updateDoc(lucrareRef, {
        raport: updatedReportData,
        hasGeneratedReport: true, // Marcăm lucrarea ca având raport generat
        dataRaport: format(new Date(), "dd.MM.yyyy HH:mm"),
      })

      setReportData(updatedReportData)
      setReportSaved(true)
      setReportGenerated(true)

      toast({
        title: "Raport salvat",
        description: "Raportul a fost salvat cu succes",
        variant: "default",
        icon: <Check className="h-4 w-4" />,
      })

      // Actualizăm starea lucrării
      await updateDoc(lucrareRef, {
        statusLucrare: "Finalizată",
      })
    } catch (err) {
      console.error("Eroare la salvarea raportului:", err)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea raportului",
        variant: "destructive",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSendEmail = async (emailDetails) => {
    try {
      setSending(true)

      // Actualizăm statusul de trimitere în Firestore
      const lucrareRef = doc(db, "lucrari", lucrareId)
      await updateDoc(lucrareRef, {
        raportTrimis: true,
        dataTrimiereRaport: format(new Date(), "dd.MM.yyyy HH:mm"),
      })

      setReportSent(true)

      toast({
        title: "Email trimis",
        description: "Raportul a fost trimis cu succes prin email",
        variant: "default",
        icon: <Check className="h-4 w-4" />,
      })
    } catch (err) {
      console.error("Eroare la trimiterea email-ului:", err)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la trimiterea email-ului",
        variant: "destructive",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    } finally {
      setSending(false)
    }
  }

  const handleFinalizeOrder = async () => {
    try {
      setIsFinalizingOrder(true)

      // Verificăm dacă raportul a fost generat
      if (!reportGenerated) {
        toast({
          title: "Raport negenetat",
          description: "Trebuie să generați și să salvați raportul înainte de a finaliza lucrarea",
          variant: "destructive",
          icon: <AlertCircle className="h-4 w-4" />,
        })
        return
      }

      // Actualizăm lucrarea în Firestore
      const lucrareRef = doc(db, "lucrari", lucrareId)
      await updateDoc(lucrareRef, {
        statusLucrare: "Finalizată",
        hasGeneratedReport: true,
        dataFinalizare: format(new Date(), "dd.MM.yyyy HH:mm"),
        finalizataDe: userData?.uid || null,
        // Resetăm tehnicienii asignați pentru a o transfera la dispecer
        asignatTo: null,
      })

      toast({
        title: "Lucrare finalizată",
        description: "Lucrarea a fost marcată ca finalizată și transferată către dispecer",
        variant: "default",
        icon: <FileCheck className="h-4 w-4" />,
      })

      // Redirecționăm către lista de lucrări
      router.push("/dashboard/lucrari")
    } catch (err) {
      console.error("Eroare la finalizarea lucrării:", err)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la finalizarea lucrării",
        variant: "destructive",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    } finally {
      setIsFinalizingOrder(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Se încarcă datele lucrării...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Eroare</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!lucrare) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Eroare</AlertTitle>
        <AlertDescription>Lucrarea nu a fost găsită</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
        </Button>

        <Button
          onClick={handleFinalizeOrder}
          disabled={isFinalizingOrder || !reportGenerated}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {isFinalizingOrder ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
            </>
          ) : (
            <>
              <FileCheck className="mr-2 h-4 w-4" /> Finalizează lucrarea și transferă către dispecer
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalii lucrare</CardTitle>
          <CardDescription>Informații despre lucrarea curentă</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Client</Label>
            <div className="font-medium">{lucrare.client}</div>
          </div>
          <div>
            <Label>Locație</Label>
            <div className="font-medium">{lucrare.locatie}</div>
          </div>
          <div>
            <Label>Tip lucrare</Label>
            <div className="font-medium">{lucrare.tipLucrare}</div>
          </div>
          <div>
            <Label>Data intervenție</Label>
            <div className="font-medium">{lucrare.dataInterventie}</div>
          </div>
          <div className="md:col-span-2">
            <Label>Descriere</Label>
            <div className="font-medium">{lucrare.descriere}</div>
          </div>
          {lucrare.defectReclamat && (
            <div className="md:col-span-2">
              <Label>Defect reclamat</Label>
              <div className="font-medium">{lucrare.defectReclamat}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generare raport</CardTitle>
          <CardDescription>Completați detaliile raportului de intervenție</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="verificare">1. Verificare</TabsTrigger>
              <TabsTrigger value="semnare">2. Semnare</TabsTrigger>
              <TabsTrigger value="finalizare">3. Finalizare</TabsTrigger>
            </TabsList>
            <TabsContent value="verificare" className="space-y-4 pt-4">
              <div>
                <Label htmlFor="constatare">Constatare</Label>
                <Textarea
                  id="constatare"
                  name="constatare"
                  placeholder="Descrieți constatările făcute la fața locului"
                  value={reportData.constatare}
                  onChange={handleInputChange}
                  className="min-h-[100px]"
                />
              </div>
              <div>
                <Label htmlFor="operatiiEfectuate">Operații efectuate</Label>
                <Textarea
                  id="operatiiEfectuate"
                  name="operatiiEfectuate"
                  placeholder="Descrieți operațiile efectuate pentru remedierea problemei"
                  value={reportData.operatiiEfectuate}
                  onChange={handleInputChange}
                  className="min-h-[100px]"
                />
              </div>
              <div>
                <Label htmlFor="materialeFolosite">Materiale folosite</Label>
                <Textarea
                  id="materialeFolosite"
                  name="materialeFolosite"
                  placeholder="Listați materialele folosite (dacă este cazul)"
                  value={reportData.materialeFolosite}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="observatii">Observații</Label>
                <Textarea
                  id="observatii"
                  name="observatii"
                  placeholder="Observații suplimentare (opțional)"
                  value={reportData.observatii}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="recomandari">Recomandări</Label>
                <Textarea
                  id="recomandari"
                  name="recomandari"
                  placeholder="Recomandări pentru client (opțional)"
                  value={reportData.recomandari}
                  onChange={handleInputChange}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setActiveTab("semnare")}>Continuă la semnare</Button>
              </div>
            </TabsContent>
            <TabsContent value="semnare" className="space-y-4 pt-4">
              <div>
                <Label>Semnătură tehnician</Label>
                <div className="border rounded-md p-2 bg-white">
                  <SignaturePad ref={signatureTehnicianRef} initialData={reportData.semnaturaTehnician} />
                </div>
              </div>
              <div>
                <Label>Semnătură client</Label>
                <div className="border rounded-md p-2 bg-white">
                  <SignaturePad ref={signaturaClientRef} initialData={reportData.semnaturaClient} />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setActiveTab("verificare")}>
                  Înapoi
                </Button>
                <Button onClick={handleSaveReport} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se salvează...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Salvează raport
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="finalizare" className="space-y-4 pt-4">
              {!reportSaved ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Raport nesalvat</AlertTitle>
                  <AlertDescription>
                    Trebuie să completați și să salvați raportul înainte de a-l trimite prin email.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Alert className="bg-green-50 border-green-200">
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertTitle>Raport generat</AlertTitle>
                    <AlertDescription>
                      Raportul a fost generat cu succes. Acum îl puteți trimite prin email clientului.
                    </AlertDescription>
                  </Alert>

                  <div className="border rounded-md p-4 bg-white">
                    <h3 className="font-medium mb-2">Trimitere raport prin email</h3>
                    <EmailSender
                      initialData={{
                        to: clientEmail,
                        subject: `Raport intervenție - ${lucrare.client} - ${format(new Date(), "dd.MM.yyyy")}`,
                        body: `Stimată/Stimate ${clientName},\n\nAtașat găsiți raportul de intervenție pentru lucrarea efectuată la data de ${lucrare.dataInterventie}.\n\nCu stimă,\nEchipa tehnică`,
                      }}
                      onSend={handleSendEmail}
                      disabled={sending || reportSent}
                      buttonText={
                        reportSent ? "Raport trimis" : sending ? "Se trimite..." : "Trimite raport prin email"
                      }
                      buttonIcon={
                        reportSent ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : sending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )
                      }
                    />
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setActiveTab("semnare")}>
                  Înapoi
                </Button>
                <Button
                  onClick={() => router.push(`/dashboard/lucrari/${lucrareId}`)}
                  variant="outline"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" /> Vezi detalii lucrare
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
