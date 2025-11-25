import { jsPDF } from "jspdf"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { drawSimpleHeader, drawFooter, MARGIN, CONTENT_WIDTH } from "./common"
import { ensurePdfFont } from "./font-loader"

type RevisionItem = {
  id: string
  label?: string
  name?: string
  state?: "functional" | "nefunctional" | "na"
  obs?: string
}

type RevisionSection = {
  id: string
  title?: string
  name?: string
  items?: RevisionItem[]
}

type RevisionDoc = {
  id: string
  equipmentId: string
  equipmentName?: string
  sections?: RevisionSection[]
}

// Helper pentru normalizare text cu diacritice corecte
function normalizeTextForPdf(text = ""): string {
  let s = text.normalize("NFC")
  s = s.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
  return s
}

function checkPageBreak(doc: jsPDF, currentY: number, needed: number): number {
  const PH = doc.internal.pageSize.getHeight()
  if (currentY + needed > PH - MARGIN - 30) {
    drawFooter(doc)
    doc.addPage()
    currentY = drawSimpleHeader(doc, {}) // header will be filled by caller at section start
  }
  return currentY
}

export async function generateRevisionOperationsPDF(lucrareId: string): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  let currentY = MARGIN
  await ensurePdfFont(doc)

  // Load lucrare (for client/location context if needed later)
  const workSnap = await getDoc(docRef("lucrari", lucrareId))
  const work = workSnap.exists() ? (workSnap.data() as any) : null

  // Load revisions
  const revCol = collection(db, "lucrari", lucrareId, "revisions")
  const revSnap = await getDocs(revCol)
  const revisions: RevisionDoc[] = revSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  // Draw one page per equipment
  const logoUrl = "/nrglogo.png"
  let logoDataUrl: string | null = null
  try {
    const img = await fetch(logoUrl)
    const blob = await img.blob()
    logoDataUrl = await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(blob)
    })
  } catch {}

  const W = CONTENT_WIDTH

  for (let idx = 0; idx < revisions.length; idx++) {
    const rev = revisions[idx]

    // Header: Lista operațiuni – (Equipment)
    const equipmentLabel =
      rev.equipmentName ||
      (work?.echipament && String(work.echipament)) ||
      (work?.echipamentModel && String(work.echipamentModel)) ||
      String(rev.id)

    currentY = drawSimpleHeader(doc, {
      title: `Lista operațiuni – (${normalizeTextForPdf(equipmentLabel)})`,
      logoDataUrl,
    })

    // Table header
    const rowH = 8
    const firstColW = Math.round(W * 0.58)
    const fnW = 20
    const nfnW = 26
    const obsW = W - firstColW - fnW - nfnW

  // Header band
  doc.setFillColor(220, 227, 240)
  doc.rect(MARGIN, currentY, W, rowH, "F")
  try { doc.setFont("helvetica", "bold") } catch {}
  doc.setFontSize(10).setTextColor(0, 0, 0)
  
  doc.text(normalizeTextForPdf("Punct de control"), MARGIN + 2, currentY + 5)
  doc.text(normalizeTextForPdf("Funcțional"), MARGIN + firstColW + fnW / 2, currentY + 5, { align: "center" } as any)
  doc.text(normalizeTextForPdf("Nefuncțional"), MARGIN + firstColW + fnW + nfnW / 2, currentY + 5, { align: "center" } as any)
  doc.text(normalizeTextForPdf("Obs."), MARGIN + firstColW + fnW + nfnW + 2, currentY + 5)
  
  currentY += rowH

    const sections = Array.isArray(rev.sections) ? rev.sections : []

    // Render sections and items
    for (const s of sections) {
      // Section row (category)
      const sectionTitle = normalizeTextForPdf(s.title || s.name || "Secțiune")
      currentY = checkPageBreak(doc, currentY, rowH)
      doc.setFillColor(240, 240, 240)
      doc.rect(MARGIN, currentY, W, rowH, "F")
      try { doc.setFont("helvetica", "bold") } catch {}
      doc.setFontSize(10).setTextColor(0, 0, 0)
      doc.text(sectionTitle, MARGIN + 2, currentY + 5)
      currentY += rowH

      // Items
      const items = Array.isArray(s.items) ? s.items : []
      try { doc.setFont("helvetica", "normal") } catch {}
      doc.setFontSize(9).setTextColor(0, 0, 0)
      for (const it of items) {
        const label = normalizeTextForPdf(it.label || it.name || "-")
        const state = (it.state || "na") as "functional" | "nefunctional" | "na"
        const obs = normalizeTextForPdf(it.obs || "")

        const heightNeeded = 8
        currentY = checkPageBreak(doc, currentY, heightNeeded)

        // Row borders
        doc.setDrawColor(210, 210, 210).setLineWidth(0.2)
        doc.rect(MARGIN, currentY, W, heightNeeded)

        // First col (punct de control)
        const lines = doc.splitTextToSize(label, firstColW - 4)
        doc.text(lines, MARGIN + 2, currentY + 5)

        // Functional / Nefunctional check marks
        const fnX = MARGIN + firstColW
        const nfnX = MARGIN + firstColW + fnW
        try { doc.setFont("helvetica", "bold") } catch {}
        const markFn = state === "functional" ? "X" : ""
        const markNf = state === "nefunctional" ? "X" : ""
        doc.text(markFn, fnX + fnW / 2, currentY + 5, { align: "center" } as any)
        doc.text(markNf, nfnX + nfnW / 2, currentY + 5, { align: "center" } as any)

        // Obs
        try { doc.setFont("helvetica", "normal") } catch {}
        const obsText = obs ? doc.splitTextToSize(obs, obsW - 4) : []
        if (obsText.length) {
          doc.text(obsText, MARGIN + firstColW + fnW + nfnW + 2, currentY + 5)
        }

        currentY += heightNeeded
      }
    }

    // Footer per page
    drawFooter(doc)
    if (idx < revisions.length - 1) {
      doc.addPage()
      currentY = MARGIN
    }
  }

  return doc.output("blob")
}

