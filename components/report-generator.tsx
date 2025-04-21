"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { jsPDF } from "jspdf"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/components/ui/use-toast"
import { getFileUrl } from "@/lib/firebase/storage"

interface ReportGeneratorProps {
  lucrare: Lucrare
  onGenerate?: (pdfBlob: Blob) => void
}

export function ReportGenerator({ lucrare, onGenerate }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)

  // Încărcăm logo-ul companiei
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const logoUrl = await getFileUrl("settings/company-logo.png").catch(() => null)
        if (logoUrl) {
          setCompanyLogo(logoUrl)
        }
      } catch (error) {
        console.error("Eroare la încărcarea logo-ului:", error)
      }
    }

    fetchLogo()
  }, [])

  // Use useStableCallback to ensure we always have the latest lucrare
  // while maintaining a stable function reference
  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return

    setIsGenerating(true)

    try {
      // Creăm un nou document PDF
      const doc = new jsPDF()

      // Adăugăm logo-ul companiei dacă există
      if (companyLogo) {
        try {
          // Încărcăm imaginea logo-ului
          const img = new Image()
          img.crossOrigin = "anonymous"

          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = companyLogo
          })

          // Calculăm dimensiunile pentru a păstra raportul de aspect
          const imgWidth = 40
          const imgHeight = (img.height * imgWidth) / img.width

          // Adăugăm logo-ul în colțul din stânga sus
          doc.addImage(img, "PNG", 20, 10, imgWidth, imgHeight)
        } catch (err) {
          console.error("Eroare la adăugarea logo-ului în PDF:", err)
        }
      }

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

      // În secțiunea "Detalii Lucrare", adăugăm numărul contractului
      doc.setFontSize(12)
      doc.text(`Tip lucrare: ${lucrare.tipLucrare}`, 20, 120)
      if (lucrare.tipLucrare === "Intervenție în contract") {
        doc.text(`Contract: ${lucrare.contractNumber || "N/A"}`, 20, 130)
        doc.text(`Tehnician: ${lucrare.tehnicieni?.join(", ")}`, 20, 140)
      } else {
        doc.text(`Tehnician: ${lucrare.tehnicieni?.join(", ")}`, 20, 130)
      }

      // Ajustăm poziția pentru defectul reclamat în funcție de prezența contractului
      const yPosDefect = lucrare.tipLucrare === "Intervenție în contract" ? 155 : 145

      // Adăugăm defectul reclamat
      doc.setFontSize(14)
      doc.text("Defect Reclamat", 20, yPosDefect)

      doc.setFontSize(12)
      const defectLines = doc.splitTextToSize(lucrare.defectReclamat || "Nu a fost specificat", 170)
      doc.text(defectLines, 20, yPosDefect + 10)

      // Adăugăm descrierea lucrării
      let yPos = yPosDefect + 10 + defectLines.length * 7

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

      // Obținem PDF-ul ca blob pentru a-l putea trimite prin email
      const pdfBlob = doc.output("blob")

      // Apelăm callback-ul onGenerate dacă există
      if (onGenerate) {
        onGenerate(pdfBlob)
      }

      // Salvăm PDF-ul
      doc.save(`Raport_Interventie_${lucrare.id}.pdf`)

      toast({
        title: "PDF generat cu succes",
        description: "Raportul a fost generat și descărcat.",
      })

      return pdfBlob
    } catch (err) {
      console.error("Eroare la generarea PDF-ului:", err)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la generarea raportului PDF.",
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
