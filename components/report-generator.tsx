"use client"

import { useState, forwardRef, useEffect } from "react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useStableCallback } from "@/lib/utils/hooks"
import { toast } from "@/hooks/use-toast"
import { ProductTableForm, type Product } from "./product-table-form"
import { serverTimestamp } from "firebase/firestore"
import { formatDate, formatTime, calculateDuration, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { drawFooter as drawCommonFooter } from "@/lib/pdf/common"

interface ReportGeneratorProps {
  lucrare: Lucrare & { products?: Product[] }
  onGenerate?: (pdf: Blob) => void
}

// păstrăm diacriticele; convertim s/t cu sedilă la virgulă jos și forțăm NFC
const normalize = (text = "") => {
  if (!text) return ""
  let t = text.normalize("NFC")
  return t.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
}

// Normalizează CUI/CIF pentru afișare: asigură un singur prefix "RO" (case-insensitive)
const formatRomanianVat = (raw?: string) => {
  const v = String(raw || "").trim()
  if (!v) return "-"
  const compact = v.replace(/\s+/g, "")
  // Eliminăm orice număr de prefixe "RO" existente (ex: "RORO123", "Ro123")
  const rest = compact.replace(/^(RO)+/i, "")
  if (!rest) return "RO"
  return `RO${rest}`
}

// A4 portrait: 210×297 mm
const M = 7 // page margin (reduced for more content space)
const W = 210 - 2 * M // content width
const BOX_RADIUS = 2 // 2 mm rounded corners
const STROKE = 0.3 // line width (pt)
const LIGHT_GRAY = 240 // fill shade (lighter)
const DARK_GRAY = 210 // darker fill for headers

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate }, ref) => {
  const [isGen, setIsGen] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [clientRating, setClientRating] = useState<number | null>(null)
  const [clientReview, setClientReview] = useState<string>("")
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [logoError, setLogoError] = useState(false)

  // Update products when lucrare changes
  useEffect(() => {
    if (lucrare?.products) {
      setProducts(lucrare.products)
    }
    // Preload feedback dacă există în snapshot sau la nivel de document
    try {
      const snapRating = (lucrare as any)?.raportSnapshot?.clientRating
      const snapReview = (lucrare as any)?.raportSnapshot?.clientReview
      const docRating = (lucrare as any)?.clientRating
      const docReview = (lucrare as any)?.clientReview
      const r = typeof snapRating === 'number' ? snapRating : (typeof docRating === 'number' ? docRating : null)
      setClientRating(r ?? null)
      const rv = typeof snapReview === 'string' && snapReview.trim().length ? snapReview : (typeof docReview === 'string' ? docReview : '')
      setClientReview(rv || "")
    } catch {}
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
    console.log("📋 Tichet inițială:", {
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
      const isOldFinalizedReport = lucrare.raportGenerat && !lucrare.raportDataLocked
      const isFirstGeneration = !lucrare.raportGenerat || (!lucrare.raportDataLocked && !lucrare.raportGenerat)
      
      console.log("🔍 VERIFICARE TIP GENERARE:", {
        isFirstGeneration: isFirstGeneration,
        isOldFinalizedReport: isOldFinalizedReport,
        raportGenerat: lucrare.raportGenerat,
        raportDataLocked: lucrare.raportDataLocked,
        existaNumarRaport: !!lucrare.numarRaport,
        numarRaportValue: lucrare.numarRaport || "LIPSEȘTE",
        tipGenerare: isFirstGeneration ? "PRIMA GENERARE - VA ÎNGHEȚA DATELE" : 
                     isOldFinalizedReport ? "RAPORT VECHI FINALIZAT - FĂRĂ NUMĂR" : 
                     "REGENERARE - VA FOLOSI DATELE ÎNGHEȚATE"
      })
      
      // Gestionăm numărul de raport: preferăm nrLucrare dacă există; altfel numarRaport; altfel generăm
      let numarRaport = lucrare.nrLucrare || lucrare.numarRaport // Folosim numărul existent (nrLucrare sau numarRaport)
      console.log("🔢 ÎNCEPUT gestionare numarRaport - valoarea inițială:", numarRaport || "LIPSEȘTE")
      
      if (isOldFinalizedReport) {
        // Pentru rapoartele vechi finalizate, NU generăm niciun număr
        numarRaport = undefined // Forțăm să fie undefined pentru a nu afișa în PDF
        console.log("🏛️ Raport vechi finalizat - NU se afișează număr de raport")
      } else if ((isFirstGeneration || !numarRaport) && !numarRaport) {
        // Generăm număr la prima generare SAU când lipsește (pentru a corecta lucrări vechi fără număr)
        console.log("🔢 CONDIȚII ÎNDEPLINITE pentru generarea numărului:")
        console.log("   - isFirstGeneration:", isFirstGeneration, "sau lipsește numărul existent")
        console.log("   - !numarRaport:", !numarRaport)
        console.log("🔢 Generez număr raport din sistemul centralizat...")
        
        try {
          // Folosim sistemul centralizat de numerotare
          const { getNextReportNumber } = await import("@/lib/firebase/firestore")
          numarRaport = await getNextReportNumber()
          
          console.log("🔢 Număr raport generat din sistemul centralizat:", numarRaport)
        } catch (error) {
          console.error("❌ Eroare la generarea numărului de raport din sistemul centralizat:", error)
          // Fallback: folosim timestamp-ul ca număr unic
          const fallbackNumber = Date.now().toString().slice(-6)
          numarRaport = `#${fallbackNumber}`
          console.log("🔄 Folosesc fallback pentru numărul raportului:", numarRaport)
        }
      } else {
        console.log("❌ CONDIȚII NU SUNT ÎNDEPLINITE pentru generarea numărului:")
        console.log("   - isFirstGeneration:", isFirstGeneration)
        console.log("   - !numarRaport:", !numarRaport)
        console.log("   - isOldFinalizedReport:", isOldFinalizedReport)
        console.log("🔢 Voi folosi numărul existent sau nimic:", numarRaport || "NIMIC")
      }
      
      console.log("🔢 FINAL gestionare numarRaport - valoarea finală:", numarRaport || "LIPSEȘTE")
      
      let lucrareForPDF
      
      if (isFirstGeneration) {
        // PRIMA GENERARE - calculează și înghețează datele
        console.log("❄️ PRIMA GENERARE - ÎNGHEȚEAZĂ DATELE")
        console.log("⏰ Creez date noi pentru plecare și durată")
        const now = new Date()
        const savedDeparture = lucrare.timpPlecare ? new Date(lucrare.timpPlecare) : null
        const departureDate =
          savedDeparture && !Number.isNaN(savedDeparture.getTime()) ? savedDeparture : now
        const timpPlecare = departureDate.toISOString()
        const dataPlecare = lucrare.dataPlecare || formatDate(departureDate)
        const oraPlecare = lucrare.oraPlecare || formatTime(departureDate)
        // Folosim mereu cele mai recente produse venite prin props (din pagina),
        // iar dacă nu există acolo, cădem înapoi pe state-ul intern.
        const currentProducts = Array.isArray(lucrare?.products) ? lucrare.products : products
        
        // DEBUGGING PENTRU TIMPI CORUPȚI - VERIFICARE LA SETARE timpPlecare
        console.log("🕐 SETARE timpPlecare la generarea raportului (PRIMA GENERARE):")
        console.log("📅 Data curentă (now):", now)
        console.log("📅 Data curentă (toLocaleString):", now.toLocaleString('ro-RO'))
        console.log("📅 Anul curent:", now.getFullYear())
        console.log("🔢 timpPlecare (ISO):", timpPlecare)
        console.log("🔢 dataPlecare (formatat):", dataPlecare)
        console.log("🔢 oraPlecare (formatat):", oraPlecare)
        
        // Verificare dacă timpii generați sunt în viitor
        if (now.getFullYear() > new Date().getFullYear()) {
          console.log("🚨 ALERTĂ: Data generată pentru timpPlecare (PRIMA GENERARE) este în viitor!")
          console.log("🚨 Aceasta este o problemă critică la generarea raportului!")
        }
        let durataInterventie = lucrare.durataInterventie || "-"
        if (lucrare.timpSosire && (!durataInterventie || durataInterventie === "-")) {
          durataInterventie = calculateDuration(lucrare.timpSosire, timpPlecare)
        }

        // Creează snapshot-ul cu datele înghețate
        const raportSnapshot = {
          timpPlecare,
          dataPlecare,
          oraPlecare,
          durataInterventie,
          products: [...currentProducts], // copie a produselor (cele mai recente din props sau state)
          constatareLaLocatie: lucrare.constatareLaLocatie,
          descriereInterventie: lucrare.descriereInterventie,
          cauzaPrincipalaDefectId: (lucrare as any).cauzaPrincipalaDefectId,
          cauzaPrincipalaDefect: (lucrare as any).cauzaPrincipalaDefect,
          semnaturaTehnician: lucrare.semnaturaTehnician,
          semnaturaBeneficiar: lucrare.semnaturaBeneficiar,
          numeTehnician: lucrare.numeTehnician,
          numeBeneficiar: lucrare.numeBeneficiar,
          dataGenerare: now.toISOString(),
          ...(typeof clientRating === 'number' ? { clientRating: Math.max(1, Math.min(5, clientRating)) } : {}),
          ...(clientReview?.trim() ? { clientReview: clientReview.trim() } : {})
        }
        
        console.log("📸 SNAPSHOT CREAT:", {
          timpPlecare: timpPlecare,
          dataPlecare: dataPlecare,
          oraPlecare: oraPlecare,
          durataInterventie: durataInterventie,
          numarProduse: currentProducts.length,
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
          products: currentProducts,
          raportSnapshot,
          raportDataLocked: true,
          // Includem numărul (preexistent sau generat) și sincronizăm ambele câmpuri
          numarRaport: numarRaport,
          nrLucrare: String(numarRaport || "")
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
            cauzaPrincipalaDefectId: (lucrare.raportSnapshot as any).cauzaPrincipalaDefectId || (lucrare as any).cauzaPrincipalaDefectId,
            cauzaPrincipalaDefect: (lucrare.raportSnapshot as any).cauzaPrincipalaDefect || (lucrare as any).cauzaPrincipalaDefect,
            semnaturaTehnician: lucrare.raportSnapshot.semnaturaTehnician,
            semnaturaBeneficiar: lucrare.raportSnapshot.semnaturaBeneficiar,
            numeTehnician: lucrare.raportSnapshot.numeTehnician,
            numeBeneficiar: lucrare.raportSnapshot.numeBeneficiar,
            // Include imaginile adăugate de tehnician (nu sunt în snapshotul vechi)
            imaginiDefecte: (lucrare as any).imaginiDefecte || (lucrare.raportSnapshot as any)?.imaginiDefecte || [],
            // Păstrăm numărul raportului din obiectul principal (nu se stochează în snapshot)
            numarRaport: lucrare.numarRaport
          }
        } else {
          // FALLBACK pentru rapoarte vechi - funcționează ca înainte
          console.log("⚠️ FALLBACK - Snapshot lipsește, generez date noi")
          const now = new Date()
          const timpPlecare = now.toISOString()
          const dataPlecare = formatDate(now)
          const oraPlecare = formatTime(now)
          
          // DEBUGGING PENTRU TIMPI CORUPȚI - VERIFICARE LA SETARE timpPlecare (FALLBACK)
          console.log("🕐 SETARE timpPlecare la generarea raportului (FALLBACK):")
          console.log("📅 Data curentă (now):", now)
          console.log("📅 Data curentă (toLocaleString):", now.toLocaleString('ro-RO'))
          console.log("📅 Anul curent:", now.getFullYear())
          console.log("🔢 timpPlecare (ISO):", timpPlecare)
          console.log("🔢 dataPlecare (formatat):", dataPlecare)
          console.log("🔢 oraPlecare (formatat):", oraPlecare)
          
          // Verificare dacă timpii generați sunt în viitor
          if (now.getFullYear() > new Date().getFullYear()) {
            console.log("🚨 ALERTĂ: Data generată pentru timpPlecare (FALLBACK) este în viitor!")
            console.log("🚨 Aceasta este o problemă critică la fallback-ul raportului!")
          }
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

      console.log("Generating PDF with tichet:", lucrareForPDF)
      console.log("Products:", lucrareForPDF.products || products)
      console.log("Signatures:", {
        tech: lucrareForPDF.semnaturaTehnician ? "Present" : "Missing",
        client: lucrareForPDF.semnaturaBeneficiar ? "Present" : "Missing",
      })

      const doc = new jsPDF({ unit: "mm", format: "a4" })
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      let currentY = M
      // Load unicode font (alias over 'helvetica') so diacritice render correctly
      try {
        const { ensurePdfFont } = await import("@/lib/pdf/font-loader")
        await ensurePdfFont(doc)
      } catch {}

      // Funcție pentru desenarea footer-ului pe pagina curentă
      const drawFooter = () => {
        drawCommonFooter(doc)
      }

      // Helper: add new page if required
      const checkPageBreak = (needed: number) => {
        if (currentY + needed > PH - M - 28) { // Lăsăm 28mm pentru footer (footer începe la PH-28)
          drawFooter() // Desenăm footer-ul pe pagina curentă înainte de a trece la următoarea
          doc.addPage()
          currentY = M
        }
      }

      // HEADER cu design nou inspirat din imagine
      
      // TITLE BAR CU FUNDAL ALBASTRU
      const titleBarHeight = 16 // mai înalt pentru logo-ul mai mare
      const titleBarColor = [73, 100, 155] // #49649b - header principal (titlul paginii)
      // Paletă pentru secțiunile de conținut (conform modelului):
      const sectionBarBg = [220, 230, 244] // #DCE6F4
      const sectionTitleColor = [74, 118, 184] // #4A76B8
      doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
      doc.rect(M, currentY, W, titleBarHeight, "F")
      
      // TITLU în stânga cu padding
      // Normalizăm numărul pentru a evita dublarea caracterului '#'
      const rawReportNum = lucrareForPDF.numarRaport ? String(lucrareForPDF.numarRaport) : ""
      const sanitizedReportNum = rawReportNum.replace(/^#\s*/, "")
      const reportNumber = sanitizedReportNum ? sanitizedReportNum.padStart(6, '0') : "000000"
      doc.setFontSize(13)
        .setFont("NotoSans", "bold")
        .setTextColor(255, 255, 255)
        .text("Raport de interventie nr. #" + reportNumber, M + 4, currentY + (titleBarHeight / 2) + 1)
      
      // LOGO în dreapta sus (mai mare, proporții corecte ca la ofertă)
      if (logoLoaded && logoDataUrl) {
        try {
          const logoW = 24
          const logoH = 18 // proporții corecte ca la ofertă
          doc.addImage(logoDataUrl, "PNG", M + W - logoW - 4, currentY + (titleBarHeight - logoH) / 2, logoW, logoH)
        } catch {
          doc.setFontSize(11)
            .setFont("NotoSans", "bold")
            .setTextColor(255, 255, 255)
            .text("NRG", M + W - 5, currentY + titleBarHeight / 2 + 1, { align: "right" })
        }
      }
      
      currentY += titleBarHeight + 6 // Redus de la 12 la 6

      // SECȚIUNEA PRESTATOR ȘI BENEFICIAR
      const leftColX = M
      const rightColX = M + W / 2 + 2
      const colWidth = W / 2 - 2
      
      // Prestator și Beneficiar (fără fundal și chenar, ca la ofertă)
      const lineH = 5
      
      // Prestator (stânga)
      doc.setFontSize(10)
        .setFont("NotoSans", "bold")
        .setTextColor(0, 0, 0)
        .text("Prestator", leftColX, currentY)
      
      doc.setFontSize(10)
        .setFont("NotoSans", "normal")
      
      const prestatorLines = [
        "NRG Access Systems SRL",
        "RO34272913",
        "Rezervelor 70, Chiajna, Ilfov"
      ]
      
      prestatorLines.forEach((line, i) => {
        doc.text(normalize(line), leftColX, currentY + 6 + (i * lineH))
      })
      
      // Beneficiar (dreapta, aliniat la dreapta)
      doc.setFont("NotoSans", "bold")
        .text("Beneficiar", M + W, currentY, { align: "right" })
      
      doc.setFont("NotoSans", "normal")
      
      const clientInfo = lucrareForPDF.clientInfo || {}
      const beneficiarLines = [
        lucrareForPDF.client || "-",
        formatRomanianVat(clientInfo.cui),
        clientInfo.adresa || "-",
      ]
      
      beneficiarLines.forEach((line, i) => {
        doc.text(normalize(line), M + W, currentY + 6 + (i * lineH), { align: "right" })
      })
      
      const maxLines = Math.max(prestatorLines.length, beneficiarLines.length)
      currentY += 6 + (maxLines * lineH) + 8 // Adăugat spațiu suplimentar între Prestator/Beneficiar și secțiunea următoare

      // SECȚIUNE CRONOLOGIE – fundal deschis și titlu albastru (#4A76B8 / #DCE6F4)
      const chronoBarHeight = 5
      doc.setFillColor(sectionBarBg[0], sectionBarBg[1], sectionBarBg[2])
      doc.rect(M, currentY, W, chronoBarHeight, "F")

      doc.setFontSize(10)
        .setFont("NotoSans", "bold")
        .setTextColor(sectionTitleColor[0], sectionTitleColor[1], sectionTitleColor[2])
        .text("Cronologie", M + 2, currentY + 4)
      
      currentY += chronoBarHeight + 2

      // Folosim datele de sosire și plecare dacă există
      console.log("🖨️ DEBUGGING PDF - Verificare timpi:", {
        timpSosire: lucrareForPDF.timpSosire,
        timpPlecare: lucrareForPDF.timpPlecare,
        dataSosire: lucrareForPDF.dataSosire,
        dataPlecare: lucrareForPDF.dataPlecare,
        oraSosire: lucrareForPDF.oraSosire,
        oraPlecare: lucrareForPDF.oraPlecare
      })
      
      // Verificare pentru timpi în viitor
      if (lucrareForPDF.timpSosire) {
        const sosireDate = new Date(lucrareForPDF.timpSosire)
        console.log("🖨️ PDF - Data sosire interpretată:", sosireDate.toLocaleString('ro-RO'))
        console.log("🖨️ PDF - Anul sosire:", sosireDate.getFullYear())
        
        if (sosireDate.getFullYear() > new Date().getFullYear()) {
          console.log("🚨 PDF - ALERTĂ: Data sosire în viitor!")
        }
      }
      
      if (lucrareForPDF.timpPlecare) {
        const plecareDate = new Date(lucrareForPDF.timpPlecare)
        console.log("🖨️ PDF - Data plecare interpretată:", plecareDate.toLocaleString('ro-RO'))
        console.log("🖨️ PDF - Anul plecare:", plecareDate.getFullYear())
        
        if (plecareDate.getFullYear() > new Date().getFullYear()) {
          console.log("🚨 PDF - ALERTĂ: Data plecare în viitor!")
        }
      }
      
      // Extragem datele și orele pentru afișare formatată
      const emitereData = (() => { try { return formatUiDate(toDateSafe(lucrareForPDF.dataInterventie)) } catch { return "-" } })()
      const sosireData = lucrareForPDF.dataSosire || (lucrareForPDF.timpSosire ? formatUiDate(new Date(lucrareForPDF.timpSosire)) : "")
      const sosireOra = lucrareForPDF.oraSosire || (lucrareForPDF.timpSosire ? formatTime(new Date(lucrareForPDF.timpSosire)) : "")
      const plecareData = lucrareForPDF.dataPlecare || (lucrareForPDF.timpPlecare ? formatUiDate(new Date(lucrareForPDF.timpPlecare)) : "")
      const plecareOra = lucrareForPDF.oraPlecare || (lucrareForPDF.timpPlecare ? formatTime(new Date(lucrareForPDF.timpPlecare)) : "")
      
      console.log("🖨️ PDF - Date formatate pentru afișare:", {
        sosireData,
        sosireOra,
        plecareData,
        plecareOra
      })

      // Calculăm și afișăm durata intervenției în ore și minute
      let durataText = ""
      if (lucrareForPDF.timpSosire && lucrareForPDF.timpPlecare) {
        const sosireTime = new Date(lucrareForPDF.timpSosire)
        const plecareTime = new Date(lucrareForPDF.timpPlecare)
        const ms = plecareTime.getTime() - sosireTime.getTime()
        
        console.log("🖨️ PDF - Calcul durată:", {
          timpSosire: lucrareForPDF.timpSosire,
          timpPlecare: lucrareForPDF.timpPlecare,
          sosireTime: sosireTime.toLocaleString('ro-RO'),
          plecareTime: plecareTime.toLocaleString('ro-RO'),
          differenceMs: ms,
          differenceHours: ms / (1000 * 60 * 60)
        })
        
        if (ms > 0) {
          const totalMinutes = Math.floor(ms / 60000)
          const ore = Math.floor(totalMinutes / 60)
          const minute = totalMinutes % 60
          durataText = `${ore}h ${minute}m`
          
          // Logare informativă pentru durate lungi
          if (ore > 72) {
            console.log("ℹ️ PDF - INFO: Durată lungă - intervenție pe mai multe zile!", {
              ore,
              minute,
              durataText,
              zile: Math.round(ore / 24),
              timpSosire: sosireTime.toLocaleString('ro-RO'),
              timpPlecare: plecareTime.toLocaleString('ro-RO')
            })
          }
        }
      }
      console.log("🖨️ PDF - Durata finală pentru afișare:", durataText)
      
      // Tabel cronologie - 4 coloane (fără fundal și border)
      const chronoTableH = 12
      const chronoColW = W / 4
      
      // Header labels (fără fundal) – font la fel ca etichetele de text (9)
      doc.setFontSize(9)
        .setFont("NotoSans", "bold")
        .setTextColor(50, 50, 50)
      
      doc.text("Emis la:", M + chronoColW * 0 + 2, currentY + 4)
      doc.text("Timp sosire:", M + chronoColW * 1 + 2, currentY + 4)
      doc.text("Timp plecare:", M + chronoColW * 2 + 2, currentY + 4)
      doc.text("Durata:", M + chronoColW * 3 + 2, currentY + 4)
      
      // Valori
      doc.setFontSize(9)
        .setFont("NotoSans", "normal")
        .setTextColor(30, 30, 30)
      
      doc.text(normalize(emitereData || "-"), M + chronoColW * 0 + 2, currentY + 9)
      doc.text(sosireOra || "", M + chronoColW * 1 + 2, currentY + 9)
      doc.text(plecareOra || "", M + chronoColW * 2 + 2, currentY + 9)
      doc.text(durataText, M + chronoColW * 3 + 2, currentY + 9)
      
      currentY += chronoTableH + 3 // Redus de la 5 la 3
      
      // SECȚIUNE TEHNICIENI PARTICIPANȚI
      if (lucrareForPDF.tehnicieni && Array.isArray(lucrareForPDF.tehnicieni) && lucrareForPDF.tehnicieni.length > 0) {
        checkPageBreak(15)
        
        doc.setFontSize(9)
          .setFont("NotoSans", "bold")
          .setTextColor(50, 50, 50)
        
        doc.text("Tehnicieni participanti:", M + 2, currentY + 4)
        
        // Afișăm tehnicienii separați prin virgulă
        const tehnicienList = normalize(lucrareForPDF.tehnicieni.join(", "))
        doc.setFontSize(9)
          .setFont("NotoSans", "normal")
          .setTextColor(30, 30, 30)
        
        const tehnicienLines = doc.splitTextToSize(tehnicienList, W - 4)
        doc.text(tehnicienLines, M + 2, currentY + 9)
        
        const tehnicienLinesCount = Array.isArray(tehnicienLines) ? tehnicienLines.length : 1
        currentY += 9 + (tehnicienLinesCount * 4) + 3
      }

      // SECȚIUNE DETALII LOCAȚIE ȘI ECHIPAMENT – stil nou
      const detailsBarHeight = 5
      doc.setFillColor(sectionBarBg[0], sectionBarBg[1], sectionBarBg[2])
      doc.rect(M, currentY, W, detailsBarHeight, "F")

      doc.setFontSize(10)
        .setFont("NotoSans", "bold")
        .setTextColor(sectionTitleColor[0], sectionTitleColor[1], sectionTitleColor[2])
        .text("Detalii locatie si echipament", M + 2, currentY + 4)
      
      currentY += detailsBarHeight + 2
      
      // Tabel 2 coloane - Locație și Echipament (fără fundal și border)
      const detailsColW = W / 2
      const detailsTableH = 12
      
      // Labels (fără fundal) – font 9 (identic cu "Defect reclamat" etc.)
      doc.setFontSize(9)
        .setFont("NotoSans", "bold")
        .setTextColor(50, 50, 50)
      
      doc.text("Locatie:", M + 2, currentY + 4)
      doc.text("Echipament:", M + detailsColW + 2, currentY + 4)
      
      // Valori
      doc.setFontSize(9)
        .setFont("NotoSans", "normal")
        .setTextColor(30, 30, 30)
      
      doc.text(normalize(lucrareForPDF.locatie || ""), M + 2, currentY + 9)
      const echipamentText = lucrareForPDF.echipament || ""
      doc.text(normalize(echipamentText), M + detailsColW + 2, currentY + 9)
      
      currentY += detailsTableH + 3 // Redus de la 5 la 3

      // SECȚIUNE DETALII DESPRE INTERVENȚIE – stil nou
      const interventionBarHeight = 5
      doc.setFillColor(sectionBarBg[0], sectionBarBg[1], sectionBarBg[2])
      doc.rect(M, currentY, W, interventionBarHeight, "F")

      doc.setFontSize(10)
        .setFont("NotoSans", "bold")
        .setTextColor(sectionTitleColor[0], sectionTitleColor[1], sectionTitleColor[2])
        .text("Detalii despre interventie", M + 2, currentY + 4)
      
      currentY += interventionBarHeight + 2

      // Helper pentru câmpuri de text cu înălțime dinamică (fără fundal și border)
      const addTextSection = (label: string, text?: string) => {
        if (!text?.trim()) return
        
        doc.setFontSize(9).setFont("NotoSans", "bold").setTextColor(50, 50, 50)
        doc.text(`${label}:`, M + 2, currentY + 4)
        
        const textLines = doc.splitTextToSize(normalize(text), W - 6)
        const lineHeight = 4
        const boxHeight = Math.max(textLines.length * lineHeight + 6, 12)

        checkPageBreak(boxHeight + 5)

        doc.setFont("NotoSans", "normal").setFontSize(9).setTextColor(30, 30, 30)
        textLines.forEach((l: string, li: number) => doc.text(l, M + 2, currentY + 4 + (li + 1) * lineHeight))
        
        currentY += boxHeight + 2 // Redus de la 3 la 2
      }

      addTextSection("Defect reclamat", lucrareForPDF.defectReclamat)
      addTextSection("Cauza principala defect", (lucrareForPDF as any).cauzaPrincipalaDefect)
      addTextSection("Constatare la locatie", lucrareForPDF.constatareLaLocatie)
      addTextSection("Descriere interventie", lucrareForPDF.descriereInterventie)
      
      currentY += 6 // Padding inferior pentru secțiunea "Detalii despre interventie"

      // Use the products from the snapshot if available, otherwise fallback to current products
      const productsToUse = (lucrareForPDF.raportSnapshot?.products && lucrareForPDF.raportSnapshot.products.length > 0)
        ? lucrareForPDF.raportSnapshot.products
        : Array.isArray(lucrareForPDF.products)
          ? lucrareForPDF.products
          : products

      // SECȚIUNE SERVICII ȘI PIESE (tabel produse)
      if (productsToUse && productsToUse.length > 0) {
        // Normalize products to a consistent shape to avoid missing name/fields from legacy keys
        const normalizedProducts = productsToUse.map((p: any) => {
          const name = p?.name ?? p?.denumire ?? p?.title ?? ""
          const um = p?.um ?? p?.unitate ?? p?.unit ?? "-"
          const quantity = Number(p?.quantity ?? p?.cantitate ?? p?.qty ?? 0)
          const price = Number(p?.price ?? p?.pretUnitar ?? p?.unitPrice ?? 0)
          return { name, um, quantity, price }
        })
        
        checkPageBreak(15)
        
        // Bară pentru "Servicii si piese" – stil nou
        const productsBarHeight = 7
        doc.setFillColor(sectionBarBg[0], sectionBarBg[1], sectionBarBg[2])
        doc.rect(M, currentY, W, productsBarHeight, "F")
        // Linie de delimitare neagră la baza secțiunii
        doc.setDrawColor(0, 0, 0).setLineWidth(0.4)
        doc.line(M, currentY + productsBarHeight, M + W, currentY + productsBarHeight)

        doc.setFontSize(10)
          .setFont("NotoSans", "bold")
          .setTextColor(sectionTitleColor[0], sectionTitleColor[1], sectionTitleColor[2])
          .text("Servicii si piese", M + 2, currentY + 5)
        
        currentY += productsBarHeight
        // Linie groasă deasupra tabelului (ca în imagine)
        doc.setDrawColor(0, 0, 0).setLineWidth(0.6)
        doc.line(M, currentY, M + W, currentY)
        currentY += 2

        // Design tabel similar cu cel de la ofertă
        const headers = ["Servicii/Piese", "Cantitate", "Pret unitar", "Suma liniei"]
        const colWidths = [W - 20 - 24 - 28, 20, 24, 28]
        const colPos: number[] = [M]
        for (let i = 0; i < colWidths.length; i++) colPos.push(colPos[i] + colWidths[i])

        const drawTableHeader = () => {
          // Header coloane – text negru, fără fundal, aliniere ca în imagine
          doc.setTextColor(0, 0, 0)
          doc.setFont("NotoSans", "bold").setFontSize(11)
          
          headers.forEach((h, i) => {
            if (i === 0) {
              // Prima coloană aliniat stânga
              doc.text(h, colPos[i] + 2, currentY + 5)
            } else {
              // Coloane numerice aliniate dreapta
              doc.text(h, colPos[i] + colWidths[i] - 1, currentY + 5, { align: "right" })
            }
          })
          
          currentY += 7
          // Nu desenăm o linie imediat după header; prima linie va fi după primul rând
          doc.setTextColor(0) // reset la negru pentru body
        }

        drawTableHeader()

        normalizedProducts.forEach((product) => {
          const nameText = product.name && String(product.name).trim().length > 0 ? product.name : "—"
          const nameLines = doc.splitTextToSize(normalize(nameText), colWidths[0] - 2)
          const rowHeight = Math.max(nameLines.length * 4.5 + 2, 6)
          
          checkPageBreak(rowHeight)

          doc.setFont("NotoSans", "normal").setFontSize(10).setTextColor(0, 0, 0)
          
          // Denumire
          nameLines.forEach((l: string, li: number) => doc.text(l, colPos[0] + 2, currentY + 5 + li * 4.5))
          
          // Cantitate
          doc.text(String(product.quantity || 0), colPos[1] + colWidths[1] - 1, currentY + 5, { align: "right" })
          
          // Preț unitar
          doc.text(`${(product.price || 0).toLocaleString("ro-RO")}`, colPos[2] + colWidths[2] - 1, currentY + 5, { align: "right" })
          
          // Total
          const tot = (product.quantity || 0) * (product.price || 0)
          doc.text(`${tot.toLocaleString("ro-RO")}`, colPos[3] + colWidths[3] - 1, currentY + 5, { align: "right" })

          currentY += rowHeight
          
          // Linie separator între rânduri – negru, bine definit
          doc.setDrawColor(0, 0, 0).setLineWidth(0.4)
          doc.line(M, currentY, M + W, currentY)
        })

        // TOTALS cu fundal albastru deschis (ca la ofertă)
        currentY += 6
        
        const subtotal = normalizedProducts.reduce((s, p) => s + (p.quantity || 0) * (p.price || 0), 0)
        const total = subtotal // fără discount
        
        const rowHeight = 5
        const verticalPad = 1
        const bandHeight = (rowHeight * 2) + (verticalPad * 2) // doar 2 rânduri (Subtotal + Total)
        
        checkPageBreak(bandHeight + 5)
        
        // Draw blue band (ca la ofertă)
        doc.setFillColor(220, 227, 240) // very light blue tint
        doc.rect(M, currentY, W, bandHeight, "F")
        
        // Start text with top padding
        currentY += verticalPad + 3
        
        const valueX = M + W - 5 // values aligned at right edge
        const labelColonX = M + W - 45 // position for colons
        
        // Subtotal
        doc.setTextColor(0, 0, 0).setFont("NotoSans", "normal").setFontSize(10)
        doc.text("Subtotal:", labelColonX, currentY, { align: "right" })
        doc.text(`${subtotal.toLocaleString("ro-RO")}`, valueX, currentY, { align: "right" })
        currentY += rowHeight
        
        // Total lei fara TVA (bold) - fără discount
        doc.setFont("NotoSans", "bold").setFontSize(11)
        doc.text("Total LEI fara TVA:", labelColonX, currentY, { align: "right" })
        doc.text(`${total.toLocaleString("ro-RO")}`, valueX, currentY, { align: "right" })
        currentY += rowHeight + verticalPad + 3
        
        doc.setTextColor(0, 0, 0)
        currentY += 4 // Redus de la 8 la 4
      }

      // SECȚIUNE ATAȘAMENTE - dezactivată temporar
      const includeAttachments = false
      const imaginiDefecte = includeAttachments ? (lucrareForPDF.imaginiDefecte || []) : []
      if (includeAttachments && imaginiDefecte.length > 0) {
        currentY += 8
        checkPageBreak(20)
        
        // Titlu secțiune – cu fundal deschis și titlu albastru
        const attachBarH = 7
        doc.setFillColor(sectionBarBg[0], sectionBarBg[1], sectionBarBg[2])
        doc.rect(M, currentY, W, attachBarH, "F")
        // Linie de delimitare neagră la baza secțiunii
        doc.setDrawColor(0, 0, 0).setLineWidth(0.4)
        doc.line(M, currentY + attachBarH, M + W, currentY + attachBarH)
        doc.setTextColor(sectionTitleColor[0], sectionTitleColor[1], sectionTitleColor[2])
        doc.setFont("NotoSans", "bold").setFontSize(10)
        doc.text(normalize("Atasamente"), M + 2, currentY + 5)
        currentY += attachBarH + 2
        
        // Calculăm dimensiunile imaginilor
        const imagesPerRow = 4
        const imageGap = 2
        const imageWidth = (W - (imageGap * (imagesPerRow - 1))) / imagesPerRow
        const imageHeight = imageWidth * 0.75 // aspect ratio 4:3
        
        // Încărcăm și adăugăm imaginile
        let imageIndex = 0
        for (const img of imaginiDefecte) {
          try {
            checkPageBreak(imageHeight + 10)
            
            // Calculăm poziția X pentru imagine
            const col = imageIndex % imagesPerRow
            const xPos = M + col * (imageWidth + imageGap)
            
            // Dacă este prima imagine a unui rând nou
            if (col === 0 && imageIndex > 0) {
              currentY += imageHeight + imageGap + 2
            }
            
            // Adăugăm imaginea
            if (img.url) {
              // Frame pentru imagine
              // Border negru, bine definit pentru fiecare imagine atașată
              doc.setDrawColor(0, 0, 0)
              doc.setLineWidth(0.3)
              doc.rect(xPos, currentY, imageWidth, imageHeight)
              
              // Încărcăm imaginea
              const response = await fetch(img.url)
              const blob = await response.blob()
              const reader = new FileReader()
              const dataUrl: string = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
              })
              
              // Adăugăm imaginea în PDF
              const fmt = (blob.type && blob.type.toLowerCase().includes("png")) ? "PNG" : "JPEG"
              doc.addImage(dataUrl, fmt as any, xPos + 0.5, currentY + 0.5, imageWidth - 1, imageHeight - 1)
            }
            
            imageIndex++
          } catch (error) {
            console.error("Error loading image:", error)
            // Continuăm cu următoarea imagine
          }
        }
        
        // Ajustăm currentY după ultimul rând de imagini
        const lastRowCount = imageIndex % imagesPerRow || imagesPerRow
        currentY += imageHeight + 8
      }

      // Înainte de semnături: pentru lucrările tip Revizie listăm echipamentele procesate
      if (lucrareForPDF.tipLucrare === "Revizie" && lucrare.id) {
        try {
          const revCol = collection(db, "lucrari", lucrare.id, "revisions")
          const revSnap = await getDocs(revCol)
          const revisions = revSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          const equipmentNames = revisions.map((r: any) => r.equipmentName || r.id)
          if (equipmentNames.length) {
            checkPageBreak(12)
            doc.setFont("NotoSans", "bold").setFontSize(11).setTextColor(0, 0, 0)
            doc.text(normalize("Am efectuat revizie tehnica conform listei de operatiuni pentru:"), M + 2, currentY + 6)
            currentY += 8
            doc.setFont("NotoSans", "normal").setFontSize(10).setTextColor(0, 0, 0)
            for (const name of equipmentNames) {
              const lines = doc.splitTextToSize(`• ${normalize(String(name))}`, W - 6)
              const height = lines.length * 4.2 + 2
              checkPageBreak(height + 2)
              lines.forEach((ln: string, idx: number) => {
                doc.text(ln, M + 4, currentY + 4 + idx * 4.2)
              })
              currentY += height
            }
            currentY += 4
          }
        } catch (e) {
          console.warn("Nu s-a putut lista echipamentele de revizie în raport:", e)
        }
      }

      // SEMNĂTURI - tehnician stânga, beneficiar dreapta distanțat
      // Folosim un prag mai mic pentru a evita trecerea prea devreme pe pagina următoare
      checkPageBreak(32)
      
      currentY += 8 // Spațiu între atașamente și semnături
      
      const signatureHeight = 30 // Redus de la 35
      const signatureImageHeight = 14 // Redus de la 18
      
      // Secțiunea tehnician (partea stângă)
      const techSectionWidth = W * 0.45 // 45% din lățime
      
      doc.setFontSize(9).setFont("NotoSans", "normal").setTextColor(0, 0, 0)
      const techLabelText = "Nume si semnatura tehnician"
      doc.text(techLabelText, M + 2, currentY + 4)
      
      // Linie subliniere DOAR cât textul
      const techLabelWidth = doc.getTextWidth(techLabelText)
      doc.setDrawColor(0, 0, 0).setLineWidth(0.3)
      doc.line(M + 2, currentY + 5, M + 2 + techLabelWidth, currentY + 5)
      
      const numeTehnician = normalize(lucrareForPDF.numeTehnician || "")
      if (numeTehnician) {
        doc.setFont("NotoSans", "bold")
        doc.text(numeTehnician, M + 2, currentY + 10)
        
        // Linie subliniere DOAR cât numele
        const numeWidth = doc.getTextWidth(numeTehnician)
        doc.setDrawColor(0, 0, 0).setLineWidth(0.2)
        doc.line(M + 2, currentY + 11, M + 2 + numeWidth, currentY + 11)
      }
      
      // Semnătură tehnician (mai mică)
      if (lucrareForPDF.semnaturaTehnician) {
        try {
          doc.addImage(lucrareForPDF.semnaturaTehnician, "PNG", M + 2, currentY + 13, techSectionWidth - 4, signatureImageHeight)
        } catch (e) {
          console.error("Error adding tech signature:", e)
        }
      }
      
      // Secțiunea beneficiar (partea dreaptă) – text aliniat la dreapta
      const benefSectionStart = M + W * 0.55 // stânga secțiunii drepte
      const benefSectionWidth = W * 0.45 // lățimea secțiunii drepte

      const rightEdge = M + W - 2 // marginea dreaptă de referință (cu mic padding)
      doc.setFontSize(9).setFont("NotoSans", "normal").setTextColor(0, 0, 0)
      const benefLabelText = "Nume si semnatura beneficiar"
      // text aliniat la dreapta
      doc.text(benefLabelText, rightEdge, currentY + 4, { align: "right" } as any)
      // Linie subliniere de la dreapta spre stânga, exact cât textul
      const benefLabelWidth = doc.getTextWidth(benefLabelText)
      doc.setDrawColor(0, 0, 0).setLineWidth(0.3)
      doc.line(rightEdge - benefLabelWidth, currentY + 5, rightEdge, currentY + 5)

      const numeBeneficiar = normalize(lucrareForPDF.numeBeneficiar || lucrareForPDF.persoanaContact || "")
      if (numeBeneficiar) {
        doc.setFont("NotoSans", "bold")
        doc.text(numeBeneficiar, rightEdge, currentY + 10, { align: "right" } as any)
        const numeWidth = doc.getTextWidth(numeBeneficiar)
        doc.setDrawColor(0, 0, 0).setLineWidth(0.2)
        doc.line(rightEdge - numeWidth, currentY + 11, rightEdge, currentY + 11)
      }

      // Semnătură beneficiar: menținem în secțiunea dreaptă, ancorată la marginea dreaptă
      if (lucrareForPDF.semnaturaBeneficiar) {
        try {
          const imgWidth = benefSectionWidth - 4
          const imgX = rightEdge - imgWidth // aliniere la dreapta
          doc.addImage(lucrareForPDF.semnaturaBeneficiar, "PNG", imgX, currentY + 13, imgWidth, signatureImageHeight)
        } catch (e) {
          console.error("Error adding client signature:", e)
        }
      }
      
      currentY += signatureHeight + 8

      // Desenăm footer-ul pe ultima pagină
      drawFooter()

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
            
            const updateData: any = {
              raportGenerat: true,
              raportDataLocked: true,
              raportSnapshot: lucrareForPDF.raportSnapshot,
              statusLucrare: "Finalizat", // Actualizez automat statusul la "Finalizat"
              updatedAt: serverTimestamp(),
              timpPlecare: lucrareForPDF.timpPlecare,
              dataPlecare: lucrareForPDF.dataPlecare,
              oraPlecare: lucrareForPDF.oraPlecare,
              durataInterventie: lucrareForPDF.durataInterventie,
              cauzaPrincipalaDefectId: (lucrareForPDF as any).cauzaPrincipalaDefectId,
              cauzaPrincipalaDefect: (lucrareForPDF as any).cauzaPrincipalaDefect,
              statusFinalizareInterventie: "FINALIZAT",
              ...(typeof clientRating === 'number' ? { clientRating: Math.max(1, Math.min(5, clientRating)) } : {}),
              ...(clientReview?.trim() ? { clientReview: clientReview.trim() } : {}),
            }
            
            // Adăugăm și sincronizăm numerele dacă există
            if (numarRaport) {
              updateData.numarRaport = numarRaport
              updateData.nrLucrare = String(numarRaport)
              console.log("✅ SALVEZ numarRaport/nrLucrare în Firestore:", numarRaport)
            } else {
              console.log("❌ NU salvez numarRaport/nrLucrare (nu există)")
            }
            
            console.log("📦 Date care se salvează:", {
              raportGenerat: updateData.raportGenerat,
              raportDataLocked: updateData.raportDataLocked,
              statusLucrare: updateData.statusLucrare,
              hasSnapshot: !!updateData.raportSnapshot,
              snapshotSize: updateData.raportSnapshot ? Object.keys(updateData.raportSnapshot).length : 0,
              timpPlecare: updateData.timpPlecare,
              dataPlecare: updateData.dataPlecare,
              oraPlecare: updateData.oraPlecare,
              durataInterventie: updateData.durataInterventie,
              numarRaport: updateData.numarRaport || "NU SE SALVEAZĂ"
            })
            
            // DEBUGGING SUPLIMENTAR PENTRU TIMPI CORUPȚI - VERIFICARE ÎNAINTE DE SALVARE
            console.log("🔍 VERIFICARE FINALĂ ÎNAINTE DE SALVARE în Firestore:")
            console.log("📅 timpPlecare care se va salva:", updateData.timpPlecare)
            console.log("📅 Interpretare timpPlecare:", new Date(updateData.timpPlecare).toLocaleString('ro-RO'))
            console.log("📅 Anul din timpPlecare:", new Date(updateData.timpPlecare).getFullYear())
            
            if (updateData.raportSnapshot?.timpPlecare) {
              console.log("📅 timpPlecare din snapshot:", updateData.raportSnapshot.timpPlecare)
              console.log("📅 Interpretare timpPlecare snapshot:", new Date(updateData.raportSnapshot.timpPlecare).toLocaleString('ro-RO'))
              console.log("📅 Anul din timpPlecare snapshot:", new Date(updateData.raportSnapshot.timpPlecare).getFullYear())
            }
            
            // Verificare finală pentru date în viitor
            const currentYear = new Date().getFullYear()
            const plecareYear = new Date(updateData.timpPlecare).getFullYear()
            if (plecareYear > currentYear) {
              console.log("🚨🚨🚨 ALERTĂ FINALĂ: timpPlecare în viitor detectat înainte de salvare!")
              console.log("🚨 Anul curent:", currentYear)
              console.log("🚨 Anul timpPlecare:", plecareYear)
              console.log("🚨 Această problemă va corupe datele în Firestore!")
            }
            
            await updateDoc(doc(db, "lucrari", lucrare.id), updateData)
            // LOG DEBUG – confirmare că update-ul a fost trimis în Firestore
            console.log("🔍 Firestore UPDATE (prima generare) – payload trimis:", updateData)
            console.log("✅ SUCCES - Prima generare salvată în Firestore cu statusLucrare: Finalizat")
          } else if (isOldFinalizedReport) {
            console.log("🏛️ RAPORT VECHI FINALIZAT - Nu salvez nimic în baza de date")
            console.log("📋 Folosesc doar datele existente pentru PDF fără a modifica starea tichetului")
          } else {
            console.log("🔄 REGENERARE - Actualizez timestamp-ul și atribui număr dacă lipsea")
            const payload: any = { updatedAt: serverTimestamp() }
            if (!lucrare.numarRaport && numarRaport) {
              payload.numarRaport = numarRaport
              payload.nrLucrare = String(numarRaport)
              console.log("✅ Atribui numarRaport/nrLucrare la regenerare:", numarRaport)
            }
            await updateDoc(doc(db, "lucrari", lucrare.id), payload)
            // LOG DEBUG – confirmare regenerare
            console.log("🔍 Firestore UPDATE (regenerare) – payload:", payload)
            console.log("✅ SUCCES - Regenerare confirmată în Firestore")
          }
        } catch (e) {
          console.error("❌ EROARE la salvarea în Firestore:", e)
        }
      } else {
        console.log("⚠️ Nu pot salva - ID tichet lipsește")
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

      {/* Client rating & review (imediat după zona de semnături în PDF, dar pentru UI aici înainte de generare) */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Feedback client (opțional)</div>
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map((idx) => (
            <button
              key={idx}
              type="button"
              className={`text-xl leading-none ${((clientRating ?? 0) >= idx) ? 'text-yellow-500' : 'text-gray-300'}`}
              onClick={() => setClientRating(idx)}
              aria-label={`Setează rating ${idx}`}
            >
              ★
            </button>
          ))}
          {clientRating ? <span className="ml-2 text-sm text-gray-600">{clientRating}/5</span> : null}
        </div>
        <textarea
          placeholder="Scrieți recenzia (max. 1000 caractere)"
          value={clientReview}
          onChange={(e) => setClientReview(e.target.value.slice(0, 1000))}
          className="w-full border rounded p-2 text-sm min-h-[80px]"
        />
      </div>
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
