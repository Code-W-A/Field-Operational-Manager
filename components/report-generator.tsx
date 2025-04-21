"use client"

// ---------------------------------------------------------------------------
// ReportGenerator – Refined PDF layout with improved spacing and pagination
// ---------------------------------------------------------------------------
// 🔄 IMPROVEMENTS:
//   • Fixed element overlapping with proper spacing and pagination
//   • Enhanced table display with dynamic row heights for product details
//   • Improved signature positioning and display
//   • Added automatic page breaks to prevent content overflow
//   • Better handling of long text with proper wrapping
// ---------------------------------------------------------------------------

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

// strip diacritics to use built‑in Helvetica; swap to custom TTF if needed
const normalize = (text = "") =>
  text.replace(
    /[ăâîșțĂÂÎȘȚ]/g,
    (c) => (({ ă: "a", â: "a", î: "i", ș: "s", ț: "t", Ă: "A", Â: "A", Î: "I", Ș: "S", Ț: "T" }) as any)[c],
  )

// A4 portrait: 210×297 mm
const M = 15 // page margin
const W = 210 - 2 * M // content width
const BOX_RADIUS = 2 // 2 mm rounded corners
const STROKE = 0.3 // line width (pt)
const LIGHT_GRAY = 240 // fill shade (lighter)
const DARK_GRAY = 210 // darker fill for headers

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate }, ref) => {
  const [isGen, setIsGen] = useState(false)
  const [products, setProducts] = useState<Product[]>(lucrare?.products || [])

  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return
    setIsGen(true)
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" })
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()

      // Track current Y position for content placement
      let currentY = M

      // Function to check if we need a new page
      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > PH - M) {
          doc.addPage()
          currentY = M
          return true
        }
        return false
      }

      // Draw box with title and content
      const drawBox = (title: string, lines: string[], boxWidth: number, boxHeight: number, x: number) => {
        // Check if we need a new page
        checkPageBreak(boxHeight + 5)

        doc.setDrawColor(60).setFillColor(LIGHT_GRAY).setLineWidth(STROKE)
        ;(doc as any).roundedRect(x, currentY, boxWidth, boxHeight, BOX_RADIUS, BOX_RADIUS, "FD")

        doc
          .setFontSize(10)
          .setFont(undefined, "bold")
          .setTextColor(40)
          .text(title, x + boxWidth / 2, currentY + 6, { align: "center" })

        doc.setFontSize(8).setFont(undefined, "normal").setTextColor(20)
        lines.forEach((txt, i) => {
          const yy = currentY + 10 + i * 5
          doc.text(txt, x + 3, yy)
          doc
            .setDrawColor(200)
            .setLineWidth(0.15)
            .line(x + 3, yy + 1.5, x + boxWidth - 3, yy + 1.5)
        })
      }

      // HEADER BOXES
      const boxH = 36
      const logoArea = 40
      const boxW = (W - logoArea) / 2

      // Draw prestator box
      drawBox(
        "PRESTATOR",
        [
          "SC. NRG Access Systems S.R.L.",
          "CUI: RO43272913",
          "R.C.: J40/991/2015",
          "Chiajna, Ilfov",
          "Banca Transilvania",
          "RO79BTRL RON CRT 0294 5948 01",
        ],
        boxW,
        boxH,
        M,
      )

      // Draw beneficiar box
      drawBox(
        "BENEFICIAR",
        [
          normalize(lucrare.client || "-"),
          "CUI: -",
          "R.C.: -",
          `Adresa: ${normalize(lucrare.locatie || "-")}`,
          "Banca: -",
          "Cont: -",
        ],
        boxW,
        boxH,
        M + boxW + logoArea,
      )

      // LOGO
      doc.setDrawColor(60).setLineWidth(STROKE)
      ;(doc as any).roundedRect(M + boxW + 2, currentY + 3, logoArea - 4, boxH - 6, 1.5, 1.5, "S")
      if (lucrare.logoNRG) {
        try {
          doc.addImage(lucrare.logoNRG, "PNG", M + boxW + 4, currentY + 5, logoArea - 8, boxH - 10)
        } catch {}
      } else {
        // Fallback text if no logo
        doc
          .setFontSize(14)
          .setFont(undefined, "bold")
          .setTextColor(60)
          .text("NRG", M + boxW + logoArea / 2, currentY + boxH / 2, { align: "center" })
      }

      // Update current Y position after header boxes
      currentY += boxH + 10

      // MAIN TITLE
      doc
        .setFontSize(16)
        .setFont(undefined, "bold")
        .setTextColor(20)
        .text("RAPORT DE INTERVENTIE", PW / 2, currentY, { align: "center" })
      currentY += 10

      // META INFO
      doc.setFontSize(9).setFont(undefined, "normal").setTextColor(0)
      const [d, t] = (lucrare.dataInterventie || " - -").split(" ")
      doc.text(`Data: ${normalize(d)}`, M, currentY)
      doc.text(`Sosire: ${t || "-"}`, M + 70, currentY)
      doc.text(`Plecare: ${lucrare.oraPlecare || "-"}`, M + 120, currentY)
      doc.text(`Raport #${lucrare.id || ""}`, PW - M, currentY, { align: "right" })
      currentY += 10

      // COMMENT BLOCKS
      const addTextBlock = (label: string, text: string) => {
        // Check if we need a new page
        checkPageBreak(50) // Height estimate for text block

        // Draw label
        doc.setFont(undefined, "bold").setFontSize(10).text(label, M, currentY)
        currentY += 4

        // Draw box
        const boxHeight = 30
        doc.setDrawColor(150).setLineWidth(0.2).rect(M, currentY, W, boxHeight, "S")

        // Draw horizontal lines
        for (let i = 1; i < 6; i++) {
          doc.line(M, currentY + i * 6, M + W, currentY + i * 6)
        }

        // Add text content with wrapping
        doc.setFont(undefined, "normal").setFontSize(8)
        const lines = doc.splitTextToSize(normalize(text || ""), W - 4)
        doc.text(lines, M + 2, currentY + 5)

        // Update position
        currentY += boxHeight + 10
      }

      // Add text blocks
      addTextBlock("Constatare la locatie:", lucrare.descriere || "")
      addTextBlock("Descriere interventie:", lucrare.descriereInterventie || "")

      // PRODUCT TABLE
      // Check if we need a new page for the table header
      checkPageBreak(15)

      // Table header
      doc.setFillColor(DARK_GRAY).setDrawColor(60).setLineWidth(STROKE)
      doc.rect(M, currentY, W, 8, "FD")
      doc
        .setFontSize(10)
        .setFont(undefined, "bold")
        .setTextColor(20)
        .text("DEVIZ ESTIMATIV", PW / 2, currentY + 5, { align: "center" })
      currentY += 8

      // Define column widths (percentage of total width)
      const colWidths = [
        W * 0.08, // # (8%)
        W * 0.47, // Product name (47%)
        W * 0.1, // UM (10%)
        W * 0.1, // Quantity (10%)
        W * 0.125, // Price (12.5%)
        W * 0.125, // Total (12.5%)
      ]

      // Calculate column positions
      const colPos = [M]
      for (let i = 0; i < colWidths.length; i++) {
        colPos.push(colPos[i] + colWidths[i])
      }

      // Table column headers
      checkPageBreak(10)
      doc.setFillColor(LIGHT_GRAY)
      doc.rect(M, currentY, W, 7, "FD")

      const headers = ["#", "Produs", "UM", "Cant.", "Preț", "Total"]
      doc.setFontSize(8).setFont(undefined, "bold").setTextColor(40)

      headers.forEach((header, i) => {
        const x = colPos[i] + colWidths[i] / 2
        doc.text(header, x, currentY + 5, { align: "center" })
      })

      // Draw vertical lines for headers
      for (let i = 0; i <= colWidths.length; i++) {
        doc.line(colPos[i], currentY, colPos[i], currentY + 7)
      }

      // Draw horizontal line after headers
      doc.line(M, currentY + 7, M + W, currentY + 7)
      currentY += 7

      // Table rows
      const productsToShow =
        products.length > 0
          ? products
          : [
              { id: "1", name: "", um: "", quantity: 0, price: 0, total: 0 },
              { id: "2", name: "", um: "", quantity: 0, price: 0, total: 0 },
              { id: "3", name: "", um: "", quantity: 0, price: 0, total: 0 },
            ]

      productsToShow.forEach((product, index) => {
        // Calculate row height based on product name length
        const productName = normalize(product.name || "")
        const nameLines = doc.splitTextToSize(productName, colWidths[1] - 4)
        const rowHeight = Math.max(7, nameLines.length * 4 + 2)

        // Check if we need a new page
        if (checkPageBreak(rowHeight)) {
          // If new page, redraw the table headers
          doc.setFillColor(LIGHT_GRAY)
          doc.rect(M, currentY, W, 7, "FD")

          doc.setFontSize(8).setFont(undefined, "bold").setTextColor(40)
          headers.forEach((header, i) => {
            const x = colPos[i] + colWidths[i] / 2
            doc.text(header, x, currentY + 5, { align: "center" })
          })

          for (let i = 0; i <= colWidths.length; i++) {
            doc.line(colPos[i], currentY, colPos[i], currentY + 7)
          }

          doc.line(M, currentY + 7, M + W, currentY + 7)
          currentY += 7
        }

        // Zebra striping
        if (index % 2 === 1) {
          doc.setFillColor(248)
          doc.rect(M, currentY, W, rowHeight, "F")
        }

        // Draw cell borders
        doc.setDrawColor(180).setLineWidth(0.2)
        for (let i = 0; i <= colWidths.length; i++) {
          doc.line(colPos[i], currentY, colPos[i], currentY + rowHeight)
        }
        doc.line(M, currentY + rowHeight, M + W, currentY + rowHeight)

        // Cell content
        doc.setFontSize(8).setFont(undefined, "normal").setTextColor(20)

        // Row number
        doc.text((index + 1).toString(), colPos[0] + colWidths[0] / 2, currentY + 4, { align: "center" })

        // Product name (with wrapping)
        nameLines.forEach((line: string, lineIndex: number) => {
          doc.text(line, colPos[1] + 2, currentY + 4 + lineIndex * 4)
        })

        // Other cells
        doc.text(product.um || "-", colPos[2] + colWidths[2] / 2, currentY + 4, { align: "center" })
        doc.text(product.quantity?.toString() || "0", colPos[3] + colWidths[3] / 2, currentY + 4, { align: "center" })
        doc.text(product.price?.toFixed(2) || "0.00", colPos[4] + colWidths[4] / 2, currentY + 4, { align: "center" })

        const total = (product.quantity || 0) * (product.price || 0)
        doc.text(total.toFixed(2), colPos[5] + colWidths[5] / 2, currentY + 4, { align: "center" })

        // Update position
        currentY += rowHeight
      })

      // TOTALS
      checkPageBreak(20)
      currentY += 5

      const subtotal = products.reduce((sum, p) => sum + (p.quantity || 0) * (p.price || 0), 0)
      const vat = subtotal * 1.19

      doc.setFont(undefined, "bold").setFontSize(9).text("Total fără TVA:", colPos[4], currentY)
      doc
        .setFont(undefined, "normal")
        .text(`${subtotal.toFixed(2)} RON`, colPos[5] + colWidths[5] - 2, currentY, { align: "right" })

      currentY += 6
      doc.setFont(undefined, "bold").text("Total cu TVA (19%):", colPos[4], currentY)
      doc
        .setFont(undefined, "normal")
        .text(`${vat.toFixed(2)} RON`, colPos[5] + colWidths[5] - 2, currentY, { align: "right" })

      currentY += 15

      // SIGNATURES
      checkPageBreak(40)

      // Signature labels
      doc
        .setFontSize(9)
        .setFont(undefined, "bold")
        .text("Tehnician:", M, currentY)
        .text("Beneficiar:", M + W / 2, currentY)

      currentY += 5

      // Names
      doc
        .setFont(undefined, "normal")
        .text(normalize(lucrare.tehnicieni?.join(", ") || ""), M, currentY)
        .text(normalize(lucrare.persoanaContact || ""), M + W / 2, currentY)

      currentY += 5

      // Signature images
      const signatureWidth = W / 2 - 10
      const signatureHeight = 25

      if (lucrare.semnaturaTehnician) {
        try {
          doc.addImage(lucrare.semnaturaTehnician, "PNG", M, currentY, signatureWidth, signatureHeight)
        } catch (err) {
          console.error("Error adding technician signature:", err)
        }
      }

      if (lucrare.semnaturaBeneficiar) {
        try {
          doc.addImage(lucrare.semnaturaBeneficiar, "PNG", M + W / 2, currentY, signatureWidth, signatureHeight)
        } catch (err) {
          console.error("Error adding beneficiary signature:", err)
        }
      }

      // Footer
      currentY = PH - M - 5
      doc
        .setFontSize(7)
        .setFont(undefined, "normal")
        .setTextColor(100)
        .text("Document generat automat • Field Operational Manager", PW / 2, currentY, { align: "center" })

      // Generate the PDF blob
      const blob = doc.output("blob")
      doc.save(`Raport_${lucrare.id}.pdf`)
      onGenerate?.(blob)
      toast({ title: "PDF generat!", description: "Descărcare completă." })
      return blob
    } catch (e) {
      console.error(e)
      toast({ title: "Eroare", description: "Generare eșuată.", variant: "destructive" })
    } finally {
      setIsGen(false)
    }
  })

  return (
    <div className="space-y-4">
      <ProductTableForm products={products} onProductsChange={setProducts} />
      <div className="flex justify-center mt-6">
        <Button
          ref={ref}
          onClick={generatePDF}
          disabled={isGen || !lucrare?.semnaturaTehnician || !lucrare?.semnaturaBeneficiar}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {isGen ? "În curs..." : "Descarcă PDF"}
        </Button>
      </div>
    </div>
  )
})

ReportGenerator.displayName = "ReportGenerator"
