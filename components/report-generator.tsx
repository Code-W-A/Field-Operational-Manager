"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { jsPDF } from "jspdf"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"

interface ReportGeneratorProps {
  lucrare: Lucrare
}

export function ReportGenerator({ lucrare }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  // Use useStableCallback instead of useEffectEvent to ensure we always have the latest lucrare
  // while maintaining a stable function reference
  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return

    setIsGenerating(true)

    try {
      // Creăm un nou document PDF
      const doc = new jsPDF()

      // Adăugăm antetul
      doc.setFontSize(20)
      doc.setTextColor(0, 0, 255)
      doc.text("RAPORT DE INTERVENȚIE", 105, 20, { align: "center" })

      // Adăugăm numărul raportului
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.text(`Nr. ${lucrare.id}`, 105, 30, { align: "center" })

      // Adăugăm data
      doc.text(`Data: ${lucrare.dataInterventie}`, 105, 40, { align: "center" })

      // Adăugăm linie de separare
      doc.setDrawColor(0, 0, 255)
      doc.line(20, 45, 190, 45)

      // Adăugăm informațiile despre client
      doc.setFontSize(14)
      doc.text("Informații Client", 20, 55)

      doc.setFontSize(12)
      doc.text(`Client: ${lucrare.client}`, 20, 65)
      doc.text(`Locație: ${lucrare.locatie}`, 20, 75)
      doc.text(`Persoană contact: ${lucrare.persoanaContact}`, 20, 85)
      doc.text(`Telefon: ${lucrare.telefon}`, 20, 95)

      // Adăugăm informațiile despre lucrare
      doc.setFontSize(14)
      doc.text("Detalii Lucrare", 20, 110)

      doc.setFontSize(12)
      doc.text(`Tip lucrare: ${lucrare.tipLucrare}`, 20, 120)
      doc.text(`Tehnician: ${lucrare.tehnicieni?.join(", ")}`, 20, 130)

      // Adăugăm defectul reclamat
      doc.setFontSize(14)
      doc.text("Defect Reclamat", 20, 145)

      doc.setFontSize(12)
      const defectLines = doc.splitTextToSize(lucrare.defectReclamat || "Nu a fost specificat", 170)
      doc.text(defectLines, 20, 155)

      // Adăugăm descrierea lucrării
      let yPos = 155 + defectLines.length * 7

      doc.setFontSize(14)
      doc.text("Descriere Lucrare", 20, yPos)

      doc.setFontSize(12)
      const descriereLines = doc.splitTextToSize(lucrare.descriere || "Nu a fost specificată", 170)
      doc.text(descriereLines, 20, yPos + 10)

      // Adăugăm descrierea intervenției
      yPos = yPos + 10 + descriereLines.length * 7

      doc.setFontSize(14)
      doc.text("Descriere Intervenție", 20, yPos)

      doc.setFontSize(12)
      const interventieLines = doc.splitTextToSize(lucrare.descriereInterventie || "Nu a fost specificată", 170)
      doc.text(interventieLines, 20, yPos + 10)

      // Verificăm dacă avem nevoie de o pagină nouă pentru semnături
      yPos = yPos + 10 + interventieLines.length * 7 + 20

      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }

      // Adăugăm semnăturile
      doc.setFontSize(14)
      doc.text("Semnături", 105, yPos, { align: "center" })

      // Adăugăm semnătura tehnicianului
      if (lucrare.semnaturaTehnician) {
        doc.setFontSize(12)
        doc.text("Semnătură Tehnician", 60, yPos + 10, { align: "center" })

        // Adăugăm imaginea semnăturii
        try {
          doc.addImage(lucrare.semnaturaTehnician, "PNG", 20, yPos + 15, 80, 40)
        } catch (err) {
          console.error("Eroare la adăugarea semnăturii tehnicianului:", err)
          doc.text("Eroare la încărcarea semnăturii", 60, yPos + 35, { align: "center" })
        }

        // Adăugăm numele tehnicianului sub semnătură
        doc.text(lucrare.tehnicieni?.join(", ") || "", 60, yPos + 60, { align: "center" })
      } else {
        doc.setFontSize(12)
        doc.text("Semnătură Tehnician lipsă", 60, yPos + 35, { align: "center" })
      }

      // Adăugăm semnătura beneficiarului
      if (lucrare.semnaturaBeneficiar) {
        doc.setFontSize(12)
        doc.text("Semnătură Beneficiar", 150, yPos + 10, { align: "center" })

        // Adăugăm imaginea semnăturii
        try {
          doc.addImage(lucrare.semnaturaBeneficiar, "PNG", 110, yPos + 15, 80, 40)
        } catch (err) {
          console.error("Eroare la adăugarea semnăturii beneficiarului:", err)
          doc.text("Eroare la încărcarea semnăturii", 150, yPos + 35, { align: "center" })
        }

        // Adăugăm numele beneficiarului sub semnătură
        doc.text(lucrare.persoanaContact || "", 150, yPos + 60, { align: "center" })
      } else {
        doc.setFontSize(12)
        doc.text("Semnătură Beneficiar lipsă", 150, yPos + 35, { align: "center" })
      }

      // Adăugăm footer
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(10)
        doc.text(`Pagina ${i} din ${pageCount}`, 105, 285, { align: "center" })
      }

      // Salvăm PDF-ul
      doc.save(`Raport_Interventie_${lucrare.id}.pdf`)
    } catch (err) {
      console.error("Eroare la generarea PDF-ului:", err)
      alert("A apărut o eroare la generarea raportului PDF.")
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
