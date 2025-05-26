"use client"

import { useState, forwardRef, useEffect } from "react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/components/ui/use-toast"
import { ProductTableForm, type Product } from "./product-table-form"
import { formatDate, formatTime, calculateDuration } from "@/lib/utils/time-format"
import { doc as docRef, updateDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { logoDataUrl } from "@/lib/utils/logoDataUrl" // Import logoDataUrl

interface ReportGeneratorProps {
  lucrare: Lucrare & { products?: Product[] }
  onGenerate?: (pdf: Blob) => void
}

// strip diacritics to use built‑in Helvetica; swap to custom TTF if needed
const normalize = (text = "") =>
  text.replace(
    /[ăâîșțĂÂÎȘȚ]/g,
    (c) => (({ ă: "a", â: "a", î: "i", ș: "s", ț: "t", Ă: "A", Â: "A", Î: "I", Ș: "S", Ț: "T" }) as any)[c],
  )

// Funcție pentru construirea PDF-ului
const buildPdf = (lucrareData: Lucrare, prods: Product[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  let currentY = 15

  // Helper: add new page if required
  const checkPageBreak = (needed: number) => {
    if (currentY + needed > PH - 15) {
      doc.addPage()
      currentY = 15
    }
  }

  // Helper: draw a labelled box (no fixed rows)
  const drawBox = (title: string, lines: string[], boxWidth: number, x: number, titleBold = true) => {
    const lineHeight = 5
    const boxHeight = lines.length * lineHeight + 12
    checkPageBreak(boxHeight + 5)

    doc.setDrawColor(60).setFillColor(240).setLineWidth(0.3)
    ;(doc as any).roundedRect(x, currentY, boxWidth, boxHeight, 2, 2, "FD")

    doc
      .setFontSize(10)
      .setFont(undefined, titleBold ? "bold" : "normal")
      .setTextColor(40)
      .text(title, x + boxWidth / 2, currentY + 6, { align: "center" })

    doc.setFontSize(8).setFont(undefined, "normal").setTextColor(20)
    lines.forEach((txt, i) => {
      const yy = currentY + 10 + i * lineHeight
      doc.text(txt, x + 3, yy)
      doc
        .setDrawColor(200)
        .setLineWidth(0.15)
        .line(x + 3, yy + 1.5, x + boxWidth - 3, yy + 1.5)
    })
  }

  // HEADER
  const boxH = 36
  const logoArea = 40
  const boxW = (210 - 2 * 15 - logoArea) / 2

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
    15,
  )

  const clientInfo = lucrareData.clientInfo || {}
  drawBox(
    "BENEFICIAR",
    [
      normalize(lucrareData.client || "-"),
      `CUI: ${normalize(clientInfo.cui || "-")}`,
      `R.C.: ${normalize(clientInfo.rc || "-")}`,
      `Adresa: ${normalize(clientInfo.adresa || "-")}`,
      `Locatie interventie: ${normalize(lucrareData.locatie || "-")}`,
    ],
    boxW,
    15 + boxW + logoArea,
  )

  // LOGO placeholder
  doc.setDrawColor(60).setLineWidth(0.3)
  ;(doc as any).roundedRect(15 + boxW + 2, currentY + 3, logoArea - 4, boxH - 6, 1.5, 1.5, "S")

  // Adăugăm logo-ul dacă este disponibil
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 15 + boxW + 4, currentY + 5, logoArea - 8, boxH - 10)
    } catch {
      doc
        .setFontSize(14)
        .setFont(undefined, "bold")
        .text("NRG", 15 + boxW + logoArea / 2, currentY + boxH / 2, { align: "center" })
    }
  }

  currentY += boxH + 10

  // TITLE
  doc
    .setFontSize(16)
    .setFont(undefined, "bold")
    .text("RAPORT DE INTERVENTIE", PW / 2, currentY, { align: "center" })
  currentY += 10

  // META
  doc.setFontSize(9).setFont(undefined, "normal")
  const [d, t] = (lucrareData.dataInterventie || " - -").split(" ")
  doc.text(`Data: ${normalize(d)}`, 15, currentY)

  // Folosim datele de sosire și plecare
  const sosire = lucrareData.oraSosire || "-"
  const plecare = lucrareData.oraPlecare || "-"

  doc.text(`Sosire: ${sosire}`, 15 + 70, currentY)
  doc.text(`Plecare: ${plecare}`, 15 + 120, currentY)
  doc.text(`Raport #${lucrareData.id || ""}`, PW - 15, currentY, { align: "right" })
  currentY += 10

  // Adăugăm durata intervenției
  if (lucrareData.durataInterventie) {
    doc.text(`Durata intervenție: ${lucrareData.durataInterventie}`, 15, currentY)
    currentY += 6
  }

  // EQUIPMENT
  if (lucrareData.echipament || lucrareData.echipamentCod) {
    const equipLines = [
      `${normalize(lucrareData.echipament || "Nespecificat")}${lucrareData.echipamentCod ? ` (Cod: ${normalize(lucrareData.echipamentCod)})` : ""}`,
    ]

    drawBox("ECHIPAMENT", equipLines, 210 - 2 * 15, 15, true)
    currentY += equipLines.length * 5 + 12 + 5
  }

  // Dynamic text blocks helper (no fixed 5 lines)
  const addTextBlock = (label: string, text?: string) => {
    if (!text?.trim()) return
    doc.setFont(undefined, "bold").setFontSize(10)
    doc.text(label, 15, currentY)
    currentY += 4

    const textLines = doc.splitTextToSize(normalize(text), PW - 4 - 15)
    const lineHeight = 4
    const boxHeight = textLines.length * lineHeight + 4

    checkPageBreak(boxHeight + 5)
    doc.setDrawColor(150).rect(15, currentY, PW - 2 * 15, boxHeight, "S")

    // Horizontal guide lines only for actual content
    for (let i = 1; i <= textLines.length; i++) {
      doc.line(15, currentY + i * lineHeight, PW - 15, currentY + i * lineHeight)
    }

    doc.setFont(undefined, "normal").setFontSize(8)
    doc.text(textLines, 15 + 2, currentY + lineHeight)
    currentY += boxHeight + 6
  }

  addTextBlock("Constatare la locatie:", lucrareData.constatareLaLocatie)
  addTextBlock("Descriere interventie:", lucrareData.descriereInterventie)

  // PRODUCT TABLE (shown only if there are products)
  if (prods && prods.length > 0) {
    checkPageBreak(15)
    doc.setFillColor(210).rect(15, currentY, PW - 2 * 15, 8, "FD")
    doc
      .setFontSize(10)
      .setFont(undefined, "bold")
      .text("DEVIZ ESTIMATIV", PW / 2, currentY + 5, { align: "center" })
    currentY += 8

    const colWidths = [
      (PW - 2 * 15) * 0.08,
      (PW - 2 * 15) * 0.47,
      (PW - 2 * 15) * 0.1,
      (PW - 2 * 15) * 0.1,
      (PW - 2 * 15) * 0.125,
      (PW - 2 * 15) * 0.125,
    ]
    const colPos = [15]
    for (let i = 0; i < colWidths.length; i++) colPos.push(colPos[i] + colWidths[i])
    const headers = ["#", "Produs", "UM", "Cant.", "Preț", "Total"]

    const drawTableHeader = () => {
      doc.setFillColor(240).rect(15, currentY, PW - 2 * 15, 7, "FD")
      doc.setFontSize(8).setFont(undefined, "bold")
      headers.forEach((h, i) => {
        doc.text(h, colPos[i] + colWidths[i] / 2, currentY + 5, { align: "center" })
      })
      for (let i = 0; i <= colWidths.length; i++) doc.line(colPos[i], currentY, colPos[i], currentY + 7)
      doc.line(15, currentY + 7, PW - 15, currentY + 7)
      currentY += 7
    }

    drawTableHeader()

    prods.forEach((product, index) => {
      const nameLines = doc.splitTextToSize(normalize(product.name || ""), colWidths[1] - 4)
      const rowHeight = nameLines.length * 4 + 2
      if (currentY + rowHeight > PH - 15) {
        doc.addPage()
        currentY = 15
        drawTableHeader()
      }

      // zebra
      if (index % 2) {
        doc.setFillColor(248).rect(15, currentY, PW - 2 * 15, rowHeight, "F")
      }

      doc.setDrawColor(180).setLineWidth(0.2)
      for (let i = 0; i <= colWidths.length; i++) doc.line(colPos[i], currentY, colPos[i], currentY + rowHeight)
      doc.line(15, currentY + rowHeight, PW - 15, currentY + rowHeight)

      doc.setFontSize(8).setFont(undefined, "normal")
      doc.text((index + 1).toString(), colPos[0] + colWidths[0] / 2, currentY + 4, { align: "center" })
      nameLines.forEach((l, li) => doc.text(l, colPos[1] + 2, currentY + 4 + li * 4))
      doc.text(product.um || "-", colPos[2] + colWidths[2] / 2, currentY + 4, { align: "center" })
      doc.text((product.quantity || 0).toString(), colPos[3] + colWidths[3] / 2, currentY + 4, { align: "center" })
      doc.text((product.price || 0).toFixed(2), colPos[4] + colWidths[4] / 2, currentY + 4, { align: "center" })
      const tot = (product.quantity || 0) * (product.price || 0)
      doc.text(tot.toFixed(2), colPos[5] + colWidths[5] / 2, currentY + 4, { align: "center" })

      currentY += rowHeight
    })

    // TOTALS
    checkPageBreak(30)
    currentY += 10
    const subtotal = prods.reduce((s, p) => s + (p.quantity || 0) * (p.price || 0), 0)
    const vat = subtotal * 0.19
    const total = subtotal + vat
    const labelX = PW - 70
    const valX = PW - 20
    doc.setFontSize(9).setFont(undefined, "bold").text("Total fara TVA:", labelX, currentY, { align: "right" })
    doc.setFont(undefined, "normal").text(`${subtotal.toFixed(2)} RON`, valX, currentY, { align: "right" })
    currentY += 6
    doc.setFont(undefined, "bold").text("TVA (19%):", labelX, currentY, { align: "right" })
    doc.setFont(undefined, "normal").text(`${vat.toFixed(2)} RON`, valX, currentY, { align: "right" })
    currentY += 6
    doc.setFont(undefined, "bold").text("Total cu TVA:", labelX, currentY, { align: "right" })
    doc.setFont(undefined, "normal").text(`${total.toFixed(2)} RON`, valX, currentY, { align: "right" })
    doc.setDrawColor(150).line(labelX - 40, currentY + 3, valX + 5, currentY + 3)
    currentY += 15
  }

  // SIGNATURES
  checkPageBreak(40)
  doc.setFontSize(9).setFont(undefined, "bold")
  doc.text("Tehnician:", 15, currentY)
  doc.text("Beneficiar:", 15 + (PW - 2 * 15) / 2, currentY)
  currentY += 5
  doc.setFont(undefined, "normal")
  doc.text(normalize(lucrareData.tehnicieni?.join(", ") || ""), 15, currentY)
  doc.text(normalize(lucrareData.persoanaContact || ""), 15 + (PW - 2 * 15) / 2, currentY)
  currentY += 5

  const signW = (PW - 2 * 15) / 2 - 10
  const signH = 25
  const addSig = (data: string | undefined, x: number) => {
    if (data) {
      try {
        doc.addImage(data, "PNG", x, currentY, signW, signH)
        return
      } catch (e) {
        console.error("Error adding signature image:", e)
      }
    }
    doc
      .setFontSize(8)
      .setFont(undefined, "italic")
      .text("Semnatura lipsa", x + signW / 2, currentY + signH / 2, { align: "center" })
  }
  addSig(lucrareData.semnaturaTehnician, 15)
  addSig(lucrareData.semnaturaBeneficiar, 15 + (PW - 2 * 15) / 2)

  // FOOTER
  doc
    .setFontSize(7)
    .setFont(undefined, "normal")
    .text("Document generat automat • Field Operational Manager", PW / 2, PH - 15, { align: "center" })

  return doc.output("blob")
}

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate }, ref) => {
  const [isGen, setIsGen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [logoError, setLogoError] = useState(false)

  // Update products when lucrare changes
  useEffect(() => {
    if (lucrare?.products) {
      setProducts(lucrare.products)
    }
  }, [lucrare])

  const generatePDF = useStableCallback(async () => {
    if (!lucrare?.id) return
    setIsGen(true)

    try {
      console.log("Generare PDF pentru lucrarea:", lucrare.id)

      // 1. Salvăm mai întâi ora de plecare în Firestore
      const now = new Date()

      await updateDoc(docRef(db, "lucrari", lucrare.id), {
        raportGenerat: true,
        timpPlecare: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      toast({
        title: "Raport salvat",
        description: "Generare PDF în curs...",
      })

      // 2. Creăm un obiect local actualizat cu valorile noi
      const lucrareActualizata: Lucrare = {
        ...lucrare,
        timpPlecare: now.toISOString(),
        oraPlecare: formatTime(now),
        dataPlecare: formatDate(now),
        durataInterventie: lucrare.timpSosire ? calculateDuration(lucrare.timpSosire, now.toISOString()) : "-",
      }

      // 3. Generăm PDF-ul folosind datele actualizate
      const productsToUse = lucrare.products || products
      const blob = buildPdf(lucrareActualizata, productsToUse)

      onGenerate?.(blob)
      return blob
    } catch (e) {
      console.error("Eroare la generarea PDF:", e)
      toast({
        title: "Eroare",
        description: "Nu s-a putut salva ora de plecare.",
        variant: "destructive",
      })
    } finally {
      setIsGen(false)
    }
  })

  return (
    <div className="space-y-4">
      {lucrare?.constatareLaLocatie && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Constatare la locație</h3>
          <p className="whitespace-pre-line">{lucrare.constatareLaLocatie}</p>
        </div>
      )}
      {lucrare?.descriereInterventie && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Descriere intervenție</h3>
          <p className="whitespace-pre-line">{lucrare.descriereInterventie}</p>
        </div>
      )}
      <ProductTableForm products={products} onProductsChange={setProducts} />
      <div className="flex justify-center mt-6">
        <Button ref={ref} onClick={generatePDF} disabled={isGen} className="gap-2">
          <Download className="h-4 w-4" />
          {isGen ? "În curs..." : "Generează PDF"}
        </Button>
      </div>
    </div>
  )
})

ReportGenerator.displayName = "ReportGenerator"
