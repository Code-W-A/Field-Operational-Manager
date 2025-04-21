"use client"

import { useState, forwardRef } from "react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/components/ui/use-toast"
import { ProductTableForm, type Product } from "./product-table-form"

interface ReportGeneratorProps {
  lucrare: Lucrare
  onGenerate?: (pdf: Blob) => void
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTION                               */
/* -------------------------------------------------------------------------- */

// jsPDF does not embed a full‑latin font by default; we strip Romanian
// diacritics so we can use the built‑in Helvetica.  Replace this with a custom
// TTF if you want to keep diacritics intact.
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

/* -------------------------------------------------------------------------- */
/*                           MAIN REACT COMPONENT                             */
/* -------------------------------------------------------------------------- */

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate }, ref) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [products, setProducts] = useState<Product[]>([])

  /* -------------------------- PDF GENERATION CORE ------------------------- */
  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return

    setIsGenerating(true)

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

      // Draw table rows with product data
      const rowHeight = 10
      let currentY = tableTop + 10

      // Add products to table
      products.forEach((product, index) => {
        if (index > 0) {
          doc.line(margin, currentY, margin + contentWidth, currentY)
        }

        doc.setFontSize(8)
        doc.text((index + 1).toString(), margin + 5, currentY + 5, { align: "center" })
        doc.text(removeDiacritics(product.name), margin + 15, currentY + 5)
        doc.text(product.um, margin + 100, currentY + 5, { align: "center" })
        doc.text(product.quantity.toString(), margin + 125, currentY + 5, { align: "center" })
        doc.text(product.price.toFixed(2), margin + 155, currentY + 5, { align: "center" })

        const total = (product.quantity * product.price).toFixed(2)
        doc.text(total, margin + 185, currentY + 5, { align: "center" })

        currentY += rowHeight
      })

      // Fill remaining rows if needed
      const maxRows = 3
      const emptyRows = Math.max(0, maxRows - products.length)

      for (let i = 0; i < emptyRows; i++) {
        doc.line(margin, currentY, margin + contentWidth, currentY)
        currentY += rowHeight
      }

      // Draw table footer
      doc.line(margin, tableTop + 40, margin + contentWidth, tableTop + 40)
      doc.line(margin, tableTop + 50, margin + contentWidth, tableTop + 50)
      doc.line(margin, tableTop + 60, margin + contentWidth, tableTop + 60)

      // Calculate totals
      const subtotal = products.reduce((sum, product) => sum + product.quantity * product.price, 0)
      const totalWithVAT = subtotal * 1.19 // 19% TVA

      // Table footer text
      doc.text("Total fara TVA", margin + 140, tableTop + 45, { align: "right" })
      doc.text(subtotal.toFixed(2) + " RON", margin + 185, tableTop + 45, { align: "center" })

      doc.text("Total cu TVA", margin + 140, tableTop + 55, { align: "right" })
      doc.text(totalWithVAT.toFixed(2) + " RON", margin + 185, tableTop + 55, { align: "center" })

      // Add signature fields
      const signatureTop = tableTop + 80

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

  /* ----------------------- RENDER COMPONENT ---------------------------- */
  return (
    <div className="space-y-4">
      <ProductTableForm products={products} onProductsChange={setProducts} />

      <div className="flex justify-center mt-6">
        <Button
          ref={ref}
          onClick={generatePDF}
          disabled={isGenerating || !lucrare?.semnaturaTehnician || !lucrare?.semnaturaBeneficiar}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {isGenerating ? "Se generează..." : "Descarcă PDF"}
        </Button>
      </div>
    </div>
  )
})

ReportGenerator.displayName = "ReportGenerator"
