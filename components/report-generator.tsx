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
//   • Fixed diacritics issues in total section
//   • Added equipment information section
//   • Enhanced beneficiary information with client details
//   • Dynamic text block heights for constatare and descriere
// ---------------------------------------------------------------------------

import { useState, forwardRef, useEffect } from "react"
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
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [logoError, setLogoError] = useState(false)

  // Debug logging
  useEffect(() => {
    console.log("Report generator received lucrare:", {
      constatareLaLocatie: lucrare?.constatareLaLocatie,
      descriere: lucrare?.descriere,
      descriereInterventie: lucrare?.descriereInterventie,
      client: lucrare?.client,
      clientInfo: lucrare?.clientInfo,
    })
  }, [lucrare])

  // Preload the logo image and convert to data URL
  useEffect(() => {
    // Simple NRG logo as base64 - this is a fallback that will always work
    // This is a very basic placeholder logo - replace with your actual logo if needed
    const fallbackLogo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vd/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC"

    try {
      // First try to load the image from the public folder
      const img = new Image()
      img.crossOrigin = "anonymous" // Important to avoid CORS issues with canvas

      img.onload = () => {
        // Create canvas to convert image to data URL
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height

        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          try {
            const dataUrl = canvas.toDataURL("image/png")
            setLogoDataUrl(dataUrl)
            setLogoLoaded(true)
            console.log("Logo loaded successfully from public folder")
          } catch (err) {
            console.error("Error converting logo to data URL:", err)
            // Use fallback logo
            setLogoDataUrl(fallbackLogo)
            setLogoLoaded(true)
          }
        }
      }

      img.onerror = (e) => {
        console.error("Error loading logo image from public folder:", e)
        // Use fallback logo
        setLogoDataUrl(fallbackLogo)
        setLogoLoaded(true)
      }

      // Use the correct path to the logo in the public folder
      // The public folder is accessible at the root path in Next.js
      img.src = "/nrglogo.png"
    } catch (err) {
      console.error("Error in logo loading process:", err)
      // Use fallback logo
      setLogoDataUrl(fallbackLogo)
      setLogoLoaded(true)
    }
  }, [])

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
      const drawBox = (
        title: string,
        lines: string[],
        boxWidth: number,
        boxHeight: number | null, // Facem înălțimea opțională pentru a permite calculul dinamic
        x: number,
        titleBold = true,
      ) => {
        // Check if we need a new page
        const estimatedHeight = boxHeight || Math.max(36, lines.length * 5 + 15) // Înălțime minimă sau bazată pe numărul de linii
        checkPageBreak(estimatedHeight + 5)

        // Calculăm înălțimea reală a box-ului bazată pe conținut dacă nu este specificată
        const actualBoxHeight = boxHeight || estimatedHeight

        doc.setDrawColor(60).setFillColor(LIGHT_GRAY).setLineWidth(STROKE)
        ;(doc as any).roundedRect(x, currentY, boxWidth, actualBoxHeight, BOX_RADIUS, BOX_RADIUS, "FD")

        doc
          .setFontSize(10)
          .setFont(undefined, titleBold ? "bold" : "normal")
          .setTextColor(40)
          .text(title, x + boxWidth / 2, currentY + 6, { align: "center" })

        doc.setFontSize(8).setFont(undefined, "normal").setTextColor(20)
        lines.forEach((txt, i) => {
          const yy = currentY + 10 + i * 5

          // Verificăm dacă textul este prea lung pentru lățimea box-ului
          const textLines = doc.splitTextToSize(txt, boxWidth - 6)

          // Dacă textul are mai multe linii, le desenăm pe fiecare
          if (textLines.length > 1) {
            textLines.forEach((line: string, lineIndex: number) => {
              const lineY = yy + lineIndex * 4
              doc.text(line, x + 3, lineY)

              // Desenăm linia de subliniere doar pentru ultima linie a textului
              if (lineIndex === textLines.length - 1) {
                doc
                  .setDrawColor(200)
                  .setLineWidth(0.15)
                  .line(x + 3, lineY + 1.5, x + boxWidth - 3, lineY + 1.5)
              }
            })
          } else {
            // Pentru textele simple, desenăm ca înainte
            doc.text(txt, x + 3, yy)
            doc
              .setDrawColor(200)
              .setLineWidth(0.15)
              .line(x + 3, yy + 1.5, x + boxWidth - 3, yy + 1.5)
          }
        })

        return actualBoxHeight // Returnăm înălțimea reală folosită
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

      // Extract client information
      const clientInfo = lucrare.clientInfo || {}
      const clientName = normalize(lucrare.client || "-")
      const clientCUI = normalize(clientInfo.cui || "-")
      const clientAddress = normalize(clientInfo.adresa || "-")
      const clientBank = normalize(clientInfo.banca || "-")
      const clientAccount = normalize(clientInfo.cont || "-")

      // Adăugăm informații despre locația intervenției
      const locationName = normalize(lucrare.locatie || "-")
      const locationAddress = normalize(clientInfo.locationAddress || "-")
      const fullLocationAddress = locationAddress !== "-" ? `${locationName}, ${locationAddress}` : locationName

      // Pregătim liniile pentru caseta beneficiarului - fără R.C.
      const beneficiaryLines = [
        clientName,
        `CUI: ${clientCUI}`,
        `Adresa: ${clientAddress}`,
        `Locație intervenție: ${fullLocationAddress}`,
      ]

      // Desenăm caseta beneficiarului cu înălțime dinamică (null pentru calcul automat)
      const actualBeneficiaryBoxHeight = drawBox(
        "BENEFICIAR",
        beneficiaryLines,
        boxW,
        null, // Înălțime null pentru calcul automat
        M + boxW + logoArea,
      )

      // Ajustăm înălțimea logo-ului pentru a se potrivi cu caseta beneficiarului
      const logoBoxHeight = Math.max(boxH, actualBeneficiaryBoxHeight)

      // LOGO - ajustăm poziționarea logo-ului pentru a se potrivi cu caseta beneficiarului
      doc.setDrawColor(60).setLineWidth(STROKE)
      ;(doc as any).roundedRect(M + boxW + 2, currentY + 3, logoArea - 4, logoBoxHeight - 6, 1.5, 1.5, "S")

      if (logoLoaded && logoDataUrl) {
        try {
          // Use the preloaded logo data URL
          doc.addImage(logoDataUrl, "PNG", M + boxW + 4, currentY + 5, logoArea - 8, logoBoxHeight - 10)
        } catch (err) {
          console.error("Error adding logo to PDF:", err)
          // Fallback text if logo fails to load
          doc
            .setFontSize(14)
            .setFont(undefined, "bold")
            .setTextColor(60)
            .text("NRG", M + boxW + logoArea / 2, currentY + logoBoxHeight / 2, { align: "center" })
        }
      } else {
        // Fallback text if logo wasn't loaded
        doc
          .setFontSize(14)
          .setFont(undefined, "bold")
          .setTextColor(60)
          .text("NRG", M + boxW + logoArea / 2, currentY + logoBoxHeight / 2, { align: "center" })
      }

      // Update current Y position after header boxes - folosim înălțimea mai mare dintre cele două casete
      currentY += Math.max(boxH, actualBeneficiaryBoxHeight) + 10

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

      // EQUIPMENT INFO (if available)
      if (lucrare.echipament || lucrare.echipamentCod) {
        // Draw equipment box
        const equipmentBoxHeight = 25
        doc.setDrawColor(60).setFillColor(LIGHT_GRAY).setLineWidth(STROKE)
        ;(doc as any).roundedRect(M, currentY, W, equipmentBoxHeight, BOX_RADIUS, BOX_RADIUS, "FD")

        // Title
        doc
          .setFontSize(10)
          .setFont(undefined, "bold")
          .setTextColor(40)
          .text("ECHIPAMENT", M + W / 2, currentY + 6, { align: "center" })

        // Equipment details
        doc.setFontSize(9).setFont(undefined, "normal").setTextColor(20)

        // First row
        let equipmentText = normalize(lucrare.echipament || "Nespecificat")
        if (lucrare.echipamentCod) {
          equipmentText += ` (Cod: ${normalize(lucrare.echipamentCod)})`
        }
        doc.text(equipmentText, M + 5, currentY + 15)

        // Update position
        currentY += equipmentBoxHeight + 5
      }

      // COMMENT BLOCKS - Dynamic height based on content
      const addTextBlock = (label: string, text: string) => {
        // Check if we need a new page for the label
        checkPageBreak(10)

        // Draw label
        doc.setFont(undefined, "bold").setFontSize(10).setTextColor(20)
        doc.text(label, M, currentY)
        currentY += 4

        // Calculate needed height based on text content
        doc.setFont(undefined, "normal").setFontSize(8).setTextColor(20)
        const normalizedText = normalize(text || "")
        const textLines = doc.splitTextToSize(normalizedText, W - 4)

        // Calculate box height based on text content
        // Each line is about 4mm high, add some padding
        const lineHeight = 4
        const minBoxHeight = 30 // Minimum box height
        const calculatedHeight = Math.max(minBoxHeight, textLines.length * lineHeight + 10)

        // Check if we need a new page for the box
        checkPageBreak(calculatedHeight + 5)

        // Draw box
        doc.setDrawColor(150).setLineWidth(0.2)
        doc.rect(M, currentY, W, calculatedHeight, "S")

        // Draw horizontal lines - dynamic based on box height
        const linesCount = Math.floor(calculatedHeight / 6)
        for (let i = 1; i < linesCount; i++) {
          doc.line(M, currentY + i * 6, M + W, currentY + i * 6)
        }

        // Add text content
        doc.text(textLines, M + 2, currentY + 5)

        // Update position
        currentY += calculatedHeight + 10
      }

      // Add text blocks with dynamic heights
      addTextBlock("Constatare la locatie:", lucrare.constatareLaLocatie || "")
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
        products.length > 0 ? products : [{ id: "1", name: "", um: "", quantity: 0, price: 0, total: 0 }]

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
      checkPageBreak(30) // Asigură spațiu suficient pentru totaluri
      currentY += 10 // Spațiu suplimentar după tabel

      const subtotal = products.reduce((sum, p) => sum + (p.quantity || 0) * (p.price || 0), 0)
      const vat = subtotal * 0.19
      const total = subtotal + vat

      // Poziționare dinamică pentru totaluri
      const totalLabelX = PW - 70 // Poziția pentru etichete (fixă)
      const totalValueX = PW - 20 // Poziția pentru valori (fixă)

      // Folosim text hardcodat fără diacritice pentru a evita problemele de randare
      // Subtotal - poziționare simplificată
      doc.setFontSize(9).setFont(undefined, "bold").setTextColor(20)
      doc.text("Total fara TVA:", totalLabelX, currentY, { align: "right" })

      doc.setFont(undefined, "normal")
      doc.text(`${subtotal.toFixed(2)} RON`, totalValueX, currentY, { align: "right" })

      // TVA - cu spațiere adecvată
      currentY += 8 // Spațiere mărită între rânduri
      doc.setFont(undefined, "bold")
      doc.text("TVA (19%):", totalLabelX, currentY, { align: "right" })

      doc.setFont(undefined, "normal")
      doc.text(`${vat.toFixed(2)} RON`, totalValueX, currentY, { align: "right" })

      // Total cu TVA - cu spațiere adecvată
      currentY += 8 // Spațiere mărită între rânduri
      doc.setFont(undefined, "bold")
      doc.text("Total cu TVA:", totalLabelX, currentY, { align: "right" })

      doc.setFont(undefined, "normal")
      doc.text(`${total.toFixed(2)} RON`, totalValueX, currentY, { align: "right" })

      // Linie separatoare opțională pentru claritate vizuală
      doc.setDrawColor(150).setLineWidth(0.2)
      doc.line(totalLabelX - 40, currentY + 4, totalValueX + 5, currentY + 4)

      currentY += 20 // Spațiu după secțiunea de totaluri

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
          // Adăugăm un text alternativ dacă semnătura nu poate fi încărcată
          doc.setFontSize(8).setFont(undefined, "italic").setTextColor(100)
          doc.text("Semnatura lipsa", M + signatureWidth / 2, currentY + signatureHeight / 2, { align: "center" })
        }
      } else {
        // Adăugăm un text alternativ dacă semnătura nu există
        doc.setFontSize(8).setFont(undefined, "italic").setTextColor(100)
        doc.text("Semnătură lipsă", M + signatureWidth / 2, currentY + signatureHeight / 2, { align: "center" })
      }

      if (lucrare.semnaturaBeneficiar) {
        try {
          doc.addImage(lucrare.semnaturaBeneficiar, "PNG", M + W / 2, currentY, signatureWidth, signatureHeight)
        } catch (err) {
          console.error("Error adding beneficiary signature:", err)
          // Adăugăm un text alternativ dacă semnătura nu poate fi încărcată
          doc.setFontSize(8).setFont(undefined, "italic").setTextColor(100)
          doc.text("Semnătură lipsă", M + W / 2 + signatureWidth / 2, currentY + signatureHeight / 2, {
            align: "center",
          })
        }
      } else {
        // Adăugăm un text alternativ dacă semnătura nu există
        doc.setFontSize(8).setFont(undefined, "italic").setTextColor(100)
        doc.text("Semnătură lipsă", M + W / 2 + signatureWidth / 2, currentY + signatureHeight / 2, { align: "center" })
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
      {lucrare.constatareLaLocatie && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Constatare la locație</h3>
          <p className="whitespace-pre-line">{lucrare.constatareLaLocatie}</p>
        </div>
      )}

      {lucrare.descriereInterventie && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Descriere intervenție</h3>
          <p className="whitespace-pre-line">{lucrare.descriereInterventie}</p>
        </div>
      )}
      <ProductTableForm products={products} onProductsChange={setProducts} />
      <div className="flex justify-center mt-6">
        <Button ref={ref} onClick={generatePDF} disabled={isGen} className="gap-2">
          <Download className="h-4 w-4" />
          {isGen ? "În curs..." : "Descarcă PDF"}
        </Button>
      </div>
    </div>
  )
})

ReportGenerator.displayName = "ReportGenerator"