function docRef(collectionName: string, id: string) {
  return doc(db, collectionName, id)
}

/**
 * Generate a single‑equipment PDF sheet for a given lucrare and equipmentId.
 */
export async function generateRevisionEquipmentPDF(
  lucrareId: string,
  equipmentId: string
): Promise<Blob> {
  const js = new jsPDF({ unit: "mm", format: "a4" })
  let currentY = MARGIN
  await ensurePdfFont(js)

  // Load single revision
  const revSnap = await getDoc(doc(db, "lucrari", lucrareId, "revisions", equipmentId))
  if (!revSnap.exists()) {
    // Return an empty PDF with a note
    // Try to include logo even for the empty case
    let emptyLogo: string | null = null
    try {
      const resp = await fetch("/nrglogo.png")
      const bl = await resp.blob()
      emptyLogo = await new Promise((resolve) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result as string)
        fr.readAsDataURL(bl)
      })
    } catch {}
    currentY = drawSimpleHeader(js, { title: "Lista operatiuni – (necunoscut)", logoDataUrl: emptyLogo })
    js.setFont("helvetica", "normal").setFontSize(10)
    js.text("Fișa de operatiuni nu a fost găsită pentru acest echipament.", MARGIN + 2, currentY + 4)
    drawFooter(js)
    return js.output("blob")
  }
  const rev = { id: revSnap.id, ...(revSnap.data() as any) } as any

  // Header
  const title = `Lista operațiuni – (${normalizeTextForPdf(rev.equipmentName || equipmentId)})`
  let logoDataUrl: string | null = null
  try {
    const resp = await fetch("/nrglogo.png")
    const bl = await resp.blob()
    logoDataUrl = await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(bl)
    })
  } catch {}
  currentY = drawSimpleHeader(js, { title, logoDataUrl })

  // Table header
  const rowH = 8
  const W = CONTENT_WIDTH
  const firstColW = Math.round(W * 0.58)
  const fnW = 20
  const nfnW = 26
  const obsW = W - firstColW - fnW - nfnW

  js.setFillColor(220, 227, 240)
  js.rect(MARGIN, currentY, W, rowH, "F")
  try { js.setFont("helvetica", "bold") } catch {}
  js.setFontSize(10).setTextColor(0, 0, 0)
  
  js.text(normalizeTextForPdf("Punct de control"), MARGIN + 2, currentY + 5)
  js.text(normalizeTextForPdf("Functional"), MARGIN + firstColW + fnW / 2, currentY + 5, { align: "center" } as any)
  js.text(normalizeTextForPdf("Nefunctional"), MARGIN + firstColW + fnW + nfnW / 2, currentY + 5, { align: "center" } as any)
  js.text(normalizeTextForPdf("Obs."), MARGIN + firstColW + fnW + nfnW + 2, currentY + 5)
  
  currentY += rowH

  const sections = Array.isArray(rev.sections) ? rev.sections : []
  for (const s of sections) {
    const sectionTitle = normalizeTextForPdf(s.title || s.name || "Secțiune")
    currentY = checkPageBreak(js, currentY, rowH)
    js.setFillColor(240, 240, 240)
    js.rect(MARGIN, currentY, W, rowH, "F")
    try { js.setFont("helvetica", "bold") } catch {}
    js.setFontSize(10).setTextColor(0, 0, 0)
    js.text(sectionTitle, MARGIN + 2, currentY + 5)
    currentY += rowH

    const items = Array.isArray(s.items) ? s.items : []
    try { js.setFont("helvetica", "normal") } catch {}
    js.setFontSize(9).setTextColor(0, 0, 0)
    for (const it of items) {
      const label = normalizeTextForPdf(it.label || it.name || "-")
      const state = (it.state || "na") as "functional" | "nefunctional" | "na"
      const obs = normalizeTextForPdf(it.obs || "")

      const heightNeeded = 8
      currentY = checkPageBreak(js, currentY, heightNeeded)

      js.setDrawColor(210, 210, 210).setLineWidth(0.2)
      js.rect(MARGIN, currentY, W, heightNeeded)

      const lines = js.splitTextToSize(label, firstColW - 4)
      js.text(lines, MARGIN + 2, currentY + 5)

      const fnX = MARGIN + firstColW
      const nfnX = MARGIN + firstColW + fnW
      try { js.setFont("helvetica", "bold") } catch {}
      const markFn = state === "functional" ? "X" : ""
      const markNf = state === "nefunctional" ? "X" : ""
      js.text(markFn, fnX + fnW / 2, currentY + 5, { align: "center" } as any)
      js.text(markNf, nfnX + nfnW / 2, currentY + 5, { align: "center" } as any)

      try { js.setFont("helvetica", "normal") } catch {}
      const obsText = obs ? js.splitTextToSize(obs, obsW - 4) : []
      if (obsText.length) {
        js.text(obsText, MARGIN + firstColW + fnW + nfnW + 2, currentY + 5)
      }

      currentY += heightNeeded
    }
  }

  drawFooter(js)
  return js.output("blob")
}


