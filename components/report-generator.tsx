"use client"

// ---------------------------------------------------------------------------
// ReportGenerator – PDF layout refined for a cleaner, modern look
// ---------------------------------------------------------------------------
// 🔄 MAIN UPDATES:
//   • Rounded corners on header boxes (2 mm radius).
//   • Light gray fill for header sections and table header.
//   • Consistent 1‑pt stroke width, lighter lines for inner rules.
//   • Slightly larger fonts for titles and meta info; cleaner spacing.
//   • Zebra striping on table body for readability.
//   • Modular helper for drawing labeled info boxes.
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
const M = 18 // page margin
const W = 210 - 2 * M // content width
const BOX_RADIUS = 2 // 2 mm rounded corners
const STROKE = 0.3 // line width (pt)
const LIGHT_GRAY = 230 // fill shade

const getColX = (idx: number, widths: number[]) => M + widths.slice(0, idx).reduce((a, b) => a + b, 0)
const COL_W = [10, 80, 15, 20, 22.5, 22.5] as const

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate }, ref) => {
  const [isGen, setIsGen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])

  const drawBox = (doc: jsPDF, x: number, y: number, w: number, h: number, title: string, lines: string[]) => {
    doc.setDrawColor(60).setFillColor(LIGHT_GRAY).setLineWidth(STROKE)
    ;(doc as any).roundedRect(x, y, w, h, BOX_RADIUS, BOX_RADIUS, "FD")
    doc
      .setFontSize(10)
      .setFont(undefined, "bold")
      .setTextColor(40)
      .text(title, x + w / 2, y + 6, { align: "center" })
    doc.setFontSize(8).setFont(undefined, "normal").setTextColor(20)
    lines.forEach((txt, i) => {
      const yy = y + 10 + i * 5
      doc.text(txt, x + 3, yy)
      doc
        .setDrawColor(200)
        .setLineWidth(0.15)
        .line(x + 3, yy + 1.5, x + w - 3, yy + 1.5)
    })
  }

  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return
    setIsGen(true)
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" })
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()

      // HEADER BOXES
      const boxH = 36
      const logoArea = 40
      const boxW = (W - logoArea) / 2

      drawBox(doc, M, M, boxW, boxH, "PRESTATOR", [
        "SC. NRG Access Systems S.R.L.",
        "CUI: RO43272913",
        "R.C.: J40/991/2015",
        "Chiajna, Ilfov",
        "Banca Transilvania",
        "RO79BTRL RON CRT 0294 5948 01",
      ])

      drawBox(doc, M + boxW + logoArea, M, boxW, boxH, "BENEFICIAR", [
        normalize(lucrare.client || "-"),
        "CUI: -",
        "R.C.: -",
        `Adresa: ${normalize(lucrare.locatie || "-")}`,
        "Banca: -",
        "Cont: -",
      ])

      // LOGO
      doc.setDrawColor(60).setLineWidth(STROKE)
      ;(doc as any).roundedRect(M + boxW + 2, M + 3, logoArea - 4, boxH - 6, 1.5, 1.5, "S")
      if (lucrare.logoNRG) {
        try {
          doc.addImage(lucrare.logoNRG, "PNG", M + boxW + 4, M + 5, logoArea - 8, boxH - 10)
        } catch {}
      }

      // MAIN TITLES
      doc
        .setFontSize(16)
        .setFont(undefined, "bold")
        .setTextColor(20)
        .text("RAPORT DE INTERVENTIE", PW / 2, M + boxH + 12, { align: "center" })

      // META INFO
      doc.setFontSize(9).setFont(undefined, "normal").setTextColor(0)
      const [d, t] = (lucrare.dataInterventie || " - -").split(" ")
      doc.text(`Data: ${normalize(d)}`, M, M + boxH + 22)
      doc.text(`Sosire: ${t}`, M + 70, M + boxH + 22)
      doc.text(`Plecare: ${lucrare.oraPlecare || "-"}`, M + 120, M + boxH + 22)
      doc.text(`Raport #${lucrare.id}`, PW - M, M + boxH + 22, { align: "right" })

      // COMMENT BLOCK
      const addLinesBlock = (label: string, text: string, y0: number) => {
        doc.setFont(undefined, "bold").setFontSize(10).text(label, M, y0)
        const by = y0 + 4
        doc.setDrawColor(150).setLineWidth(0.2).rect(M, by, W, 30, "S")
        for (let i = 1; i < 6; i++) {
          doc.line(M, by + i * 6, M + W, by + i * 6)
        }
        doc.setFont(undefined, "normal").setFontSize(8)
        doc.text(doc.splitTextToSize(normalize(text), W - 4), M + 2, by + 8)
        return by + 30 + 6
      }

      let cy = M + boxH + 28
      cy = addLinesBlock("Constatare la locatie:", lucrare.descriere || "", cy)
      cy = addLinesBlock("Descriere interventie:", lucrare.descriereInterventie || "", cy)

      // DEVIZ ESTIMATIV TABLE
      const th = cy + 4
      doc.setFillColor(LIGHT_GRAY).setDrawColor(60).setLineWidth(STROKE)
      doc.rect(M, th, W, 7, "FD")
      doc
        .setFontSize(9)
        .setFont(undefined, "bold")
        .text("DEVIZ ESTIMATIV", PW / 2, th + 5, { align: "center" })

      // HEADER ROW
      const titles = ["#", "Produs", "UM", "Cant.", "Preț", "Total"]
      doc.setFontSize(8).setFont(undefined, "normal").setTextColor(0)
      titles.forEach((t, i) => {
        const x = getColX(i, COL_W) + COL_W[i] / 2
        doc.text(t, x, th + 15, { align: "center" })
        doc.line(getColX(i, COL_W), th + 7, getColX(i, COL_W), th + 7 + 7)
      })
      doc.line(M, th + 7, M + W, th + 7)

      // BODY
      let ry = th + 7
      products.forEach((p, i) => {
        // zebra stripe
        if (i % 2 === 1) doc.setFillColor(245).rect(M, ry, W, 7, "F")

        const row = [
          String(i + 1),
          normalize(p.name),
          p.um,
          String(p.quantity),
          p.price.toFixed(2),
          (p.price * p.quantity).toFixed(2),
        ]
        row.forEach((c, j) => {
          doc.text(c, getColX(j, COL_W) + COL_W[j] / 2, ry + 5, { align: "center" })
          doc.line(getColX(j, COL_W), ry, getColX(j, COL_W), ry + 7)
        })
        doc.line(M, ry + 7, M + W, ry + 7)
        ry += 7
      })

      // TOTALS
      const sub = products.reduce((s, p) => s + p.price * p.quantity, 0)
      const vat = sub * 1.19
      doc
        .setFont(undefined, "bold")
        .setFontSize(10)
        .text("Total fără TVA:", M + W - 50, ry + 8)
        .text("Total cu TVA:", M + W - 50, ry + 14)
      doc
        .setFont(undefined, "normal")
        .text(sub.toFixed(2) + " RON", M + W, ry + 8, { align: "right" })
        .text(vat.toFixed(2) + " RON", M + W, ry + 14, { align: "right" })

      // SIGNATURES
      const sy = ry + 24
      doc
        .setFontSize(9)
        .setFont(undefined, "bold")
        .text("Tehnician:", M, sy)
        .text("Beneficiar:", M + 100, sy)
      doc
        .setFont(undefined, "normal")
        .text(normalize(lucrare.tehnicieni?.join(",") || ""), M, sy + 6)
        .text(normalize(lucrare.persoanaContact || ""), M + 100, sy + 6)

      // finalize
      const blob = doc.output("blob")
      doc.save(`Raport_${lucrare.id}.pdf`)
      if (blob) {
        onGenerate?.(blob)
        return blob
      }
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
