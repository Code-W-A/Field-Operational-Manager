"use client"

import { useState } from "react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/components/ui/use-toast"

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

export function ReportGenerator({ lucrare, onGenerate }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  /* -------------------------- PDF GENERATION CORE ------------------------- */
  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return

    setIsGenerating(true)

    try {
      /* ------------------------- DOCUMENT BASICS ------------------------- */
      const doc = new jsPDF({ format: "a4", unit: "mm" })
      const margin = 12
      const pageWidth = doc.internal.pageSize.getWidth()
      const contentWidth = pageWidth - margin * 2
      const pageHeight = doc.internal.pageSize.getHeight()

      /* ------------------------ SHARED FONT SETUP ------------------------ */
      doc.setFont("helvetica", "normal")

      /* --------------------------- HEADER BOXES -------------------------- */
      const headerBoxHeight = 32
      const boxGap = 4
      const leftBoxWidth = contentWidth / 2 - boxGap
      const rightBoxX = margin + leftBoxWidth + boxGap * 2

      // Draw rectangles
      doc.rect(margin, margin, leftBoxWidth, headerBoxHeight)
      doc.rect(rightBoxX, margin, leftBoxWidth, headerBoxHeight)

      // Section titles
      doc.setFontSize(10).setFont(undefined, "bold")
      doc.text("PRESTATOR", margin + leftBoxWidth / 2, margin + 5, {
        align: "center",
      })
      doc.text("BENEFICIAR", rightBoxX + leftBoxWidth / 2, margin + 5, {
        align: "center",
      })

      // Prestator details (static)
      doc.setFontSize(9).setFont(undefined, "normal")
      const prestatorLines = [
        "SC NRG Access Systems S.R.L.",
        "CUI: RO34729143",
        "R.C.: J04/599/2015",
        "Banca: Transilvania",
        "IBAN: RO79BTRLROCRT0345549801",
        "Chiajna, Ilfov",
      ]
      prestatorLines.forEach((l, i) =>
        doc.text(l, margin + 2, margin + 10 + i * 4)
      )

      // Beneficiar details (dynamic)
      const beneficiarLines = [
        removeDiacritics(lucrare.client ?? "-"),
        `CUI: ${lucrare.clientCui ?? "-"}`,
        `R.C.: ${lucrare.clientRc ?? "-"}`,
        `Adresa: ${removeDiacritics(lucrare.locatie ?? "-")}`,
        "Cont: -",
      ]
      beneficiarLines.forEach((l, i) =>
        doc.text(l, rightBoxX + 2, margin + 10 + i * 4)
      )

      /* ------------------------- COMPANY LOGO --------------------------- */
      try {
        const img = new Image()
        img.src = "/logo-placeholder.png" // replace with real path
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = rej
        })
        const logoWidth = 42
        const logoHeight = (img.height * logoWidth) / img.width
        doc.addImage(
          img,
          "PNG",
          pageWidth / 2 - logoWidth / 2,
          margin + headerBoxHeight + 2,
          logoWidth,
          logoHeight
        )
      } catch {
        /* silent – logo is optional */
      }

      /* -------------------------- MAIN TITLE ---------------------------- */
      doc.setFont(undefined, "bold").setFontSize(15)
      doc.text(
        "RAPORT DE INTERVENTIE",
        pageWidth / 2,
        margin + headerBoxHeight + 18,
        { align: "center" }
      )

      /* ------------------ DATE / TIME (3 inline fields) ----------------- */
      doc.setFontSize(10).setFont(undefined, "normal")
      const yMeta = margin + headerBoxHeight + 30
      const fieldW = (contentWidth - 2 * boxGap) / 3

      const [dataInterventie = "-", oraSosire = "-", oraPlecare = "-"] = (
        removeDiacritics(lucrare.dataInterventie || "-- --:--").split(" ") as string[]
      )

      const metaFields = [
        [`Data interventiei:`, dataInterventie],
        [`Ora sosire:`, oraSosire],
        [`Ora plecare:`, oraPlecare],
      ] as const

      metaFields.forEach(([label, value], i) => {
        const xStart = margin + i * (fieldW + boxGap)
        doc.text(`${label} ${value}`, xStart, yMeta)
        // underline field
        doc.line(xStart, yMeta + 1, xStart + fieldW, yMeta + 1)
      })

      /* ----------------------- FINDINGS SECTION ------------------------- */
      let cursorY = yMeta + 10
      const drawSection = (
        title: string,
        body: string,
        maxHeight = 35
      ) => {
        doc.setFont(undefined, "bold").text(title, margin, cursorY)
        doc.setFont(undefined, "normal")
        const lines = doc.splitTextToSize(removeDiacritics(body), contentWidth)
        doc.text(lines, margin, cursorY + 5)
        cursorY += Math.min(maxHeight, lines.length * 4 + 8)
      }

      drawSection("Constatare la locatie:", lucrare.defectReclamat || "-")
      drawSection("Descriere interventie:", lucrare.descriereInterventie || "-")

      /* ---------------------- ESTIMATE TABLE ---------------------------- */
      cursorY += 4
      doc.setFont(undefined, "bold").text("DEVIZ ESTIMATIV", pageWidth / 2, cursorY, {
        align: "center",
      })
      cursorY += 3

      // table dimensions
      const rowHeight = 8
      const tableRows = 4 // header + 3 blanks
      const tableHeight = rowHeight * tableRows

      // column positions (mirroring physical form)
      const colX = [0, 10, 90, 110, 140, 170, contentWidth]
        .map((v) => margin + v)
        .slice(0, 7)

      // outer border
      doc.rect(colX[0], cursorY, contentWidth, tableHeight)
      // inner vertical lines
      for (let i = 1; i < colX.length - 1; i++) {
        doc.line(colX[i], cursorY, colX[i], cursorY + tableHeight)
      }
      // horizontal header line
      doc.line(colX[0], cursorY + rowHeight, colX[colX.length - 1], cursorY + rowHeight)

      // header text
      doc.setFontSize(8).setFont(undefined, "bold")
      const headerLabels = [
        "NR",
        "Denumire produse",
        "UM",
        "Cantitate",
        "Pret unitar",
        "Total",
      ]
      headerLabels.forEach((lbl, idx) => {
        const x = (colX[idx] + colX[idx + 1]) / 2
        doc.text(lbl, x, cursorY + 5, { align: "center" })
      })

      cursorY += tableHeight + 6

      /* ------------------------ SIGNATURE BLOCK ------------------------- */
      const sigBlockTop = cursorY
      const sigBlockHeight = 30

      const leftSigX = margin
      const rightSigX = margin + contentWidth / 2 + 10

      doc.setFont(undefined, "normal").setFontSize(10)
      doc.text("Nume tehnician:", leftSigX, sigBlockTop)
      doc.text("Reprezentant beneficiar:", rightSigX, sigBlockTop)
      doc.text(removeDiacritics(lucrare.tehnicieni?.join(", ") || "-"), leftSigX, sigBlockTop + 5)
      doc.text(removeDiacritics(lucrare.persoanaContact || "-"), rightSigX, sigBlockTop + 5)

      doc.text("Semnatura:", leftSigX, sigBlockTop + 15)
      doc.text("Semnatura:", rightSigX, sigBlockTop + 15)

      // Draw signature images if available
      try {
        if (lucrare.semnaturaTehnician)
          doc.addImage(
            lucrare.semnaturaTehnician,
            "PNG",
            leftSigX,
            sigBlockTop + 17,
            60,
            20
          )
      } catch {/* ignore */}

      try {
        if (lucrare.semnaturaBeneficiar)
          doc.addImage(
            lucrare.semnaturaBeneficiar,
            "PNG",
            rightSigX,
            sigBlockTop + 17,
            60,
            20
          )
      } catch {/* ignore */}

      /* --------------------- OUTPUT / CALLBACK -------------------------- */
      const pdfBlob = doc.output("blob")
      doc.save(`Raport_Interventie_${lucrare.id}.pdf`)
      onGenerate?.(pdfBlob)

      toast({
        title: "PDF generat cu succes",
        description: "Raportul a fost descarcat.",
      })
    } catch (e) {
      console.error(e)
      toast({
        title: "Eroare la generarea PDF‑ului",
        description: "Verificati consola pentru detalii.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  })

  /* ----------------------- RENDER COMPONENT ---------------------------- */
  return (
    <Button
      onClick={generatePDF}
      disabled={
        isGenerating ||
        !lucrare?.semnaturaTehnician ||
        !lucrare?.semnaturaBeneficiar
      }
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      {isGenerating ? "Se generează..." : "Descarcă PDF"}
    </Button>
  )
}
