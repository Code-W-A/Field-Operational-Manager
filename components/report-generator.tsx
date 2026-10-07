"use client"

import { loadDocumentClientSnapshot } from "@/lib/work-documents/load-document-client"
import { withDocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot"
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
  readOnly?: boolean
  onError?: (error: Error) => void
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

/**
 * Încarcă o imagine (URL Firebase Storage) și o normalizează la un dataURL JPEG,
 * potrivit pentru `jsPDF.addImage`.
 *
 * De ce așa:
 * - Trecem prin proxy-ul same-origin `/api/image-proxy` ca să evităm erorile CORS
 *   (cauza cadrelor goale din raport când bucket-ul nu trimite anteturi CORS).
 * - Desenăm pe canvas și exportăm JPEG, ca jsPDF să primească mereu un format
 *   suportat (rezolvă și pozele webp/heic făcute de telefoane).
 *
 * Întoarce `null` dacă imaginea chiar nu poate fi încărcată (apelantul desenează un fallback).
 */
async function loadImageAsJpegDataUrl(rawUrl: string): Promise<string | null> {
  if (!rawUrl) return null

  // Dacă deja avem un dataURL (ex. semnături), îl folosim direct.
  if (rawUrl.startsWith("data:")) return rawUrl

  const proxied = `/api/image-proxy?url=${encodeURIComponent(rawUrl)}`

  const fetchBlob = async (src: string): Promise<Blob | null> => {
    try {
      const res = await fetch(src, { cache: "no-store" })
      if (!res.ok) return null
      const blob = await res.blob()
      if (!blob || !blob.type.startsWith("image/")) return null
      return blob
    } catch {
      return null
    }
  }

  // 1) proxy same-origin; 2) fallback direct (în caz că bucket-ul are totuși CORS).
  const blob = (await fetchBlob(proxied)) || (await fetchBlob(rawUrl))
  if (!blob) return null

  const objectUrl = URL.createObjectURL(blob)
  try {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const image = new Image()
      // blob: este same-origin, deci canvas-ul NU devine "tainted".
      image.onload = () => {
        try {
          const naturalW = image.naturalWidth || image.width
          const naturalH = image.naturalHeight || image.height
          if (!naturalW || !naturalH) return resolve(null)
          // Limităm dimensiunea ca să nu umflăm PDF-ul (max ~1000px pe latura mare).
          const maxSide = 1000
          const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH))
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(naturalW * scale))
          canvas.height = Math.max(1, Math.round(naturalH * scale))
          const ctx = canvas.getContext("2d")
          if (!ctx) return resolve(null)
          // Fundal alb pentru transparență (PNG) -> JPEG fără negru.
          ctx.fillStyle = "#ffffff"
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL("image/jpeg", 0.85))
        } catch {
          resolve(null)
        }
      }
      image.onerror = () => resolve(null)
      image.src = objectUrl
    })
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// A4 portrait: 210×297 mm
const M = 7 // page margin (reduced for more content space)
const W = 210 - 2 * M // content width
const BOX_RADIUS = 2 // 2 mm rounded corners
const STROKE = 0.3 // line width (pt)
const LIGHT_GRAY = 240 // fill shade (lighter)
const DARK_GRAY = 210 // darker fill for headers

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(({ lucrare, onGenerate, readOnly = false, onError }, ref) => {
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
    if (readOnly && !lucrare.raportGenerat) {
      onError?.(new Error("Raportul nu este încă generat."))
      return
    }
    
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
      
      // Resolve before any numbering or write. Issued reports only use their saved snapshot.
      const documentClientSnapshot = isFirstGeneration
        ? await loadDocumentClientSnapshot(lucrare)
        : (lucrare.raportSnapshot as any)?.clientSnapshot

      // Gestionăm numărul de raport: preferăm nrLucrare dacă există; altfel numarRaport; altfel generăm
      let numarRaport = lucrare.nrLucrare || lucrare.numarRaport // Folosim numărul existent (nrLucrare sau numarRaport)
      console.log("🔢 ÎNCEPUT gestionare numarRaport - valoarea inițială:", numarRaport || "LIPSEȘTE")
      
      if (isOldFinalizedReport) {
        // Pentru rapoartele vechi finalizate, NU generăm niciun număr
        numarRaport = undefined // Forțăm să fie undefined pentru a nu afișa în PDF
        console.log("🏛️ Raport vechi finalizat - NU se afișează număr de raport")
      } else if (!readOnly && (isFirstGeneration || !numarRaport) && !numarRaport) {
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
          clientSnapshot: documentClientSnapshot,
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
          // Înghețăm fotografiile defectelor pentru consistență la regenerare
          imaginiDefecte: (lucrare as any).imaginiDefecte || [],
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
            imaginiDefecte: readOnly
              ? ((lucrare.raportSnapshot as any)?.imaginiDefecte ?? (lucrare as any).imaginiDefecte ?? [])
              : ((lucrare as any).imaginiDefecte || (lucrare.raportSnapshot as any)?.imaginiDefecte || []),
            // Păstrăm numărul raportului din obiectul principal (nu se stochează în snapshot)
            numarRaport: lucrare.numarRaport
          }
        } else if (readOnly) {
          // Resending legacy reports keeps their stored dates and signatures, even without a snapshot.
          lucrareForPDF = { ...lucrare }
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

      lucrareForPDF = withDocumentClientSnapshot(lucrareForPDF, documentClientSnapshot)
      if (readOnly) lucrareForPDF = { ...lucrareForPDF, numarRaport: lucrare.nrLucrare || lucrare.numarRaport || (lucrare.raportSnapshot as any)?.numarRaport || "" }

      const { renderServiceReport } = await import("@/lib/pdf/service-report")
      const doc = await renderServiceReport(lucrareForPDF, { logo: logoDataUrl, readOnly, image: loadImageAsJpegDataUrl, revisions: async () => {
        const snap = await getDocs(collection(db, "lucrari", lucrare.id!, "revisions"))
        return snap.docs.map(d => ({id:d.id,...d.data()}))
      } })
      const blob = doc.output("blob")

      console.log("📄 PDF generat cu succes, acum salvez starea în Firestore")
      
      // Mark document as generated and record departure time
      if (lucrare.id && !readOnly) {
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
      // Raport deja existent: permite descărcări repetate (buton „Descarcă raport”).
      if (lucrare.raportGenerat) {
        setHasGenerated(false)
      }
      return blob
    } catch (e) {
      console.error("Error generating PDF:", e)
      toast({ title: "Eroare", description: e instanceof Error ? e.message : "Generare eșuată.", variant: "destructive" })
      onError?.(e instanceof Error ? e : new Error("Generare PDF eșuată."))
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
