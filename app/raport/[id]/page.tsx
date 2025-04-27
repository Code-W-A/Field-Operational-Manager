"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Check, Send, ArrowLeft, Mail, Download } from "lucide-react"
import SignatureCanvas from "react-signature-canvas"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/AuthContext"
import { useStableCallback } from "@/lib/utils/hooks"
import { ProductTableForm, type Product } from "@/components/product-table-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
// Remove the autotable import since it's causing issues
// import 'jspdf-autotable'
import { ReportGenerator } from "@/components/report-generator"

export default function RaportPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()

  // Signature references and states
  const techSignatureRef = useRef<SignatureCanvas | null>(null)
  const clientSignatureRef = useRef<SignatureCanvas | null>(null)
  const [isTechSigned, setIsTechSigned] = useState(false)
  const [isClientSigned, setIsClientSigned] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const [lucrare, setLucrare] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<"verificare" | "semnare" | "finalizat">("verificare")
  const [statusLucrare, setStatusLucrare] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("detalii")
  const [products, setProducts] = useState<Product[]>([])

  // Add email state
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)

  const reportGeneratorRef = useRef<React.ElementRef<typeof ReportGenerator>>(null)

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setLoading(true)
        const data = await getLucrareById(params.id)
        if (data) {
          setLucrare(data)
          setStatusLucrare(data.statusLucrare)

          // If the work has products, load them
          if (data.products) {
            setProducts(data.products)
          }

          // If the work has an email address, load it
          if (data.emailDestinatar) {
            setEmail(data.emailDestinatar)
          }

          // Dacă lucrarea are deja semnături, trecem direct la pasul finalizat
          if (data.semnaturaTehnician && data.semnaturaBeneficiar) {
            setIsSubmitted(true)
            setStep("finalizat")
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

    fetchLucrare()
  }, [params.id])

  // Verificăm dacă tehnicianul are acces la această lucrare
  useEffect(() => {
    const checkAccess = async () => {
      if (
        !loading &&
        lucrare &&
        userData?.role === "tehnician" &&
        userData?.displayName &&
        lucrare.tehnicieni &&
        !lucrare.tehnicieni.includes(userData.displayName)
      ) {
        // Tehnicianul nu este alocat la această lucrare, redirecționăm la dashboard
        alert("Nu aveți acces la raportul acestei lucrări.")
        router.push("/dashboard")
      }
    }

    checkAccess()
  }, [loading, lucrare, userData, router])

  const clearTechSignature = useCallback(() => {
    if (techSignatureRef.current) {
      techSignatureRef.current.clear()
      setIsTechSigned(false)
    }
  }, [])

  const clearClientSignature = useCallback(() => {
    if (clientSignatureRef.current) {
      clientSignatureRef.current.clear()
      setIsClientSigned(false)
    }
  }, [])

  // Helper function to remove diacritics for PDF generation
  const removeDiacritics = (text: string): string =>
    text
      .replace(/ă/g, "a")
      .replace(/â/g, "a")
      .replace(/î/g, "i")
      .replace(/ș/g, "s")
      .replace(/ț/g, "t")
      .replace(/Ă/g, "A")
      .replace(/Â/g, "A")
      .replace(/Î/g, "I")
      .replace(/Ș/g, "S")
      .replace(/Ț/g, "T")

  // Function to generate PDF and return blob
  // … restul importurilor şi declaraţiilor

  // Function to send email
  const sendEmail = useCallback(
    async (pdfBlob: Blob) => {
      try {
        // Create FormData for email sending
        const formData = new FormData()
        formData.append("to", email)
        formData.append("subject", `Raport Interventie - ${lucrare.client} - ${lucrare.dataInterventie}`)
        formData.append(
          "message",
          `Stimata/Stimate ${lucrare.persoanaContact},\n\nVa transmitem atasat raportul de interventie pentru lucrarea efectuata in data de ${lucrare.dataInterventie}.\n\nCu stima,\nEchipa de interventie`,
        )
        formData.append("senderName", `Echipa de interventie - ${lucrare.tehnicieni?.join(", ")}`)

        // Add PDF as file
        const pdfFile = new File([pdfBlob], `Raport_Interventie_${lucrare.id}.pdf`, { type: "application/pdf" })
        formData.append("pdfFile", pdfFile)

        // Add company logo
        formData.append("companyLogo", "/logo-placeholder.png")

        // Send request to API
        const response = await fetch("/api/send-email", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "A aparut o eroare la trimiterea emailului")
        }

        // Show success message
        toast({
          title: "Email trimis cu succes",
          description: `Raportul a fost trimis la adresa ${email}`,
        })

        return true
      } catch (error) {
        console.error("Eroare la trimiterea emailului:", error)
        toast({
          title: "Eroare",
          description: error instanceof Error ? error.message : "A aparut o eroare la trimiterea emailului",
          variant: "destructive",
        })
        return false
      }
    },
    [email, lucrare],
  )

  // Use useStableCallback to ensure we have access to the latest state values
  // without causing unnecessary re-renders
  // În funcția handleSubmit, când se salvează semnăturile
  const handleSubmit = useStableCallback(async () => {
    if (step === "verificare") {
      if (statusLucrare !== "Finalizat") {
        alert("Lucrarea trebuie să fie marcată ca Finalizată înainte de a genera raportul.")
        return
      }

      try {
        // Actualizăm statusul lucrării în baza de date
        await updateLucrare(params.id, { statusLucrare: "Finalizat" })
        setStep("semnare")
      } catch (err) {
        console.error("Eroare la actualizarea statusului lucrării:", err)
        alert("A apărut o eroare la actualizarea statusului lucrării.")
      }
      return
    }

    if (step === "semnare") {
      if (!techSignatureRef.current || techSignatureRef.current.isEmpty()) {
        alert("Vă rugăm să adăugați semnătura tehnicianului înainte de a finaliza raportul.")
        return
      }

      if (!clientSignatureRef.current || clientSignatureRef.current.isEmpty()) {
        alert("Vă rugăm să adăugați semnătura beneficiarului înainte de a finaliza raportul.")
        return
      }

      if (!email) {
        alert("Vă rugăm să introduceți adresa de email pentru trimiterea raportului.")
        return
      }

      setIsSubmitting(true)

      try {
        // Salvăm semnăturile, produsele și emailul
        const semnaturaTehnician = techSignatureRef.current.toDataURL("image/png")
        const semnaturaBeneficiar = clientSignatureRef.current.toDataURL("image/png")

        await updateLucrare(params.id, {
          semnaturaTehnician,
          semnaturaBeneficiar,
          statusLucrare: "Finalizat",
          products,
          emailDestinatar: email,
        })

        // Inside the try block of the "semnare" step, replace the PDF generation code with:
        // Reîncărcăm datele actualizate
        const updatedLucrare = await getLucrareById(params.id)
        if (updatedLucrare) {
          setLucrare(updatedLucrare)

          // Generate PDF using the ReportGenerator component
          if (reportGeneratorRef.current) {
            reportGeneratorRef.current.click()
          } else {
            // Fallback if ref is not available
            toast({
              title: "Eroare",
              description: "Nu s-a putut genera raportul PDF",
              variant: "destructive",
            })
          }
        }

        setIsSubmitted(true)
        setStep("finalizat")
      } catch (err) {
        console.error("Eroare la salvarea semnăturilor:", err)
        alert("A apărut o eroare la salvarea semnăturilor.")
      } finally {
        setIsSubmitting(false)
      }
    }
  })

  const handleStatusChange = useCallback((value: string) => {
    setStatusLucrare(value)
  }, [])

  const handleTechSignatureEnd = useCallback(() => {
    setIsTechSigned(!techSignatureRef.current?.isEmpty())
  }, [])

  const handleClientSignatureEnd = useCallback(() => {
    setIsClientSigned(!clientSignatureRef.current?.isEmpty())
  }, [])

  const handleDownloadPDF = useCallback(async () => {
    if (reportGeneratorRef.current) {
      reportGeneratorRef.current.click()
    }
  }, [])

  const handleResendEmail = useCallback(async () => {
    if (!email) {
      alert("Vă rugăm să introduceți adresa de email pentru trimiterea raportului.")
      return
    }

    setIsSubmitting(true)
    try {
      const blob = pdfBlob
      if (!blob && reportGeneratorRef.current) {
        // Trigger PDF generation through the ReportGenerator component
        reportGeneratorRef.current.click()
        return // The onGenerate callback will handle sending the email
      }

      if (blob) {
        await sendEmail(blob)
      }
    } catch (error) {
      console.error("Eroare la retrimiterea emailului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la retrimiterea emailului",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [email, pdfBlob, sendEmail])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="absolute left-4" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-full">
              <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700">
                Raport Intervenție #{params.id}
              </CardTitle>
              <CardDescription>Detalii despre intervenția efectuată</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isSubmitted ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center space-y-4 py-6">
                <div className="rounded-full bg-green-100 p-3">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold">Raport Finalizat cu Succes!</h2>
                <p className="text-center text-gray-500">
                  Raportul a fost generat și {emailSent ? "trimis pe email" : "poate fi descărcat sau trimis pe email"}.
                </p>
                {/* Add this inside the first div of the isSubmitted condition */}
                <div className="hidden">
                  <ReportGenerator
                    ref={reportGeneratorRef}
                    lucrare={lucrare}
                    onGenerate={(blob) => {
                      setPdfBlob(blob)
                      // Send email automatically when PDF is generated
                      sendEmail(blob).then((success) => {
                        setEmailSent(success)
                      })
                    }}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col space-y-2">
                  <Button onClick={handleDownloadPDF} className="gap-2">
                    <Download className="h-4 w-4" /> Descarcă PDF
                  </Button>

                  <div className="space-y-2">
                    <Label htmlFor="email">Adresă Email</Label>
                    <div className="flex gap-2">
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      <Button
                        onClick={handleResendEmail}
                        disabled={isSubmitting || !email}
                        className="gap-2 whitespace-nowrap"
                      >
                        {isSubmitting ? (
                          <>Se trimite...</>
                        ) : (
                          <>
                            <Mail className="h-4 w-4" /> Trimite Email
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : step === "verificare" ? (
            <Tabs defaultValue="detalii" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="detalii">Detalii Lucrare</TabsTrigger>
                <TabsTrigger value="interventie">Intervenție</TabsTrigger>
              </TabsList>

              <TabsContent value="detalii" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="font-medium text-gray-500">Client</h3>
                    <p>{lucrare?.client}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-500">Locație</h3>
                    <p>{lucrare?.locatie}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-500">Data Intervenție</h3>
                    <p>{lucrare?.dataInterventie}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-500">Tehnician</h3>
                    <p>{lucrare?.tehnicieni?.join(", ")}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-medium text-gray-500">Defect Reclamat</h3>
                  <p>{lucrare?.defectReclamat || "Nu a fost specificat"}</p>
                </div>

                <div>
                  <h3 className="font-medium text-gray-500">Descriere Lucrare</h3>
                  <p>{lucrare?.descriere}</p>
                </div>

                <Separator />

                {lucrare?.tipLucrare === "Intervenție în contract" && (
                  <div>
                    <h3 className="font-medium text-gray-500">Contract:</h3>
                    <p>{lucrare?.contractNumber || "N/A"}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="font-medium text-gray-500">Status Lucrare</h3>
                  <Select value={statusLucrare} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selectați statusul" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="În așteptare">În așteptare</SelectItem>
                      <SelectItem value="În curs">În curs</SelectItem>
                      <SelectItem value="Finalizat">Finalizat</SelectItem>
                    </SelectContent>
                  </Select>
                  {statusLucrare !== "Finalizat" && (
                    <p className="text-sm text-red-500">
                      Lucrarea trebuie să fie marcată ca Finalizată înainte de a genera raportul.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="interventie" className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-500">Descriere Intervenție</h3>
                  <p className="whitespace-pre-line">{lucrare?.descriereInterventie || "Nu a fost specificată"}</p>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="font-medium text-gray-500">Client</h3>
                  <p>{lucrare?.client}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Locație</h3>
                  <p>{lucrare?.locatie}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Data Intervenție</h3>
                  <p>{lucrare?.dataInterventie}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Tehnician</h3>
                  <p>{lucrare?.tehnicieni?.join(", ")}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-gray-500">Defect Reclamat</h3>
                <p>{lucrare?.defectReclamat || "Nu a fost specificat"}</p>
              </div>

              <div>
                <h3 className="font-medium text-gray-500">Descriere Lucrare</h3>
                <p>{lucrare?.descriere}</p>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-gray-500">Descriere Intervenție</h3>
                <p className="whitespace-pre-line">{lucrare?.descriereInterventie || "Nu a fost specificată"}</p>
              </div>

              <Separator />

              {/* Adăugăm formularul pentru produse */}
              <ProductTableForm products={products} onProductsChange={setProducts} />

              <Separator />

              {/* Adăugăm câmpul pentru email */}
              <div className="space-y-2">
                <Label htmlFor="email">Adresă Email pentru Trimitere Raport *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Raportul va fi trimis automat la această adresă după finalizare
                </p>
              </div>

              <Separator />

              <div className="grid gap-6 md:grid-cols-2">
                {/* Semnătură Tehnician */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-500">Semnătură Tehnician</h3>
                  <div className="rounded-md border border-gray-300 bg-white p-2">
                    <SignatureCanvas
                      ref={techSignatureRef}
                      canvasProps={{
                        className: "w-full h-40 border rounded",
                        style: { width: "100%", height: "160px" },
                      }}
                      onEnd={handleTechSignatureEnd}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={clearTechSignature}>
                      Șterge
                    </Button>
                  </div>
                  <p className="text-xs text-center text-gray-500">{lucrare?.tehnicieni?.join(", ") || "Tehnician"}</p>
                </div>

                {/* Semnătură Beneficiar */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-500">Semnătură Beneficiar</h3>
                  <div className="rounded-md border border-gray-300 bg-white p-2">
                    <SignatureCanvas
                      ref={clientSignatureRef}
                      canvasProps={{
                        className: "w-full h-40 border rounded",
                        style: { width: "100%", height: "160px" },
                      }}
                      onEnd={handleClientSignatureEnd}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={clearClientSignature}>
                      Șterge
                    </Button>
                  </div>
                  <p className="text-xs text-center text-gray-500">{lucrare?.persoanaContact || "Beneficiar"}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
        {!isSubmitted && (
          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between">
            <Button variant="outline" onClick={() => router.back()}>
              Înapoi
            </Button>
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                (step === "verificare" ? statusLucrare !== "Finalizat" : !isTechSigned || !isClientSigned || !email)
              }
            >
              {isSubmitting ? (
                <>Se procesează...</>
              ) : step === "verificare" ? (
                <>Continuă spre semnare</>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Finalizează și Trimite Raport
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
