"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { ReportGenerator } from "@/components/report-generator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/components/ui/use-toast"
import { ProductTableForm, type Product } from "@/components/product-table-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import SignatureCanvas from "react-signature-canvas"
import { db } from "@/lib/firebase/firebase"
import { updateDoc, doc } from "firebase/firestore"

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
  const isTechnician = userData?.role === "tehnician"

  // Add email state
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)

  const reportGeneratorRef = useRef<React.ElementRef<typeof ReportGenerator>>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)

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
          `Stimata/Stimate ${lucrare.persoanaContact},\n\nVa transmitem atasat raportul de interventie pentru lucrarea efectuata in data de ${lucrare.dataInterventie}.\n\nCu stima,\nFOM by NRG`,
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
  const handleSubmit = useCallback(async () => {
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
  }, [step, statusLucrare, params.id, email])

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

  const handleGenerateReport = async () => {
    if (reportGeneratorRef.current) {
      reportGeneratorRef.current.click()
    }
    // După generarea cu succes a raportului, actualizează lucrarea
    try {
      await updateDoc(doc(db, "lucrari", params.id as string), {
        raportGenerat: true,
      })
    } catch (error) {
      console.error("Eroare la actualizarea stării lucrării:", error)
    }
  }

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

        // If the work has products, load them
        if (lucrareData.products) {
          setProducts(lucrareData.products)
        }

        // If the work has an email address, load it
        if (lucrareData.emailDestinatar) {
          setEmail(lucrareData.emailDestinatar)
        }

        // Dacă lucrarea are deja semnături, trecem direct la pasul finalizat
        if (lucrareData.semnaturaTehnician && lucrareData.semnaturaBeneficiar) {
          setIsSubmitted(true)
          setStep("finalizat")
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

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Generare raport" text="Încărcare...">
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
        <DashboardHeader heading="Generare raport" text="Eroare">
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

  return (
    <DashboardShell>
      <DashboardHeader heading="Generare raport" text="Completați raportul de intervenție">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
        </Button>
      </DashboardHeader>
      {isSubmitted ? (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <div className="rounded-full bg-green-100 p-3">
              <ArrowLeft className="h-8 w-8 text-green-600" />
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
                <ArrowLeft className="h-4 w-4" /> Descarcă PDF
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
                        <ArrowLeft className="h-4 w-4" /> Trimite Email
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : step === "verificare" ? (
        <div className="space-y-6">
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

          <div className="space-y-4">
            <div className="flex flex-col space-y-2">
              <h3 className="font-medium text-gray-500">Defect Reclamat</h3>
              <p>{lucrare?.defectReclamat || "Nu a fost specificat"}</p>
            </div>

            <div className="flex flex-col space-y-2">
              <h3 className="font-medium text-gray-500">Descriere Lucrare</h3>
              <p>{lucrare?.descriere}</p>
            </div>

            <div className="flex flex-col space-y-2">
              {lucrare?.tipLucrare === "Intervenție în contract" && (
                <div>
                  <h3 className="font-medium text-gray-500">Contract:</h3>
                  <p>{lucrare?.contractNumber || "N/A"}</p>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="font-medium text-gray-500">Status Lucrare</h3>
                <Input
                  value={statusLucrare}
                  onChange={(e) => setStatusLucrare(e.target.value)}
                  placeholder="Selectați statusul"
                />
                {statusLucrare !== "Finalizat" && (
                  <p className="text-sm text-amber-500">
                    Lucrarea nu este marcată ca Finalizată. Puteți genera raportul.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
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

          <div className="space-y-4">
            <div className="flex flex-col space-y-2">
              <h3 className="font-medium text-gray-500">Defect Reclamat</h3>
              <p>{lucrare?.defectReclamat || "Nu a fost specificat"}</p>
            </div>

            <div className="flex flex-col space-y-2">
              <h3 className="font-medium text-gray-500">Descriere Lucrare</h3>
              <p>{lucrare?.descriere}</p>
            </div>

            <div className="flex flex-col space-y-2">
              <h3 className="font-medium text-gray-500">Descriere Intervenție</h3>
              <p className="whitespace-pre-line">{lucrare?.descriereInterventie || "Nu a fost specificată"}</p>
            </div>

            <div className="flex flex-col space-y-2">
              {/* Adăugăm formularul pentru produse */}
              <ProductTableForm products={products} onProductsChange={setProducts} />

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
            </div>

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
          </div>
        </>
      )}
    </DashboardShell>
  )
}
