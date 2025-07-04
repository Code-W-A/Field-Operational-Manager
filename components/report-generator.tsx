"use client"

import { useState, forwardRef, useEffect } from "react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/components/ui/use-toast"
import { ProductTableForm, type Product } from "./product-table-form"
import { serverTimestamp } from "firebase/firestore"
import { formatDate, formatTime, calculateDuration } from "@/lib/utils/time-format"

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

// A4 portrait: 210×297 mm
const M = 15 // page margin
const W = 210 - 2 * M // content width
const BOX_RADIUS = 2 // 2 mm rounded corners
const STROKE = 0.3 // line width (pt)
const LIGHT_GRAY = 240 // fill shade (lighter)
const DARK_GRAY = 210 // darker fill for headers

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate }, ref) => {
  const [isGen, setIsGen] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [logoError, setLogoError] = useState(false)

  // Update products when lucrare changes
  useEffect(() => {
    if (lucrare?.products) {
      setProducts(lucrare.products)
    }
  }, [lucrare])

  // Preload the logo image as data URL (fallback included)
  useEffect(() => {
    const fallbackLogo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vf/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC"

    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        ctx?.drawImage(img, 0, 0)
        try {
          setLogoDataUrl(canvas.toDataURL("image/png"))
          setLogoLoaded(true)
        } catch {
          setLogoDataUrl(fallbackLogo)
          setLogoLoaded(true)
        }
      }
      img.onerror = () => {
        setLogoDataUrl(fallbackLogo)
        setLogoLoaded(true)
      }
      img.src = "/nrglogo.png"
    } catch {
      setLogoDataUrl(fallbackLogo)
      setLogoLoaded(true)
    }
  }, [])

  const generatePDF = useStableCallback(async () => {
    if (!lucrare) return
    
    // Prevent double generation
    if (hasGenerated) {
      console.log("PDF already generated, skipping...")
      return
    }
    
    console.log("🚀 PORNIRE GENERARE RAPORT")
    console.log("📋 Lucrare inițială:", {
      id: lucrare.id,
      raportGenerat: lucrare.raportGenerat,
      raportDataLocked: lucrare.raportDataLocked,
      raportSnapshot: lucrare.raportSnapshot ? "PREZENT" : "LIPSEȘTE",
      timpSosire: lucrare.timpSosire,
      hasProducts: lucrare.products ? lucrare.products.length : "N/A"
    })
    
    setIsGen(true)
    setHasGenerated(true)
    try {
      // VERIFICĂM DACĂ ESTE PRIMA GENERARE SAU REGENERARE
      const isFirstGeneration = !lucrare.raportGenerat || !lucrare.raportDataLocked
      
      console.log("🔍 VERIFICARE TIP GENERARE:", {
        isFirstGeneration: isFirstGeneration,
        raportGenerat: lucrare.raportGenerat,
        raportDataLocked: lucrare.raportDataLocked,
        tipGenerare: isFirstGeneration ? "PRIMA GENERARE - VA ÎNGHEȚA DATELE" : "REGENERARE - VA FOLOSI DATELE ÎNGHEȚATE"
      })
      
      let lucrareForPDF
      
      if (isFirstGeneration) {
        // PRIMA GENERARE - calculează și înghețează datele
        console.log("❄️ PRIMA GENERARE - ÎNGHEȚEAZĂ DATELE")
        console.log("⏰ Creez date noi pentru plecare și durată")
        const now = new Date()
        const timpPlecare = now.toISOString()
        const dataPlecare = formatDate(now)
        const oraPlecare = formatTime(now)
        let durataInterventie = "-"
        if (lucrare.timpSosire) {
          durataInterventie = calculateDuration(lucrare.timpSosire, timpPlecare)
        }

        // Creează snapshot-ul cu datele înghețate
        const raportSnapshot = {
          timpPlecare,
          dataPlecare,
          oraPlecare,
          durataInterventie,
          products: [...products], // copie a produselor
          constatareLaLocatie: lucrare.constatareLaLocatie,
          descriereInterventie: lucrare.descriereInterventie,
          semnaturaTehnician: lucrare.semnaturaTehnician,
          semnaturaBeneficiar: lucrare.semnaturaBeneficiar,
          numeTehnician: lucrare.numeTehnician,
          numeBeneficiar: lucrare.numeBeneficiar,
          dataGenerare: now.toISOString()
        }
        
        console.log("📸 SNAPSHOT CREAT:", {
          timpPlecare: timpPlecare,
          dataPlecare: dataPlecare,
          oraPlecare: oraPlecare,
          durataInterventie: durataInterventie,
          numarProduse: products.length,
          constatareLength: lucrare.constatareLaLocatie?.length || 0,
          descriereLength: lucrare.descriereInterventie?.length || 0,
          semnaturaTehnician: lucrare.semnaturaTehnician ? "PREZENTĂ" : "LIPSEȘTE",
          semnaturaBeneficiar: lucrare.semnaturaBeneficiar ? "PREZENTĂ" : "LIPSEȘTE",
          numeTehnician: lucrare.numeTehnician || "LIPSEȘTE",
          numeBeneficiar: lucrare.numeBeneficiar || "LIPSEȘTE"
        })

        lucrareForPDF = {
          ...lucrare,
          timpPlecare,
          dataPlecare,
          oraPlecare,
          durataInterventie,
          products,
          raportSnapshot,
          raportDataLocked: true
        }
      } else {
        // REGENERARE - folosește datele înghețate din snapshot
        console.log("🔄 REGENERARE - FOLOSEȘTE DATELE ÎNGHEȚATE")
        if (lucrare.raportSnapshot) {
          console.log("✅ Snapshot găsit - folosesc datele înghețate:", {
            timpPlecare: lucrare.raportSnapshot.timpPlecare,
            dataPlecare: lucrare.raportSnapshot.dataPlecare,
            oraPlecare: lucrare.raportSnapshot.oraPlecare,
            durataInterventie: lucrare.raportSnapshot.durataInterventie,
            numarProduse: lucrare.raportSnapshot.products?.length || 0
          })
          lucrareForPDF = {
            ...lucrare,
            timpPlecare: lucrare.raportSnapshot.timpPlecare,
            dataPlecare: lucrare.raportSnapshot.dataPlecare,
            oraPlecare: lucrare.raportSnapshot.oraPlecare,
            durataInterventie: lucrare.raportSnapshot.durataInterventie,
            products: lucrare.raportSnapshot.products,
            constatareLaLocatie: lucrare.raportSnapshot.constatareLaLocatie,
            descriereInterventie: lucrare.raportSnapshot.descriereInterventie,
            semnaturaTehnician: lucrare.raportSnapshot.semnaturaTehnician,
            semnaturaBeneficiar: lucrare.raportSnapshot.semnaturaBeneficiar,
            numeTehnician: lucrare.raportSnapshot.numeTehnician,
            numeBeneficiar: lucrare.raportSnapshot.numeBeneficiar
          }
        } else {
          // FALLBACK pentru rapoarte vechi - funcționează ca înainte
          console.log("⚠️ FALLBACK - Snapshot lipsește, generez date noi")
          const now = new Date()
          const timpPlecare = now.toISOString()
          const dataPlecare = formatDate(now)
          const oraPlecare = formatTime(now)
          let durataInterventie = "-"
          if (lucrare.timpSosire) {
            durataInterventie = calculateDuration(lucrare.timpSosire, timpPlecare)
          }

          lucrareForPDF = {
            ...lucrare,
            timpPlecare,
            dataPlecare,
            oraPlecare,
            durataInterventie,
          }
        }
      }

      console.log("Generating PDF with lucrare:", lucrareForPDF)
      console.log("Products:", lucrareForPDF.products || products)
      console.log("Signatures:", {
        tech: lucrareForPDF.semnaturaTehnician ? "Present" : "Missing",
        client: lucrareForPDF.semnaturaBeneficiar ? "Present" : "Missing",
      })

      const doc = new jsPDF({ unit: "mm", format: "a4" })
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      let currentY = M

      // Helper: add new page if required
      const checkPageBreak = (needed: number) => {
        if (currentY + needed > PH - M) {
          doc.addPage()
          currentY = M
        }
      }

      // Helper: draw a labelled box (no fixed rows)
      const drawBox = (title: string, lines: string[], boxWidth: number, x: number, titleBold = true) => {
        const lineHeight = 5
        const textWidth = boxWidth - 6 // Leave 3px margin on each side
        
        // Set font before calculating text size
        doc.setFontSize(8).setFont("helvetica", "normal")
        
        // Split each line into multiple lines if text is too long
        const allTextLines: string[] = []
        lines.forEach(line => {
          const splitLines = doc.splitTextToSize(line, textWidth)
          allTextLines.push(...splitLines)
        })
        
        // Calculate dynamic height based on actual content
        const boxHeight = Math.max(28, allTextLines.length * lineHeight + 12) // Minimum height 28
        checkPageBreak(boxHeight + 5)

        doc.setDrawColor(60, 60, 60).setFillColor(LIGHT_GRAY, LIGHT_GRAY, LIGHT_GRAY).setLineWidth(STROKE)
        ;(doc as any).roundedRect(x, currentY, boxWidth, boxHeight, BOX_RADIUS, BOX_RADIUS, "FD")

        doc
          .setFontSize(10)
          .setFont("helvetica", titleBold ? "bold" : "normal")
          .setTextColor(40)
          .text(title, x + boxWidth / 2, currentY + 6, { align: "center" })

        doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(20)
        allTextLines.forEach((txt, i) => {
          const yy = currentY + 10 + i * lineHeight
          doc.text(txt, x + 3, yy)
          doc
            .setDrawColor(200, 200, 200)
            .setLineWidth(0.15)
            .line(x + 3, yy + 1.5, x + boxWidth - 3, yy + 1.5)
        })
        
        return boxHeight // Return the calculated height
      }

      // HEADER
      const logoArea = 40
      const boxW = (W - logoArea) / 2

      const prestatorHeight = drawBox(
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
        M,
      )

      const clientInfo = lucrareForPDF.clientInfo || {}
      const beneficiarHeight = drawBox(
        "BENEFICIAR",
        [
          normalize(lucrareForPDF.client || "-"),
          `CUI: ${normalize(clientInfo.cui || "-")}`,
          `R.C.: ${normalize(clientInfo.rc || "-")}`,
          `Adresa: ${normalize(clientInfo.adresa || "-")}`,
          `Locatie interventie: ${normalize(lucrareForPDF.locatie || "-")}`,
        ],
        boxW,
        M + boxW + logoArea,
      )

      // Use the maximum height of both boxes
      const maxBoxHeight = Math.max(prestatorHeight, beneficiarHeight)

      // LOGO placeholder - centered vertically with the tallest box
      doc.setDrawColor(60, 60, 60).setLineWidth(STROKE)
      ;(doc as any).roundedRect(M + boxW + 2, currentY + 3, logoArea - 4, maxBoxHeight - 6, 1.5, 1.5, "S")
      if (logoLoaded && logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, "PNG", M + boxW + 4, currentY + 5, logoArea - 8, maxBoxHeight - 10)
        } catch {
          doc
            .setFontSize(14)
            .setFont("helvetica", "bold")
            .text("NRG", M + boxW + logoArea / 2, currentY + maxBoxHeight / 2, { align: "center" })
        }
      }

      currentY += maxBoxHeight + 20

      // TITLE
      doc
        .setFontSize(16)
        .setFont("helvetica", "bold")
        .text("RAPORT DE INTERVENTIE", PW / 2, currentY, { align: "center" })
      currentY += 15

      // META
      doc.setFontSize(9).setFont("helvetica", "normal")
      const [d, t] = (lucrareForPDF.dataInterventie || " - -").split(" ")
      doc.text(`Data: ${normalize(d)}`, M, currentY)

      // Folosim datele de sosire și plecare dacă există
      // Extragem datele și orele pentru afișare formatată
      const sosireData = lucrareForPDF.dataSosire || (lucrareForPDF.timpSosire ? formatDate(new Date(lucrareForPDF.timpSosire)) : "-")
      const sosireOra = lucrareForPDF.oraSosire || (lucrareForPDF.timpSosire ? formatTime(new Date(lucrareForPDF.timpSosire)) : "-")
      const plecareData = lucrareForPDF.dataPlecare || (lucrareForPDF.timpPlecare ? formatDate(new Date(lucrareForPDF.timpPlecare)) : "-")
      const plecareOra = lucrareForPDF.oraPlecare || (lucrareForPDF.timpPlecare ? formatTime(new Date(lucrareForPDF.timpPlecare)) : "-")

      doc.text(`Sosire: ${sosireData}, ${sosireOra}`, M + 70, currentY)
      doc.text(`Plecare: ${plecareData}, ${plecareOra}`, M + 120, currentY)
      currentY += 10

      // Calculăm și afișăm durata intervenției în ore și minute
      let durataText = "-"
      if (lucrareForPDF.timpSosire && lucrareForPDF.timpPlecare) {
        const ms = new Date(lucrareForPDF.timpPlecare).getTime() - new Date(lucrareForPDF.timpSosire).getTime()
        if (ms > 0) {
          const totalMinutes = Math.floor(ms / 60000)
          const ore = Math.floor(totalMinutes / 60)
          const minute = totalMinutes % 60
          durataText = `${ore}h ${minute}m`
        }
      }
      doc.text(`Durata: ${durataText}`, M, currentY)
      currentY += 6

      // EQUIPMENT
      if (lucrareForPDF.echipament || lucrareForPDF.echipamentCod) {
        const equipLines = [
          `${normalize(lucrareForPDF.echipament || "Nespecificat")}${lucrareForPDF.echipamentCod ? ` (Cod: ${normalize(lucrareForPDF.echipamentCod)})` : ""}`,
        ]

        const equipHeight = drawBox("ECHIPAMENT", equipLines, W, M, true)
        currentY += equipHeight + 5
      }

      // Dynamic text blocks helper (no fixed 5 lines)
      const addTextBlock = (label: string, text?: string) => {
        if (!text?.trim()) return
        doc.setFont("helvetica", "bold").setFontSize(10)
        doc.text(label, M, currentY)
        currentY += 4

        const textLines = doc.splitTextToSize(normalize(text), W - 4)
        const lineHeight = 4
        const boxHeight = textLines.length * lineHeight + 4

        checkPageBreak(boxHeight + 5)
        doc.setDrawColor(150, 150, 150).rect(M, currentY, W, boxHeight, "S")

        // Horizontal guide lines only for actual content
        for (let i = 1; i <= textLines.length; i++) {
          doc.line(M, currentY + i * lineHeight, M + W, currentY + i * lineHeight)
        }

        doc.setFont("helvetica", "normal").setFontSize(8)
        textLines.forEach((l: string, li: number) => doc.text(l, M + 2, currentY + lineHeight + li * lineHeight))
        currentY += boxHeight + 6
      }

      addTextBlock("Constatare la locatie:", lucrareForPDF.constatareLaLocatie)
      addTextBlock("Descriere interventie:", lucrareForPDF.descriereInterventie)

      // Use the products from the snapshot if available, otherwise fallback to current products
      const productsToUse = lucrareForPDF.products || products

      // PRODUCT TABLE (shown only if there are products)
      if (productsToUse && productsToUse.length > 0) {
        checkPageBreak(15)
        doc.setFillColor(DARK_GRAY, DARK_GRAY, DARK_GRAY).rect(M, currentY, W, 8, "FD")
        doc
          .setFontSize(10)
          .setFont("helvetica", "bold")
          .text("DEVIZ ESTIMATIV", PW / 2, currentY + 5, { align: "center" })
        currentY += 8

        const colWidths = [W * 0.08, W * 0.47, W * 0.1, W * 0.1, W * 0.125, W * 0.125]
        const colPos = [M]
        for (let i = 0; i < colWidths.length; i++) colPos.push(colPos[i] + colWidths[i])
        const headers = ["#", "Produs", "UM", "Cant.", "Preț", "Total"]

        const drawTableHeader = () => {
          doc.setFillColor(LIGHT_GRAY, LIGHT_GRAY, LIGHT_GRAY).rect(M, currentY, W, 7, "FD")
          doc.setFontSize(8).setFont("helvetica", "bold")
          headers.forEach((h, i) => {
            doc.text(h, colPos[i] + colWidths[i] / 2, currentY + 5, { align: "center" })
          })
          for (let i = 0; i <= colWidths.length; i++) doc.line(colPos[i], currentY, colPos[i], currentY + 7)
          doc.line(M, currentY + 7, M + W, currentY + 7)
          currentY += 7
        }

        drawTableHeader()

        productsToUse.forEach((product, index) => {
          const nameLines = doc.splitTextToSize(normalize(product.name || ""), colWidths[1] - 4)
          const rowHeight = nameLines.length * 4 + 2
          if (currentY + rowHeight > PH - M) {
            doc.addPage()
            currentY = M
            drawTableHeader()
          }

          // zebra
          if (index % 2) {
            doc.setFillColor(248, 248, 248).rect(M, currentY, W, rowHeight, "F")
          }

          doc.setDrawColor(180, 180, 180).setLineWidth(0.2)
          for (let i = 0; i <= colWidths.length; i++) doc.line(colPos[i], currentY, colPos[i], currentY + rowHeight)
          doc.line(M, currentY + rowHeight, M + W, currentY + rowHeight)

          doc.setFontSize(8).setFont("helvetica", "normal")
          doc.text((index + 1).toString(), colPos[0] + colWidths[0] / 2, currentY + 4, { align: "center" })
          nameLines.forEach((l: string, li: number) => doc.text(l, colPos[1] + 2, currentY + 4 + li * 4))
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
        const subtotal = productsToUse.reduce((s, p) => s + (p.quantity || 0) * (p.price || 0), 0)
        const vat = subtotal * 0.19
        const total = subtotal + vat
        const labelX = PW - 70
        const valX = PW - 20
        doc.setFontSize(9).setFont("helvetica", "bold").text("Total fara TVA:", labelX, currentY, { align: "right" })
        doc.setFont("helvetica", "normal").text(`${subtotal.toFixed(2)} RON`, valX, currentY, { align: "right" })
        currentY += 6
        doc.setFont("helvetica", "bold").text("TVA (19%):", labelX, currentY, { align: "right" })
        doc.setFont("helvetica", "normal").text(`${vat.toFixed(2)} RON`, valX, currentY, { align: "right" })
        currentY += 6
        doc.setFont("helvetica", "bold").text("Total cu TVA:", labelX, currentY, { align: "right" })
        doc.setFont("helvetica", "normal").text(`${total.toFixed(2)} RON`, valX, currentY, { align: "right" })
        doc.setDrawColor(150, 150, 150).line(labelX - 40, currentY + 3, valX + 5, currentY + 3)
        currentY += 15
      }

      // SIGNATURES
      checkPageBreak(40)
      doc.setFontSize(9).setFont("helvetica", "bold")
      doc.text("Tehnician:", M, currentY)
      doc.text("Beneficiar:", M + W / 2, currentY)
      currentY += 5
      doc.setFont("helvetica", "normal")
      // Folosim numele semnatarilor dacă sunt disponibile, altfel valorile implicite
      const numeTehnician = normalize(lucrareForPDF.numeTehnician || lucrareForPDF.tehnicieni?.join(", ") || "")
      const numeBeneficiar = normalize(lucrareForPDF.numeBeneficiar || lucrareForPDF.persoanaContact || "")
      doc.text(numeTehnician, M, currentY)
      doc.text(numeBeneficiar, M + W / 2, currentY)
      currentY += 5

      const signW = W / 2 - 10
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
          .setFont("helvetica", "italic")
          .text("Semnatura lipsa", x + signW / 2, currentY + signH / 2, { align: "center" })
      }
      addSig(lucrareForPDF.semnaturaTehnician, M)
      addSig(lucrareForPDF.semnaturaBeneficiar, M + W / 2)

      // FOOTER
      doc
        .setFontSize(7)
        .setFont("helvetica", "normal")
        .text("Document generat automat • Field Operational Manager", PW / 2, PH - M, { align: "center" })

      const blob = doc.output("blob")

      console.log("📄 PDF generat cu succes, acum salvez starea în Firestore")
      
      // Mark document as generated and record departure time
      if (lucrare.id) {
        console.log("🔐 SALVARE ÎN FIRESTORE pentru lucrarea:", lucrare.id)
        try {
          // Folosim updateDoc din firebase/firestore
          const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore")
          const { db } = await import("@/lib/firebase/config")

          // SALVĂM SNAPSHOT-UL DOAR LA PRIMA GENERARE
          if (isFirstGeneration) {
            console.log("💾 PRIMA GENERARE - Salvez toate datele:")
            const updateData = {
              raportGenerat: true,
              raportDataLocked: true,
              raportSnapshot: lucrareForPDF.raportSnapshot,
              updatedAt: serverTimestamp(),
              timpPlecare: lucrareForPDF.timpPlecare,
              dataPlecare: lucrareForPDF.dataPlecare,
              oraPlecare: lucrareForPDF.oraPlecare,
              durataInterventie: lucrareForPDF.durataInterventie,
            }
            
            console.log("📦 Date care se salvează:", {
              raportGenerat: updateData.raportGenerat,
              raportDataLocked: updateData.raportDataLocked,
              hasSnapshot: !!updateData.raportSnapshot,
              snapshotSize: updateData.raportSnapshot ? Object.keys(updateData.raportSnapshot).length : 0,
              timpPlecare: updateData.timpPlecare,
              dataPlecare: updateData.dataPlecare,
              oraPlecare: updateData.oraPlecare,
              durataInterventie: updateData.durataInterventie
            })
            
            await updateDoc(doc(db, "lucrari", lucrare.id), updateData)
            console.log("✅ SUCCES - Prima generare salvată în Firestore")
          } else {
            console.log("🔄 REGENERARE - Actualizez doar timestamp-ul")
            await updateDoc(doc(db, "lucrari", lucrare.id), {
              updatedAt: serverTimestamp(),
            })
            console.log("✅ SUCCES - Regenerare confirmată în Firestore")
          }
        } catch (e) {
          console.error("❌ EROARE la salvarea în Firestore:", e)
        }
      } else {
        console.log("⚠️ Nu pot salva - ID lucrare lipsește")
      }

      console.log("🎉 PROCES COMPLET - PDF generat și stare salvată")
      console.log("📊 Rezultat final:", {
        pdfSize: blob.size,
        lucrareId: lucrare.id,
        raportGenerat: true,
        raportDataLocked: isFirstGeneration
      })
      
      onGenerate?.(blob)
      return blob
    } catch (e) {
      console.error("Error generating PDF:", e)
      toast({ title: "Eroare", description: "Generare eșuată.", variant: "destructive" })
      setHasGenerated(false) // Reset flag on error
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
