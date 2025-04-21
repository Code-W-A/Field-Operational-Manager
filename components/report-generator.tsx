"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { jsPDF } from "jspdf"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/components/ui/use-toast"

interface ReportGeneratorProps {
  lucrare: Lucrare
  onGenerate?: (pdfBlob: Blob) => void
}

export function ReportGenerator({ lucrare, onGenerate }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  // Use useStableCallback to ensure we always have the latest lucrare
  // while maintaining a stable function reference
  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return

    setIsGenerating(true)

    try {
      // Create a new PDF document
      const doc = new jsPDF()

      // Helper function to remove Romanian diacritics
      const removeDiacritics = (text) => {
        return text
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
      }

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

      // Add NRG logo
      try {
        const img = new Image()
        img.crossOrigin = "anonymous"

        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = "/logo-placeholder.png"
        })

        // Calculate dimensions to maintain aspect ratio
        const logoWidth = 40
        const logoHeight = (img.height * logoWidth) / img.width

        // Add logo in the center
        doc.addImage(img, "PNG", pageWidth / 2 - logoWidth / 2, margin + 42, logoWidth, logoHeight)
      } catch (err) {
        console.error("Eroare la adaugarea logo-ului:", err)
      }

      // Add title
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.text("RAPORT DE INTERVENTIE", pageWidth / 2, margin + 55, { align: "center" })

      // Add date and time fields
      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")

      const dateInterventie = removeDiacritics(lucrare.dataInterventie || "N/A")
      const parts = dateInterventie.split(" ")
      const datePart = parts[0] || "N/A"
      const timePart = parts[1] || "N/A"

      doc.text("Data interventiei: " + datePart, margin, margin + 70)
      doc.text("Ora sosire: " + timePart, margin + 70, margin + 70)
      doc.text("Ora plecare: " + timePart, margin + 140, margin + 70)

      // Add findings section
      doc.setFont("helvetica", "bold")
      doc.text("Constatare la locatie:", margin, margin + 85)
      doc.setFont("helvetica", "normal")

      const defectText = removeDiacritics(lucrare.defectReclamat || "N/A")
      const defectLines = doc.splitTextToSize(defectText, contentWidth)
      doc.text(defectLines, margin, margin + 90)

      // Add intervention description
      doc.setFont("helvetica", "bold")
      doc.text("Descriere interventie:", margin, margin + 110)
      doc.setFont("helvetica", "normal")

      const interventieText = removeDiacritics(lucrare.descriereInterventie || "N/A")
      const interventieLines = doc.splitTextToSize(interventieText, contentWidth)
      doc.text(interventieLines, margin, margin + 115)

      // Add estimated data table
      const tableTop = margin + 140
      doc.setFont("helvetica", "bold")
      doc.text("DATE ESTIMATIV", pageWidth / 2, tableTop - 5, { align: "center" })

      // Draw table header
      doc.rect(margin, tableTop, contentWidth, 10, "S")
      doc.line(margin + 10, tableTop, margin + 10, tableTop + 40) // NR column
      doc.line(margin + 90, tableTop, margin + 90, tableTop + 40) // Denumire produse column
      doc.line(margin + 110, tableTop, margin + 110, tableTop + 40) // UM column
      doc.line(margin + 140, tableTop, margin + 140, tableTop + 40) // Cantitate column
      doc.line(margin + 170, tableTop, margin + 170, tableTop + 40) // Pret unitar column

      // Table header text
      doc.setFontSize(8)
      doc.text("NR", margin + 5, tableTop + 5, { align: "center" })
      doc.text("Denumire produse", margin + 50, tableTop + 5, { align: "center" })
      doc.text("UM", margin + 100, tableTop + 5, { align: "center" })
      doc.text("Cantitate", margin + 125, tableTop + 5, { align: "center" })
      doc.text("Pret unitar", margin + 155, tableTop + 5, { align: "center" })
      doc.text("Total", margin + 175, tableTop + 5, { align: "center" })

      // Draw table rows (3 empty rows)
      for (let i = 0; i < 3; i++) {
        doc.line(margin, tableTop + 10 + i * 10, margin + contentWidth, tableTop + 10 + i * 10)
      }

      // Draw table footer
      doc.line(margin, tableTop + 40, margin + contentWidth, tableTop + 40)
      doc.line(margin, tableTop + 50, margin + contentWidth, tableTop + 50)
      doc.line(margin, tableTop + 60, margin + contentWidth, tableTop + 60)

      // Table footer text
      doc.text("Total fara TVA", margin + 140, tableTop + 45, { align: "right" })
      doc.text("Total cu TVA", margin + 140, tableTop + 55, { align: "right" })

      // Add signature fields
      const signatureTop = tableTop + 80

      doc.setFontSize(10)
      doc.text("Nume tehnician:", margin, signatureTop)
      doc.text("Reprezentant beneficiar:", margin + 120, signatureTop)

      doc.text("Semnatura:", margin, signatureTop + 20)
      doc.text("Semnatura:", margin + 120, signatureTop + 20)

      // Add technician name
      const tehnicianText = removeDiacritics(lucrare.tehnicieni?.join(", ") || "N/A")
      doc.text(tehnicianText, margin, signatureTop + 5)

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

      // Call onGenerate callback if it exists
      if (onGenerate) {
        onGenerate(pdfBlob)
      }

      // Save PDF
      doc.save(`Raport_Interventie_${lucrare.id}.pdf`)

      toast({
        title: "PDF generat cu succes",
        description: "Raportul a fost generat si descarcat.",
      })

      return pdfBlob
    } catch (err) {
      console.error("Eroare la generarea PDF-ului:", err)
      toast({
        title: "Eroare",
        description: "A aparut o eroare la generarea raportului PDF.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  })

  return (
    <Button
      onClick={generatePDF}
      disabled={isGenerating || !lucrare?.semnaturaTehnician || !lucrare?.semnaturaBeneficiar}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      {isGenerating ? "Se generează..." : "Descarcă PDF"}
    </Button>
  )
}
