"use client"

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
import { jsPDF } from "jspdf"

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
  const generatePDF = useCallback(async () => {
    if (!lucrare) return null

    try {
      // Create a new PDF document (A4 portrait)
      const doc = new jsPDF({
        format: "a4",
        unit: "mm",
        orientation: "portrait",
      })

      // Set page dimensions
      const pageWidth = doc.internal.pageSize.width
      const pageHeight = doc.internal.pageSize.height
      const margin = 20

      // Draw header boxes
      doc.setDrawColor(0)
      doc.setLineWidth(0.5)

      // PRESTATOR box (left)
      doc.rect(margin, margin, (pageWidth - 2 * margin) / 2 - 5, 40)
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("PRESTATOR", margin + 2, margin + 6)

      // BENEFICIAR box (right)
      doc.rect(margin + (pageWidth - 2 * margin) / 2 + 5, margin, (pageWidth - 2 * margin) / 2 - 5, 40)
      doc.text("BENEFICIAR", margin + (pageWidth - 2 * margin) / 2 + 7, margin + 6)

      // Add company info to PRESTATOR box
      doc.setFont("helvetica", "normal")
      doc.text("SC. NRG Access Systems S.R.L.", margin + 2, margin + 12)
      doc.text("CUI: RO12345678", margin + 2, margin + 18)
      doc.text("R.C.: J12/3456/2015", margin + 2, margin + 24)
      doc.text("Adresa: Strada Exemplu", margin + 2, margin + 30)
      doc.text("Banca Transilvania", margin + 2, margin + 36)
      doc.text("RO12BTRLRONCRT0123456789", margin + 2, margin + 42)

      // Add client info to BENEFICIAR box
      const clientName = removeDiacritics(lucrare.client || "N/A")
      doc.text(clientName, margin + (pageWidth - 2 * margin) / 2 + 7, margin + 12)
      doc.text("R.C.: -", margin + (pageWidth - 2 * margin) / 2 + 7, margin + 18)
      doc.text(
        "Adresa: " + removeDiacritics(lucrare.locatie || "N/A"),
        margin + (pageWidth - 2 * margin) / 2 + 7,
        margin + 24,
      )
      doc.text("Banca: -", margin + (pageWidth - 2 * margin) / 2 + 7, margin + 30)
      doc.text("Cont: -", margin + (pageWidth - 2 * margin) / 2 + 7, margin + 36)

      // Add NRG logo in the center
      // Since we don't have the actual logo, we'll add text as a placeholder
      doc.setFontSize(24)
      doc.setFont("helvetica", "bold")
      doc.text("NRG", pageWidth / 2, margin + 30, { align: "center" })

      // Add report title
      doc.setFontSize(14)
      doc.text("RAPORT", pageWidth / 2, margin + 55, { align: "center" })
      doc.text("DE", pageWidth / 2, margin + 62, { align: "center" })
      doc.text("INTERVENȚIE", pageWidth / 2, margin + 69, { align: "center" })

      // Add date and time fields
      const dateInterventie = removeDiacritics(lucrare.dataInterventie || "N/A").split(" ")[0]
      const timeParts = (lucrare.dataInterventie || "").split(" ")[1]?.split(":") || ["", ""]
      const timeArrival = timeParts.slice(0, 2).join(":")

      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("Data intervenției:", margin, margin + 85)
      doc.setFont("helvetica", "normal")
      doc.text(dateInterventie, margin + 35, margin + 85)

      doc.setFont("helvetica", "bold")
      doc.text("Ora sosirii:", margin + 70, margin + 85)
      doc.setFont("helvetica", "normal")
      doc.text(timeArrival, margin + 95, margin + 85)

      doc.setFont("helvetica", "bold")
      doc.text("Ora plecării:", margin + 120, margin + 85)
      doc.setFont("helvetica", "normal")
      doc.text(timeArrival, margin + 145, margin + 85)

      // Add findings section
      doc.setFont("helvetica", "bold")
      doc.text("Constatare la locație:", margin, margin + 95)
      doc.setFont("helvetica", "normal")

      // Split text into lines to fit the page width
      const descriereText = removeDiacritics(lucrare.descriere || "N/A")
      const descriereLines = doc.splitTextToSize(descriereText, pageWidth - 2 * margin)
      doc.text(descriereLines, margin, margin + 102)

      // Add intervention description
      const yPosAfterDescriere = margin + 102 + descriereLines.length * 5

      doc.setFont("helvetica", "bold")
      doc.text("Descriere intervenție:", margin, yPosAfterDescriere + 10)
      doc.setFont("helvetica", "normal")

      const interventieText = removeDiacritics(lucrare.descriereInterventie || "N/A")
      const interventieLines = doc.splitTextToSize(interventieText, pageWidth - 2 * margin)
      doc.text(interventieLines, margin, yPosAfterDescriere + 17)

      // Calculate position for the table
      const yPosAfterInterventie = yPosAfterDescriere + 17 + interventieLines.length * 5 + 10

      // Add products table
      doc.setFont("helvetica", "bold")
      doc.text("DATE ESTIMATIV", pageWidth / 2, yPosAfterInterventie, { align: "center" })

      // Draw table
      const tableTop = yPosAfterInterventie + 5
      const tableWidth = pageWidth - 2 * margin
      const colWidths = [10, 80, 15, 25, 25, 25] // Width for each column

      // Calculate column positions
      const colPos = [margin]
      for (let i = 0; i < colWidths.length; i++) {
        colPos.push(colPos[i] + colWidths[i])
      }

      // Draw table header
      doc.rect(margin, tableTop, tableWidth, 8)

      // Draw vertical lines for header
      for (let i = 1; i < colPos.length - 1; i++) {
        doc.line(colPos[i], tableTop, colPos[i], tableTop + 8)
      }

      // Add header text
      doc.setFontSize(8)
      doc.text("NR", margin + 5, tableTop + 5, { align: "center" })
      doc.text("Denumire produs", colPos[1] + 40, tableTop + 5, { align: "center" })
      doc.text("UM", colPos[2] + 7.5, tableTop + 5, { align: "center" })
      doc.text("Cantitate", colPos[3] + 12.5, tableTop + 5, { align: "center" })
      doc.text("Preț unitar", colPos[4] + 12.5, tableTop + 5, { align: "center" })
      doc.text("Total", colPos[5] + 12.5, tableTop + 5, { align: "center" })

      // Draw table rows (3 empty rows if no products)
      const rowHeight = 8
      let currentY = tableTop + 8

      const rowsToDraw = Math.max(3, products.length)

      for (let i = 0; i < rowsToDraw; i++) {
        // Draw horizontal line
        doc.line(margin, currentY, margin + tableWidth, currentY)

        // Draw row
        doc.rect(margin, currentY, tableWidth, rowHeight)

        // Draw vertical lines
        for (let j = 1; j < colPos.length - 1; j++) {
          doc.line(colPos[j], currentY, colPos[j], currentY + rowHeight)
        }

        // Add product data if available
        if (i < products.length) {
          const product = products[i]
          doc.setFontSize(8)
          doc.setFont("helvetica", "normal")

          // Number
          doc.text((i + 1).toString(), margin + 5, currentY + 5, { align: "center" })

          // Product name
          const productName = removeDiacritics(product.name)
          doc.text(productName, colPos[1] + 2, currentY + 5)

          // UM
          doc.text(product.um, colPos[2] + 7.5, currentY + 5, { align: "center" })

          // Quantity
          doc.text(product.quantity.toString(), colPos[3] + 12.5, currentY + 5, { align: "center" })

          // Unit price
          doc.text(product.price.toFixed(2), colPos[4] + 12.5, currentY + 5, { align: "center" })

          // Total
          const total = (product.quantity * product.price).toFixed(2)
          doc.text(total, colPos[5] + 12.5, currentY + 5, { align: "center" })
        }

        currentY += rowHeight
      }

      // Draw bottom line of the last row
      doc.line(margin, currentY, margin + tableWidth, currentY)

      // Add totals section
      currentY += 5

      // Calculate totals
      const subtotal =
        products.length > 0 ? products.reduce((sum, product) => sum + product.quantity * product.price, 0) : 0
      const totalWithVAT = subtotal * 1.19 // 19% VAT

      // Draw total boxes
      doc.rect(colPos[4], currentY, colPos[6] - colPos[4], 7)
      doc.line(colPos[5], currentY, colPos[5], currentY + 7)
      doc.setFont("helvetica", "bold")
      doc.text("Total fără TVA", colPos[4] + 2, currentY + 5)
      doc.setFont("helvetica", "normal")
      doc.text(subtotal.toFixed(2), colPos[5] + 12.5, currentY + 5, { align: "center" })

      currentY += 7

      doc.rect(colPos[4], currentY, colPos[6] - colPos[4], 7)
      doc.line(colPos[5], currentY, colPos[5], currentY + 7)
      doc.setFont("helvetica", "bold")
      doc.text("Total cu TVA", colPos[4] + 2, currentY + 5)
      doc.setFont("helvetica", "normal")
      doc.text(totalWithVAT.toFixed(2), colPos[5] + 12.5, currentY + 5, { align: "center" })

      // Add signature fields
      currentY += 20

      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("Nume tehnician:", margin, currentY)
      doc.text("Reprezentant beneficiar:", margin + 110, currentY)

      currentY += 5
      doc.setFont("helvetica", "normal")
      const tehnicieniText = removeDiacritics(lucrare.tehnicieni?.join(", ") || "N/A")
      doc.text(tehnicieniText, margin, currentY)
      doc.text(removeDiacritics(lucrare.persoanaContact || "N/A"), margin + 110, currentY)

      currentY += 10
      doc.setFont("helvetica", "bold")
      doc.text("Semnătură", margin, currentY)
      doc.text("Semnătură", margin + 110, currentY)

      // Add signatures if available
      if (lucrare.semnaturaTehnician) {
        try {
          doc.addImage(lucrare.semnaturaTehnician, "PNG", margin, currentY + 2, 40, 20)
        } catch (err) {
          console.error("Eroare la adaugarea semnaturii tehnicianului:", err)
        }
      }

      if (lucrare.semnaturaBeneficiar) {
        try {
          doc.addImage(lucrare.semnaturaBeneficiar, "PNG", margin + 110, currentY + 2, 40, 20)
        } catch (err) {
          console.error("Eroare la adaugarea semnaturii beneficiarului:", err)
        }
      }

      // Get PDF as blob for email sending
      const pdfBlob = doc.output("blob")
      return pdfBlob
    } catch (err) {
      console.error("Eroare la generarea PDF-ului:", err)
      return null
    }
  }, [lucrare, products])

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

      // Remove the products validation check
      // if (products.length === 0) {
      //   alert("Vă rugăm să adăugați cel puțin un produs în tabel.")
      //   return
      // }

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

        // Reîncărcăm datele actualizate
        const updatedLucrare = await getLucrareById(params.id)
        if (updatedLucrare) {
          setLucrare(updatedLucrare)

          // Generate PDF
          const pdfBlob = await generatePDF()
          if (pdfBlob) {
            setPdfBlob(pdfBlob)

            // Send email
            const emailSuccess = await sendEmail(pdfBlob)
            setEmailSent(emailSuccess)

            // Save PDF locally
            const link = document.createElement("a")
            link.href = URL.createObjectURL(pdfBlob)
            link.download = `Raport_Interventie_${updatedLucrare.id}.pdf`
            link.click()
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
    if (pdfBlob) {
      // If we already have the PDF blob, use it
      const link = document.createElement("a")
      link.href = URL.createObjectURL(pdfBlob)
      link.download = `Raport_Interventie_${lucrare.id}.pdf`
      link.click()
    } else {
      // Otherwise generate a new one
      const newPdfBlob = await generatePDF()
      if (newPdfBlob) {
        setPdfBlob(newPdfBlob)
        const link = document.createElement("a")
        link.href = URL.createObjectURL(newPdfBlob)
        link.download = `Raport_Interventie_${lucrare.id}.pdf`
        link.click()
      }
    }
  }, [pdfBlob, generatePDF, lucrare])

  const handleResendEmail = useCallback(async () => {
    if (!email) {
      alert("Vă rugăm să introduceți adresa de email pentru trimiterea raportului.")
      return
    }

    setIsSubmitting(true)
    try {
      let blob = pdfBlob
      if (!blob) {
        blob = await generatePDF()
        if (blob) {
          setPdfBlob(blob)
        } else {
          throw new Error("Nu s-a putut genera PDF-ul")
        }
      }

      if (blob) {
        await sendEmail(blob)
      }
    } catch (error) {
      console.error("Eroare la retrimiterea emailului:", error)
    } finally {
      setIsSubmitting(false)
    }
  }, [email, pdfBlob, generatePDF, sendEmail])

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

                <div>
                  <h3 className="font-medium text-gray-500">Lucrări Efectuate</h3>
                  <ul className="list-inside list-disc">
                    <li>Înlocuire panou deteriorat</li>
                    <li>Reglare sistem de închidere</li>
                    <li>Testare funcționalitate</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-500">Materiale Utilizate</h3>
                  <ul className="list-inside list-disc">
                    <li>Panou secțional 1000x500mm - 1 buc</li>
                    <li>Set șuruburi fixare - 1 set</li>
                    <li>Spray lubrifiant - 1 buc</li>
                  </ul>
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
