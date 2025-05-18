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
  const SIG_HEIGHT = 160 // px – lasă-l fix
  const SIG_MIN_WIDTH = 320 // px – cât încape pe telefonul cel mai îngust

  const router = useRouter()
  const { userData } = useAuth()

  // Signature references and states
  const techSignatureRef = useRef<SignatureCanvas | null>(null)
  const clientSignatureRef = useRef<SignatureCanvas | null>(null)
  const [isTechSigned, setIsTechSigned] = useState(false)
  const [isClientSigned, setIsClientSigned] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [techSignatureData, setTechSignatureData] = useState<string | null>(null)
  const [clientSignatureData, setClientSignatureData] = useState<string | null>(null)
  const [isTechDrawing, setIsTechDrawing] = useState(false)
  const [isClientDrawing, setIsClientDrawing] = useState(false)

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
  const submitButtonRef = useRef<HTMLButtonElement>(null)

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
          if (data.statusLucrare === "Finalizat" && data.raportGenerat === true) {
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
      setTechSignatureData(null)
    }
  }, [])

  const clearClientSignature = useCallback(() => {
    if (clientSignatureRef.current) {
      clientSignatureRef.current.clear()
      setIsClientSigned(false)
      setClientSignatureData(null)
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
          `Stimata/Stimate ${lucrare.persoanaContact},

Va transmitem atasat raportul de interventie pentru lucrarea efectuata in data de ${lucrare.dataInterventie}.

Cu stima,
FOM by NRG`,
        )
        formData.append("senderName", `FOM by NRG - ${lucrare.tehnicieni?.join(", ")}`)

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
    console.log("Submit button clicked, current step:", step)

    if (step === "verificare") {
      try {
        // Actualizăm statusul lucrării în baza de date, dar nu mai blocăm dacă nu e finalizat
        // Doar actualizăm statusul dacă utilizatorul a selectat "Finalizat"
        if (statusLucrare === "Finalizat") {
          await updateLucrare(params.id, { statusLucrare: "Finalizat" })
        }
        setStep("semnare")
        console.log("Moving to signing step")
      } catch (err) {
        console.error("Eroare la actualizarea statusului lucrării:", err)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la actualizarea statusului lucrării.",
          variant: "destructive",
        })
      }
      return
    }

    if (step === "semnare") {
      // Check for tech signature - transformăm în avertisment, nu blocaj
      if (!techSignatureData && (!techSignatureRef.current || techSignatureRef.current.isEmpty())) {
        toast({
          title: "Atenție",
          description: "Raportul va fi generat fără semnătura tehnicianului.",
        })
      }

      // Check for client signature - transformăm în avertisment, nu blocaj
      if (!clientSignatureData && (!clientSignatureRef.current || clientSignatureRef.current.isEmpty())) {
        toast({
          title: "Atenție",
          description: "Raportul va fi generat fără semnătura beneficiarului.",
        })
      }

      if (!email) {
        toast({
          title: "Atenție",
          description: "Vă rugăm să introduceți adresa de email pentru trimiterea raportului.",
          variant: "destructive",
        })
        return
      }

      setIsSubmitting(true)

      try {
        // Get signatures from refs or from stored state
        let semnaturaTehnician = techSignatureData
        let semnaturaBeneficiar = clientSignatureData

        if (techSignatureRef.current && !techSignatureRef.current.isEmpty()) {
          semnaturaTehnician = techSignatureRef.current.toDataURL("image/png")
          setTechSignatureData(semnaturaTehnician)
        }

        if (clientSignatureRef.current && !clientSignatureRef.current.isEmpty()) {
          semnaturaBeneficiar = clientSignatureRef.current.toDataURL("image/png")
          setClientSignatureData(semnaturaBeneficiar)
        }

        // Nu mai verificăm dacă avem ambele semnături
        await updateLucrare(params.id, {
          semnaturaTehnician,
          semnaturaBeneficiar,
          statusLucrare: statusLucrare, // Păstrăm statusul existent
          products,
          emailDestinatar: email,
        })

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
        toast({
          title: "Eroare",
          description: "A apărut o eroare la salvarea semnăturilor.",
        })
      } finally {
        setIsSubmitting(false)
      }
    }
  })

  const handleStatusChange = useCallback((value: string) => {
    setStatusLucrare(value)
  }, [])

  // Tech signature handlers
  const handleTechBegin = useCallback(() => {
    setIsTechDrawing(true)
  }, [])

  const handleTechEnd = useCallback(() => {
    setIsTechDrawing(false)
    if (techSignatureRef.current) {
      const isEmpty = techSignatureRef.current.isEmpty()
      setIsTechSigned(!isEmpty)

      if (!isEmpty) {
        // Store the signature data to prevent loss on mobile
        const data = techSignatureRef.current.toDataURL()
        setTechSignatureData(data)
      }
    }
  }, [])

  // Client signature handlers
  const handleClientBegin = useCallback(() => {
    setIsClientDrawing(true)
  }, [])

  const handleClientEnd = useCallback(() => {
    setIsClientDrawing(false)
    if (clientSignatureRef.current) {
      const isEmpty = clientSignatureRef.current.isEmpty()
      setIsClientSigned(!isEmpty)

      if (!isEmpty) {
        // Store the signature data to prevent loss on mobile
        const data = clientSignatureRef.current.toDataURL()
        setClientSignatureData(data)
      }
    }
  }, [])

  // Add document-wide click/touch handler to restore signatures if they get cleared
  useEffect(() => {
    const handleDocumentInteraction = () => {
      // Skip if we're currently drawing
      if (isTechDrawing || isClientDrawing) return

      // Small delay to let other events process
      setTimeout(() => {
        // Restore tech signature if needed
        if (techSignatureData && techSignatureRef.current && techSignatureRef.current.isEmpty()) {
          techSignatureRef.current.fromDataURL(techSignatureData)
          setIsTechSigned(true)
        }

        // Restore client signature if needed
        if (clientSignatureData && clientSignatureRef.current && clientSignatureRef.current.isEmpty()) {
          clientSignatureRef.current.fromDataURL(clientSignatureData)
          setIsClientSigned(true)
        }
      }, 100)
    }

    document.addEventListener("click", handleDocumentInteraction)
    document.addEventListener("touchend", handleDocumentInteraction)

    return () => {
      document.removeEventListener("click", handleDocumentInteraction)
      document.removeEventListener("touchend", handleDocumentInteraction)
    }
  }, [techSignatureData, clientSignatureData, isTechDrawing, isClientDrawing])

  const handleDownloadPDF = useCallback(async () => {
    if (reportGeneratorRef.current) {
      reportGeneratorRef.current.click()
    }
  }, [])

  const handleResendEmail = useCallback(async () => {
    if (!email) {
      toast({
        title: "Atenție",
        description: "Vă rugăm să introduceți adresa de email pentru trimiterea raportului.",
        variant: "destructive",
      })
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
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [email, pdfBlob, sendEmail])

  // This function will be called directly from the button
  const handleButtonClick = useCallback(() => {
    console.log("Button clicked directly")
    handleSubmit()
  }, [handleSubmit])

  // Actualizăm statusul lucrării și marcăm raportul ca generat
  const updateWorkOrderStatus = async (lucrareId, pdfBlob) => {
    try {
      if (!lucrareId) return

      console.log("Actualizăm statusul lucrării și marcăm raportul ca generat:", lucrareId)

      // Importăm doc și updateDoc din firebase/firestore
      const { doc, updateDoc, serverTimestamp } = require("firebase/firestore")
      const { db } = require("@/lib/firebase/config")

      // Actualizăm documentul în Firestore
      const lucrareRef = doc(db, "lucrari", lucrareId)
      await updateDoc(lucrareRef, {
        raportGenerat: true,
        updatedAt: serverTimestamp(),
      })

      console.log("Lucrare actualizată cu succes, raportGenerat = true, statusLucrare = Finalizat")

      // Afișăm un toast de confirmare
      toast({
        title: "Raport finalizat",
        description: "Lucrarea a fost marcată ca finalizată și raportul a fost generat.",
        variant: "default",
      })
    } catch (error) {
      console.error("Eroare la actualizarea statusului lucrării:", error)
      toast({
        title: "Atenție",
        description: "Raportul a fost generat, dar nu s-a putut actualiza starea în sistem.",
        variant: "destructive",
      })
    }
  }

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
                      updateWorkOrderStatus(lucrare.id, blob)
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
                      <SelectItem value="Listată">Listată</SelectItem>
                      <SelectItem value="Atribuită">Atribuită</SelectItem>
                      <SelectItem value="În lucru">În lucru</SelectItem>
                      <SelectItem value="În așteptare">În așteptare</SelectItem>
                      <SelectItem value="Finalizat">Finalizat</SelectItem>
                    </SelectContent>
                  </Select>
                  {statusLucrare !== "Finalizat" && (
                    <p className="text-sm text-amber-500">
                      Lucrarea nu este marcată ca Finalizată. Puteți genera raportul.
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
                        width: SIG_MIN_WIDTH,

                        height: SIG_HEIGHT,
                      }}
                      onBegin={handleTechBegin}
                      onEnd={handleTechEnd}
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
                        width: SIG_MIN_WIDTH,

                        height: SIG_HEIGHT,
                      }}
                      onBegin={handleClientBegin}
                      onEnd={handleClientEnd}
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
          <CardFooter className="flex flex-col sm:flex-row gap-4 justify-between pb-6 pt-4">
            <div className="order-2 sm:order-1 w-full sm:w-auto">
              <Button variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
                Înapoi
              </Button>
            </div>
            <div className="order-1 sm:order-2 w-full sm:w-auto mb-2 sm:mb-0">
              <Button
                ref={submitButtonRef}
                className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                onClick={handleButtonClick}
                disabled={isSubmitting}
                style={{
                  position: "relative",
                  zIndex: 50,
                  touchAction: "manipulation",
                }}
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
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
