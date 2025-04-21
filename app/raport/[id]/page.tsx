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
      // Create a new PDF document
      const doc = new jsPDF()

      // Set page margins
      const margin = 20
      const pageWidth = doc.internal.pageSize.width
      const contentWidth = pageWidth - 2 * margin

      // Draw header boxes
      doc.setDrawColor(0)
      doc.setFillColor(255, 255, 255)

      // Left box - PRESTATOR
      doc.rect(margin, margin, contentWidth / 2 - 5, 40, "S")
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("PRESTATOR", margin + contentWidth / 4 - 20, margin + 5, { align: "center" })

      // Right box - BENEFICIAR
      doc.rect(margin + contentWidth / 2 + 5, margin, contentWidth / 2 - 5, 40, "S")
      doc.text("BENEFICIAR", margin + contentWidth / 2 + 5 + contentWidth / 4 - 20, margin + 5, { align: "center" })

      // Add company info to PRESTATOR box
      doc.setFont("helvetica", "normal")
      doc.text("SC. NRG Access Systems S.R.L.", margin + 5, margin + 10)
      doc.text("CUI: RO12345678", margin + 5, margin + 15)
      doc.text("R.C.: J12/3456/2015", margin + 5, margin + 20)
      doc.text("Adresa: Strada Exemplu", margin + 5, margin + 25)
      doc.text("Banca: Transilvania", margin + 5, margin + 30)
      doc.text("IBAN: RO12BTRLRONCRT0123456789", margin + 5, margin + 35)

      // Add client info to BENEFICIAR box
      const clientName = removeDiacritics(lucrare.client || "N/A")
      const contactPerson = removeDiacritics(lucrare.persoanaContact || "N/A")

      doc.text(clientName, margin + contentWidth / 2 + 10, margin + 10)
      doc.text("CUI: -", margin + contentWidth / 2 + 10, margin + 15)
      doc.text("R.C.: -", margin + contentWidth / 2 + 10, margin + 20)
      doc.text("Adresa: " + removeDiacritics(lucrare.locatie || "N/A"), margin + contentWidth / 2 + 10, margin + 25)
      doc.text("Cont: -", margin + contentWidth / 2 + 10, margin + 30)

      // Add text as a placeholder for logo
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("FIELD OPERATIONAL MANAGER", pageWidth / 2, margin + 45, { align: "center" })
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.text("FOM", pageWidth / 2, margin + 50, { align: "center" })

      // Add title
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.text("RAPORT DE INTERVENTIE", pageWidth / 2, margin + 55, { align: "center" })

      // Add report number and date
      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.text("Nr. Raport: " + (lucrare.id || "N/A"), margin, margin + 65)

      // Add date and time fields
      const dateInterventie = removeDiacritics(lucrare.dataInterventie || "N/A")
      const dateEmiterii = removeDiacritics(lucrare.dataEmiterii || "N/A")
      const parts = dateInterventie.split(" ")
      const datePart = parts[0] || "N/A"
      const timePart = parts[1] || "N/A"

      doc.text("Data emiterii: " + dateEmiterii, margin, margin + 70)
      doc.text("Data interventiei: " + datePart, margin, margin + 75)
      doc.text("Ora sosire: " + timePart, margin + 70, margin + 75)
      doc.text("Ora plecare: " + timePart, margin + 140, margin + 75)

      // Add work type and contract info
      doc.setFont("helvetica", "bold")
      doc.text("Tip lucrare:", margin, margin + 85)
      doc.setFont("helvetica", "normal")
      doc.text(removeDiacritics(lucrare.tipLucrare || "N/A"), margin + 30, margin + 85)

      if (lucrare.tipLucrare === "Intervenție în contract" && lucrare.contractNumber) {
        doc.setFont("helvetica", "bold")
        doc.text("Contract:", margin + 100, margin + 85)
        doc.setFont("helvetica", "normal")
        doc.text(removeDiacritics(lucrare.contractNumber || "N/A"), margin + 130, margin + 85)
      }

      // Add technicians
      doc.setFont("helvetica", "bold")
      doc.text("Tehnicieni:", margin, margin + 90)
      doc.setFont("helvetica", "normal")
      const tehnicieniText = removeDiacritics(lucrare.tehnicieni?.join(", ") || "N/A")
      doc.text(tehnicieniText, margin + 30, margin + 90)

      // Add contact person and phone
      doc.setFont("helvetica", "bold")
      doc.text("Persoana contact:", margin, margin + 95)
      doc.setFont("helvetica", "normal")
      doc.text(contactPerson, margin + 50, margin + 95)

      doc.setFont("helvetica", "bold")
      doc.text("Telefon:", margin + 100, margin + 95)
      doc.setFont("helvetica", "normal")
      doc.text(removeDiacritics(lucrare.telefon || "N/A"), margin + 130, margin + 95)

      // Add reported defect section
      doc.setFont("helvetica", "bold")
      doc.text("Defect reclamat:", margin, margin + 105)
      doc.setFont("helvetica", "normal")

      const defectText = removeDiacritics(lucrare.defectReclamat || "N/A")
      const defectLines = doc.splitTextToSize(defectText, contentWidth)
      doc.text(defectLines, margin, margin + 110)

      // Add findings section
      doc.setFont("helvetica", "bold")
      doc.text("Constatare la locatie:", margin, margin + 125)
      doc.setFont("helvetica", "normal")

      const descriereText = removeDiacritics(lucrare.descriere || "N/A")
      const descriereLines = doc.splitTextToSize(descriereText, contentWidth)
      doc.text(descriereLines, margin, margin + 130)

      // Add intervention description
      doc.setFont("helvetica", "bold")
      doc.text("Descriere interventie:", margin, margin + 145)
      doc.setFont("helvetica", "normal")

      const interventieText = removeDiacritics(lucrare.descriereInterventie || "N/A")
      const interventieLines = doc.splitTextToSize(interventieText, contentWidth)
      doc.text(interventieLines, margin, margin + 150)

      // Add work status
      doc.setFont("helvetica", "bold")
      doc.text("Status lucrare:", margin, margin + 165)
      doc.setFont("helvetica", "normal")
      doc.text(removeDiacritics(lucrare.statusLucrare || "N/A"), margin + 40, margin + 165)

      // Add billing status (if not technician)
      doc.setFont("helvetica", "bold")
      doc.text("Status facturare:", margin + 100, margin + 165)
      doc.setFont("helvetica", "normal")
      doc.text(removeDiacritics(lucrare.statusFacturare || "N/A"), margin + 150, margin + 165)

      // Add products table
      const tableTop = margin + 175
      doc.setFont("helvetica", "bold")
      doc.text("DATE ESTIMATIV", pageWidth / 2, tableTop - 5, { align: "center" })

      // Calculate table dimensions
      const tableStartY = tableTop
      const tableWidth = contentWidth
      const productRowHeight = 20 // Increased height for product rows

      // Draw table header
      doc.setFillColor(240, 240, 240)
      doc.rect(margin, tableStartY, tableWidth, 10, "FD")
      doc.setDrawColor(0)
      doc.setLineWidth(0.1)

      // Table header text
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.text("NR", margin + 5, tableStartY + 6, { align: "center" })
      doc.text("Denumire produse", margin + 50, tableStartY + 6, { align: "center" })
      doc.text("UM", margin + 120, tableStartY + 6, { align: "center" })
      doc.text("Cantitate", margin + 140, tableStartY + 6, { align: "center" })
      doc.text("Pret unitar", margin + 165, tableStartY + 6, { align: "center" })
      doc.text("Total", margin + 185, tableStartY + 6, { align: "center" })

      // Draw vertical lines for header
      doc.line(margin, tableStartY, margin, tableStartY + 10)
      doc.line(margin + 10, tableStartY, margin + 10, tableStartY + 10)
      doc.line(margin + 110, tableStartY, margin + 110, tableStartY + 10)
      doc.line(margin + 130, tableStartY, margin + 130, tableStartY + 10)
      doc.line(margin + 155, tableStartY, margin + 155, tableStartY + 10)
      doc.line(margin + 180, tableStartY, margin + 180, tableStartY + 10)
      doc.line(margin + tableWidth, tableStartY, margin + tableWidth, tableStartY + 10)

      // Draw horizontal line after header
      doc.line(margin, tableStartY + 10, margin + tableWidth, tableStartY + 10)

      // Add products to table
      let currentY = tableStartY + 10
      const maxTableHeight = 100 // Maximum height for the products table

      // Calculate total height needed for all products
      const totalProductsHeight = products.length * productRowHeight

      // Adjust row height if we have too many products
      const adjustedRowHeight = Math.min(productRowHeight, maxTableHeight / Math.max(1, products.length))

      products.forEach((product, index) => {
        // Draw row borders
        doc.line(margin, currentY, margin + tableWidth, currentY) // Top border
        doc.line(margin, currentY, margin, currentY + adjustedRowHeight) // Left border
        doc.line(margin + 10, currentY, margin + 10, currentY + adjustedRowHeight) // After NR
        doc.line(margin + 110, currentY, margin + 110, currentY + adjustedRowHeight) // After Denumire
        doc.line(margin + 130, currentY, margin + 130, currentY + adjustedRowHeight) // After UM
        doc.line(margin + 155, currentY, margin + 155, currentY + adjustedRowHeight) // After Cantitate
        doc.line(margin + 180, currentY, margin + 180, currentY + adjustedRowHeight) // After Pret
        doc.line(margin + tableWidth, currentY, margin + tableWidth, currentY + adjustedRowHeight) // Right border

        // Add product data
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")

        // Number
        doc.text((index + 1).toString(), margin + 5, currentY + 5, { align: "center" })

        // Product name - handle long text with wrapping
        const productName = removeDiacritics(product.name)
        const nameLines = doc.splitTextToSize(productName, 95) // Width for product name
        const lineHeight = 3.5
        nameLines.forEach((line, i) => {
          if (i < 3) {
            // Limit to 3 lines to prevent overflow
            doc.text(line, margin + 12, currentY + 5 + i * lineHeight)
          }
        })

        // Other fields
        doc.text(product.um, margin + 120, currentY + 5, { align: "center" })
        doc.text(product.quantity.toString(), margin + 142, currentY + 5, { align: "center" })
        doc.text(product.price.toFixed(2), margin + 167, currentY + 5, { align: "center" })

        const total = (product.quantity * product.price).toFixed(2)
        doc.text(total, margin + 190, currentY + 5, { align: "center" })

        currentY += adjustedRowHeight
      })

      // Draw bottom border of the last row
      doc.line(margin, currentY, margin + tableWidth, currentY)

      // Add empty rows if needed (to maintain consistent table size)
      const minRows = 3
      if (products.length < minRows) {
        const emptyRows = minRows - products.length
        for (let i = 0; i < emptyRows; i++) {
          // Draw row borders
          doc.line(margin, currentY, margin, currentY + adjustedRowHeight) // Left border
          doc.line(margin + 10, currentY, margin + 10, currentY + adjustedRowHeight) // After NR
          doc.line(margin + 110, currentY, margin + 110, currentY + adjustedRowHeight) // After Denumire
          doc.line(margin + 130, currentY, margin + 130, currentY + adjustedRowHeight) // After UM
          doc.line(margin + 155, currentY, margin + 155, currentY + adjustedRowHeight) // After Cantitate
          doc.line(margin + 180, currentY, margin + 180, currentY + adjustedRowHeight) // After Pret
          doc.line(margin + tableWidth, currentY, margin + tableWidth, currentY + adjustedRowHeight) // Right border

          currentY += adjustedRowHeight
          doc.line(margin, currentY, margin + tableWidth, currentY) // Bottom border
        }
      }

      // Calculate totals
      const subtotal = products.reduce((sum, product) => sum + product.quantity * product.price, 0)
      const totalWithVAT = subtotal * 1.19 // 19% TVA

      // Add totals section
      const totalsY = currentY + 10
      doc.setFont("helvetica", "bold")
      doc.text("Total fara TVA:", margin + 140, totalsY, { align: "right" })
      doc.setFont("helvetica", "normal")
      doc.text(subtotal.toFixed(2) + " RON", margin + 190, totalsY, { align: "center" })

      doc.setFont("helvetica", "bold")
      doc.text("Total cu TVA (19%):", margin + 140, totalsY + 10, { align: "right" })
      doc.setFont("helvetica", "normal")
      doc.text(totalWithVAT.toFixed(2) + " RON", margin + 190, totalsY + 10, { align: "center" })

      // Add signature fields
      const signatureTop = totalsY + 30

      doc.setFontSize(10)
      doc.text("Nume tehnician:", margin, signatureTop)
      doc.text("Reprezentant beneficiar:", margin + 120, signatureTop)

      doc.text("Semnatura:", margin, signatureTop + 20)
      doc.text("Semnatura:", margin + 120, signatureTop + 20)

      // Add technician name
      doc.text(tehnicieniText, margin, signatureTop + 5)

      // Add beneficiary name
      doc.text(contactPerson, margin + 120, signatureTop + 5)

      // Add signatures if available
      if (lucrare.semnaturaTehnician) {
        try {
          doc.addImage(lucrare.semnaturaTehnician, "PNG", margin, signatureTop + 25, 60, 30)
        } catch (err) {
          console.error("Eroare la adaugarea semnaturii tehnicianului:", err)
        }
      }

      if (lucrare.semnaturaBeneficiar) {
        try {
          doc.addImage(lucrare.semnaturaBeneficiar, "PNG", margin + 120, signatureTop + 25, 60, 30)
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

        setEmailSent(true)
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

      if (products.length === 0) {
        alert("Vă rugăm să adăugați cel puțin un produs în tabel.")
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

        // Reîncărcăm datele actualizate
        const updatedLucrare = await getLucrareById(params.id)
        if (updatedLucrare) {
          setLucrare(updatedLucrare)

          // Generate PDF
          const pdfBlob = await generatePDF()
          if (pdfBlob) {
            setPdfBlob(pdfBlob)

            // Send email
            await sendEmail(pdfBlob)

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
                (step === "verificare"
                  ? statusLucrare !== "Finalizat"
                  : !isTechSigned || !isClientSigned || !email || products.length === 0)
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
