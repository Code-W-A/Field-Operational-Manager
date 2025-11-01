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
const M = 10 // page margin (reduced from 15mm to 10mm for more content space)
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
      } else if (isFirstGeneration && !numarRaport) {
        // Doar pentru lucrări noi la prima generare generăm număr
        console.log("🔢 CONDIȚII ÎNDEPLINITE pentru generarea numărului:")
        console.log("   - isFirstGeneration:", isFirstGeneration)
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
        const timpPlecare = now.toISOString()
        const dataPlecare = formatDate(now)
        const oraPlecare = formatTime(now)
        // Folosim mereu cele mai recente produse venite prin props (din pagina),
        // iar dacă nu există acolo, cădem înapoi pe state-ul intern.
        const currentProducts = (lucrare?.products && lucrare.products.length > 0) ? lucrare.products : products
        
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
          products: [...currentProducts], // copie a produselor (cele mai recente din props sau state)
          constatareLaLocatie: lucrare.constatareLaLocatie,
          descriereInterventie: lucrare.descriereInterventie,
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
            semnaturaTehnician: lucrare.raportSnapshot.semnaturaTehnician,
            semnaturaBeneficiar: lucrare.raportSnapshot.semnaturaBeneficiar,
            numeTehnician: lucrare.raportSnapshot.numeTehnician,
            numeBeneficiar: lucrare.raportSnapshot.numeBeneficiar,
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

      // Funcție pentru desenarea footer-ului pe pagina curentă
      const drawFooter = () => {
        // FOOTER cu separator și 3 coloane (la fel ca la ofertă)
        const footerSepY = PH - 28
        doc.setDrawColor(209, 213, 219) // gri deschis
        doc.setLineWidth(0.2)
        doc.line(M, footerSepY, M + W, footerSepY)
        
        let footerY = footerSepY + 5
        doc.setFontSize(8)
        doc.setTextColor(41, 72, 143) // albastru vibrant ca la ofertă
        
        const footerColW = W / 3 - 4
        const footerColX = [M, M + W / 3, M + (2 * W) / 3]
        
        const footerLeft = [
          "NRG Access Systems SRL",
          "Rezervelor Nr 70,",
          "Chiajna, Ilfov",
          "C.I.F. RO34272913",
        ]
        const footerMid = [
          "Telefon: +40 371 49 44 99",
          "E-mail: office@nrg-access.ro",
          "Website: www.nrg-access.ro",
        ]
        const footerRight = [
          "IBAN RO79BTRL RON CRT 0294 5948 01",
          "Banca Transilvania Sucursala Aviatiei",
        ]
        
        const renderFooterColumn = (items: string[], x: number) => {
          let yy = footerY
          items.forEach((t) => {
            const lines = doc.splitTextToSize(t, footerColW)
            lines.forEach((ln: string) => {
              doc.text(ln, x, yy)
              yy += 4
            })
          })
        }
        
        renderFooterColumn(footerLeft, footerColX[0])
        renderFooterColumn(footerMid, footerColX[1])
        renderFooterColumn(footerRight, footerColX[2])
      }

      // Helper: add new page if required
      const checkPageBreak = (needed: number) => {
        if (currentY + needed > PH - M - 30) { // Lăsăm 30mm pentru footer (footer începe la PH-28)
          drawFooter() // Desenăm footer-ul pe pagina curentă înainte de a trece la următoarea
          doc.addPage()
          currentY = M
        }
      }

      // HEADER cu design nou inspirat din imagine
      
      // TITLE BAR CU FUNDAL ALBASTRU
      const titleBarHeight = 16 // mai înalt pentru logo-ul mai mare
      const titleBarColor = [73, 100, 155] // #49649b - exact ca la ofertă
      doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
      doc.rect(M, currentY, W, titleBarHeight, "F")
      
      // TITLU în stânga cu padding
      const reportNumber = lucrareForPDF.numarRaport ? String(lucrareForPDF.numarRaport).padStart(6, '0') : "000000"
      doc.setFontSize(12)
        .setFont("helvetica", "bold")
        .setTextColor(255, 255, 255)
        .text("Raport de interventie nr. #" + reportNumber, M + 4, currentY + (titleBarHeight / 2) + 1)
      
      // LOGO în dreapta sus (mai mare, proporții corecte ca la ofertă)
      if (logoLoaded && logoDataUrl) {
        try {
          const logoW = 24
          const logoH = 18 // proporții corecte ca la ofertă
          doc.addImage(logoDataUrl, "PNG", M + W - logoW - 4, currentY + (titleBarHeight - logoH) / 2, logoW, logoH)
        } catch {
          doc.setFontSize(10)
            .setFont("helvetica", "bold")
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
      doc.setFontSize(9)
        .setFont("helvetica", "bold")
        .setTextColor(0, 0, 0)
        .text("Prestator", leftColX, currentY)
      
      doc.setFontSize(9)
        .setFont("helvetica", "normal")
      
      const prestatorLines = [
        "NRG Access Systems SRL",
        "RO34272913",
        "Rezervelor 70, Chiajna, Ilfov"
      ]
      
      prestatorLines.forEach((line, i) => {
        doc.text(normalize(line), leftColX, currentY + 6 + (i * lineH))
      })
      
      // Beneficiar (dreapta, aliniat la dreapta)
      doc.setFont("helvetica", "bold")
        .text("Beneficiar", M + W, currentY, { align: "right" })
      
      doc.setFont("helvetica", "normal")
      
      const clientInfo = lucrareForPDF.clientInfo || {}
      const beneficiarLines = [
        lucrareForPDF.client || "-",
        clientInfo.cui ? `RO${clientInfo.cui}` : "-",
        clientInfo.adresa || "-",
      ]
      
      beneficiarLines.forEach((line, i) => {
        doc.text(normalize(line), M + W, currentY + 6 + (i * lineH), { align: "right" })
      })
      
      const maxLines = Math.max(prestatorLines.length, beneficiarLines.length)
      currentY += 6 + (maxLines * lineH) + 3 // Redus de la 6 la 3

      // SECȚIUNE CRONOLOGIE cu fundal albastru ca în imagine
      const chronoBarHeight = 7
      doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
      doc.rect(M, currentY, W, chronoBarHeight, "F")
      
      doc.setFontSize(9)
        .setFont("helvetica", "bold")
        .setTextColor(255, 255, 255)
        .text("Cronologie", M + 2, currentY + 5)
      
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
      const [emitereData] = (lucrareForPDF.dataInterventie || " - ").split(" ")
      const sosireData = lucrareForPDF.dataSosire || (lucrareForPDF.timpSosire ? formatDate(new Date(lucrareForPDF.timpSosire)) : "")
      const sosireOra = lucrareForPDF.oraSosire || (lucrareForPDF.timpSosire ? formatTime(new Date(lucrareForPDF.timpSosire)) : "")
      const plecareData = lucrareForPDF.dataPlecare || (lucrareForPDF.timpPlecare ? formatDate(new Date(lucrareForPDF.timpPlecare)) : "")
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
      
      // Header labels (fără fundal)
      doc.setFontSize(7)
        .setFont("helvetica", "bold")
        .setTextColor(50, 50, 50)
      
      doc.text("Emis la:", M + chronoColW * 0 + 2, currentY + 4)
      doc.text("Timp sosire:", M + chronoColW * 1 + 2, currentY + 4)
      doc.text("Timp plecare:", M + chronoColW * 2 + 2, currentY + 4)
      doc.text("Durata:", M + chronoColW * 3 + 2, currentY + 4)
      
      // Valori
      doc.setFontSize(8)
        .setFont("helvetica", "normal")
        .setTextColor(30, 30, 30)
      
      doc.text(normalize(emitereData || "-"), M + chronoColW * 0 + 2, currentY + 9)
      doc.text(sosireData && sosireOra ? `${normalize(sosireData)}, ${sosireOra}` : "", M + chronoColW * 1 + 2, currentY + 9)
      doc.text(plecareData && plecareOra ? `${normalize(plecareData)}, ${plecareOra}` : "", M + chronoColW * 2 + 2, currentY + 9)
      doc.text(durataText, M + chronoColW * 3 + 2, currentY + 9)
      
      currentY += chronoTableH + 3 // Redus de la 5 la 3

      // SECȚIUNE DETALII LOCAȚIE ȘI ECHIPAMENT
      const detailsBarHeight = 7
      doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
      doc.rect(M, currentY, W, detailsBarHeight, "F")
      
      doc.setFontSize(9)
        .setFont("helvetica", "bold")
        .setTextColor(255, 255, 255)
        .text("Detalii locatie si echipament", M + 2, currentY + 5)
      
      currentY += detailsBarHeight + 2
      
      // Tabel 2 coloane - Locație și Echipament (fără fundal și border)
      const detailsColW = W / 2
      const detailsTableH = 12
      
      // Labels (fără fundal)
      doc.setFontSize(7)
        .setFont("helvetica", "bold")
        .setTextColor(50, 50, 50)
      
      doc.text("Locatie:", M + 2, currentY + 4)
      doc.text("Echipament:", M + detailsColW + 2, currentY + 4)
      
      // Valori
      doc.setFontSize(8)
        .setFont("helvetica", "normal")
        .setTextColor(30, 30, 30)
      
      doc.text(normalize(lucrareForPDF.locatie || ""), M + 2, currentY + 9)
      const echipamentText = lucrareForPDF.echipament || ""
      doc.text(normalize(echipamentText), M + detailsColW + 2, currentY + 9)
      
      currentY += detailsTableH + 3 // Redus de la 5 la 3

      // SECȚIUNE DETALII DESPRE INTERVENȚIE
      const interventionBarHeight = 7
      doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
      doc.rect(M, currentY, W, interventionBarHeight, "F")
      
      doc.setFontSize(9)
        .setFont("helvetica", "bold")
        .setTextColor(255, 255, 255)
        .text("Detalii despre interventie", M + 2, currentY + 5)
      
      currentY += interventionBarHeight + 2

      // Helper pentru câmpuri de text cu înălțime dinamică (fără fundal și border)
      const addTextSection = (label: string, text?: string) => {
        if (!text?.trim()) return
        
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(50, 50, 50)
        doc.text(`${label}:`, M + 2, currentY + 4)
        
        const textLines = doc.splitTextToSize(normalize(text), W - 6)
        const lineHeight = 4
        const boxHeight = Math.max(textLines.length * lineHeight + 6, 12)

        checkPageBreak(boxHeight + 5)

        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(30, 30, 30)
        textLines.forEach((l: string, li: number) => doc.text(l, M + 2, currentY + 4 + (li + 1) * lineHeight))
        
        currentY += boxHeight + 2 // Redus de la 3 la 2
      }

      addTextSection("Defect reclamat", lucrareForPDF.defectReclamat)
      addTextSection("Constatare la locatie", lucrareForPDF.constatareLaLocatie)
      addTextSection("Descriere interventie", lucrareForPDF.descriereInterventie)
      
      currentY += 4 // Redus de la 8 la 4

      // Use the products from the snapshot if available, otherwise fallback to current products
      const productsToUse = (lucrareForPDF.raportSnapshot?.products && lucrareForPDF.raportSnapshot.products.length > 0)
        ? lucrareForPDF.raportSnapshot.products
        : (lucrareForPDF.products && lucrareForPDF.products.length > 0)
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
        
        // Bară albastră pentru "Servicii si piese"
        const productsBarHeight = 7
        doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
        doc.rect(M, currentY, W, productsBarHeight, "F")
        
        doc.setFontSize(9)
          .setFont("helvetica", "bold")
          .setTextColor(255, 255, 255)
          .text("Servicii si piese", M + 2, currentY + 5)
        
        currentY += productsBarHeight + 2

        // Design tabel similar cu cel de la ofertă
        const headers = ["Servicii/Piese", "Cantitate", "Pret unitar", "Suma liniei"]
        const colWidths = [W - 20 - 24 - 28, 20, 24, 28]
        const colPos: number[] = [M]
        for (let i = 0; i < colWidths.length; i++) colPos.push(colPos[i] + colWidths[i])

        const drawTableHeader = () => {
          // Column header cu text albastru (ca la ofertă), fără fundal
          doc.setTextColor(73, 100, 155) // #49649b
          doc.setFont("helvetica", "bold").setFontSize(10)
          
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
          
          // Linie separator deasupra primului rând (ca la ofertă)
          doc.setDrawColor(209, 213, 219).setLineWidth(0.2)
          doc.line(M, currentY, M + W, currentY)
          
          doc.setTextColor(0) // reset la negru pentru body
        }

        drawTableHeader()

        normalizedProducts.forEach((product) => {
          const nameText = product.name && String(product.name).trim().length > 0 ? product.name : "—"
          const nameLines = doc.splitTextToSize(normalize(nameText), colWidths[0] - 2)
          const rowHeight = Math.max(nameLines.length * 4.5 + 2, 6)
          
          checkPageBreak(rowHeight)

          doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
          
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
          
          // Row separator (ca la ofertă)
          doc.setDrawColor(209, 213, 219).setLineWidth(0.2)
          doc.line(M, currentY, M + W, currentY)
        })

        // TOTALS cu fundal albastru deschis (ca la ofertă)
        currentY += 6
        
        const subtotal = normalizedProducts.reduce((s, p) => s + (p.quantity || 0) * (p.price || 0), 0)
        const adj = 5 // ajustare default 5%
        const total = subtotal * (1 - adj / 100)
        
        const rowHeight = 5
        const verticalPad = 1
        const bandHeight = (rowHeight * 3) + (verticalPad * 2)
        
        checkPageBreak(bandHeight + 5)
        
        // Draw blue band (ca la ofertă)
        doc.setFillColor(220, 227, 240) // very light blue tint
        doc.rect(M, currentY, W, bandHeight, "F")
        
        // Start text with top padding
        currentY += verticalPad + 3
        
        const valueX = M + W - 5 // values aligned at right edge
        const labelColonX = M + W - 45 // position for colons
        
        // Subtotal
        doc.setTextColor(0, 0, 0).setFont("helvetica", "normal").setFontSize(9)
        doc.text("Subtotal:", labelColonX, currentY, { align: "right" })
        doc.text(`${subtotal.toLocaleString("ro-RO")}`, valueX, currentY, { align: "right" })
        currentY += rowHeight
        
        // Ajustare
        doc.text("Ajustare:", labelColonX, currentY, { align: "right" })
        doc.text(`${adj}%`, valueX, currentY, { align: "right" })
        currentY += rowHeight
        
        // Total lei fara TVA (bold)
        doc.setFont("helvetica", "bold").setFontSize(10)
        doc.text("Total insumat LEI fara TVA:", labelColonX, currentY, { align: "right" })
        doc.text(`${total.toLocaleString("ro-RO")}`, valueX, currentY, { align: "right" })
        currentY += rowHeight + verticalPad + 3
        
        doc.setTextColor(0, 0, 0)
        currentY += 4 // Redus de la 8 la 4
      }

      // SEMNĂTURI - 2 coloane cu linie subliniere
      // Verificăm dacă avem spațiu pentru semnături (35mm) + spacing (8mm) = 43mm
      checkPageBreak(45) // Redus de la 50 la 45mm pentru a permite semnăturile să rămână pe prima pagină mai des
      
      const signBoxW = W / 2 - 2
      const signBoxH = 35
      
      // Secțiunea tehnician
      doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(0, 0, 0)
      doc.text("Nume si semnatura tehnician", M + 2, currentY + 4)
      
      // Linie subliniere aproape de text
      doc.setDrawColor(0, 0, 0).setLineWidth(0.3)
      doc.line(M + 2, currentY + 5, M + signBoxW - 2, currentY + 5)
      
      const numeTehnician = normalize(lucrareForPDF.numeTehnician || lucrareForPDF.tehnicieni?.join(", ") || "")
      if (numeTehnician) {
        doc.setFont("helvetica", "bold")
        doc.text(numeTehnician, M + 2, currentY + 10)
      }
      
      // Semnătură tehnician
      if (lucrareForPDF.semnaturaTehnician) {
        try {
          doc.addImage(lucrareForPDF.semnaturaTehnician, "PNG", M + 2, currentY + 14, signBoxW - 4, 18)
        } catch (e) {
          console.error("Error adding tech signature:", e)
        }
      }
      
      // Secțiunea beneficiar
      doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(0, 0, 0)
      doc.text("Nume si semnatura beneficiar", M + signBoxW + 6, currentY + 4)
      
      // Linie subliniere aproape de text
      doc.setDrawColor(0, 0, 0).setLineWidth(0.3)
      doc.line(M + signBoxW + 6, currentY + 5, M + W - 2, currentY + 5)
      
      const numeBeneficiar = normalize(lucrareForPDF.numeBeneficiar || lucrareForPDF.persoanaContact || "")
      if (numeBeneficiar) {
        doc.setFont("helvetica", "bold")
        doc.text(numeBeneficiar, M + signBoxW + 6, currentY + 10)
      }
      
      // Semnătură beneficiar
      if (lucrareForPDF.semnaturaBeneficiar) {
        try {
          doc.addImage(lucrareForPDF.semnaturaBeneficiar, "PNG", M + signBoxW + 6, currentY + 14, signBoxW - 4, 18)
        } catch (e) {
          console.error("Error adding client signature:", e)
        }
      }
      
      currentY += signBoxH + 8

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
            console.log("📋 Folosesc doar datele existente pentru PDF fără a modifica starea lucrării")
          } else {
            console.log("🔄 REGENERARE - Actualizez doar timestamp-ul")
            await updateDoc(doc(db, "lucrari", lucrare.id), {
              updatedAt: serverTimestamp(),
            })
            // LOG DEBUG – confirmare regenerare
            console.log("🔍 Firestore UPDATE (regenerare) – doar updatedAt")
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
